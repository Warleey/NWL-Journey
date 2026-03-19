'use strict';

/* ─────────────────────────────────────────
   1. CONFIG & CONSTANTS
───────────────────────────────────────── */
const CONFIG = {
  STORAGE_KEY_TASKS:  'taskflow_tasks_v2',
  STORAGE_KEY_XP:     'taskflow_xp_v2',
  STORAGE_KEY_FILTER: 'taskflow_filter',
  STORAGE_KEY_SORT:   'taskflow_sort',
  TOAST_DURATION:     2800,
  XP_PER_TASK: {
    high:   30,
    medium: 20,
    low:    10,
  },
  LEVELS: [
    { name: 'Iniciante',    min: 0,    icon: '🌱' },
    { name: 'Aprendiz',     min: 100,  icon: '📚' },
    { name: 'Desenvolvedor',min: 250,  icon: '💻' },
    { name: 'Hacker',       min: 500,  icon: '🔥' },
    { name: 'Ninja',        min: 800,  icon: '🥷' },
    { name: 'Arquiteto',    min: 1200, icon: '🏛️' },
    { name: 'Lendário',     min: 2000, icon: '⚡' },
    { name: 'Grandmaster',  min: 3500, icon: '🏆' },
  ],
};

/* ─────────────────────────────────────────
   2. STATE
───────────────────────────────────────── */
const State = {
  tasks:        [],
  xp:           0,
  activeFilter: 'all',
  activeSort:   'created',
  toastTimer:   null,
};

/* ─────────────────────────────────────────
   3. STORAGE MODULE
───────────────────────────────────────── */
const Storage = (() => {
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  const load = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  };

  const saveTasks  = ()  => save(CONFIG.STORAGE_KEY_TASKS,  State.tasks);
  const saveXP     = ()  => save(CONFIG.STORAGE_KEY_XP,     State.xp);
  const saveFilter = ()  => save(CONFIG.STORAGE_KEY_FILTER, State.activeFilter);
  const saveSort   = ()  => save(CONFIG.STORAGE_KEY_SORT,   State.activeSort);

  const loadAll = () => {
    State.tasks        = load(CONFIG.STORAGE_KEY_TASKS,  []);
    State.xp           = load(CONFIG.STORAGE_KEY_XP,     0);
    State.activeFilter = load(CONFIG.STORAGE_KEY_FILTER, 'all');
    State.activeSort   = load(CONFIG.STORAGE_KEY_SORT,   'created');
  };

  return { saveTasks, saveXP, saveFilter, saveSort, loadAll };
})();

/* ─────────────────────────────────────────
   4. XP / LEVEL MODULE
───────────────────────────────────────── */
const XPSystem = (() => {
  const getLevelData = (xp) => {
    let current = CONFIG.LEVELS[0];
    let next    = CONFIG.LEVELS[1];
    for (let i = CONFIG.LEVELS.length - 1; i >= 0; i--) {
      if (xp >= CONFIG.LEVELS[i].min) {
        current = CONFIG.LEVELS[i];
        next    = CONFIG.LEVELS[i + 1] || null;
        break;
      }
    }
    return { current, next, levelIndex: CONFIG.LEVELS.indexOf(current) };
  };

  const getProgress = (xp) => {
    const { current, next } = getLevelData(xp);
    if (!next) return 100;
    const range = next.min - current.min;
    const earned = xp - current.min;
    return Math.min(100, Math.round((earned / range) * 100));
  };

  const addXP = (amount, x, y) => {
    const prevLevel = getLevelData(State.xp).levelIndex;
    State.xp += amount;
    Storage.saveXP();
    const newLevel = getLevelData(State.xp).levelIndex;

    // Floating XP label
    spawnXPFloat(`+${amount} XP`, x, y);

    // Level up check
    if (newLevel > prevLevel) {
      const { current } = getLevelData(State.xp);
      UI.updateXPBar();
      setTimeout(() => App.showLevelUp(current), 400);
    } else {
      UI.updateXPBar();
    }
  };

  const removeXP = (amount) => {
    State.xp = Math.max(0, State.xp - amount);
    Storage.saveXP();
    UI.updateXPBar();
  };

  const spawnXPFloat = (text, x, y) => {
    const el = document.createElement('div');
    el.className = 'xp-float-label';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  };

  return { getLevelData, getProgress, addXP, removeXP };
})();

/* ─────────────────────────────────────────
   5. TASK MODULE (CRUD)
───────────────────────────────────────── */
const Tasks = (() => {
  const generateId = () => `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const create = ({ text, priority = 'medium', dueDate = '' }) => ({
    id:        generateId(),
    text:      text.trim(),
    priority,
    dueDate,
    done:      false,
    createdAt: Date.now(),
    xpValue:   CONFIG.XP_PER_TASK[priority] || 20,
  });

  const add = (taskData) => {
    const task = create(taskData);
    State.tasks.unshift(task);
    Storage.saveTasks();
    return task;
  };

  const remove = (id) => {
    const task = getById(id);
    if (!task) return;
    if (task.done) XPSystem.removeXP(task.xpValue);
    State.tasks = State.tasks.filter(t => t.id !== id);
    Storage.saveTasks();
  };

  const toggle = (id, x, y) => {
    const task = getById(id);
    if (!task) return;
    task.done = !task.done;
    if (task.done) {
      XPSystem.addXP(task.xpValue, x, y);
      UI.showToast(`✅ Tarefa concluída! +${task.xpValue} XP`, 'success');
    } else {
      XPSystem.removeXP(task.xpValue);
      UI.showToast('↩️ Tarefa reaberta', 'info');
    }
    Storage.saveTasks();
  };

  const update = (id, newText) => {
    const task = getById(id);
    if (!task) return;
    task.text = newText.trim();
    Storage.saveTasks();
  };

  const clearDone = () => {
    const doneCount = State.tasks.filter(t => t.done).length;
    State.tasks = State.tasks.filter(t => !t.done);
    Storage.saveTasks();
    return doneCount;
  };

  const getById = (id) => State.tasks.find(t => t.id === id);

  return { add, remove, toggle, update, clearDone, getById };
})();

/* ─────────────────────────────────────────
   6. RENDER MODULE
───────────────────────────────────────── */
const Render = (() => {
  // DOM refs (cached once)
  const refs = {};

  const cacheRefs = () => {
    refs.taskList      = document.getElementById('taskList');
    refs.emptyState    = document.getElementById('emptyState');
    refs.taskInput     = document.getElementById('taskInput');
    refs.prioritySelect= document.getElementById('prioritySelect');
    refs.dateInput     = document.getElementById('dateInput');
    refs.charCounter   = document.getElementById('charCounter');
  };

  /* Format date string for display */
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date  = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff  = date - today;
    const days  = Math.round(diff / 86400000);

    const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    let cls = '';
    if (days < 0)     cls = 'overdue';
    else if (days === 0) cls = 'today';
    const prefix = days < 0 ? '⚠️ Vencida · ' : days === 0 ? '📅 Hoje · ' : '📅 ';
    return { label: prefix + label, cls };
  };

  /* Priority label map */
  const PRIORITY_LABELS = { high: '🔴 Alta', medium: '🟡 Média', low: '🟢 Baixa' };

  /* Build a single task item element */
  const buildTaskElement = (task) => {
    const li = document.createElement('li');
    li.classList.add('task-item');
    if (task.done) li.classList.add('done');
    li.dataset.id       = task.id;
    li.dataset.priority = task.priority;

    // Checkbox
    const checkWrap = document.createElement('div');
    checkWrap.className = 'task-check-wrap';
    const check = document.createElement('button');
    check.className = 'task-check' + (task.done ? ' checked' : '');
    check.setAttribute('aria-label', task.done ? 'Marcar como pendente' : 'Marcar como concluída');
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(task.done));
    checkWrap.appendChild(check);

    // Body
    const body = document.createElement('div');
    body.className = 'task-body';

    const textEl = document.createElement('span');
    textEl.className = 'task-text';
    textEl.textContent = task.text;

    const metaEl = document.createElement('div');
    metaEl.className = 'task-meta';

    // Priority badge
    const priBadge = document.createElement('span');
    priBadge.className = `priority-badge ${task.priority}`;
    priBadge.textContent = PRIORITY_LABELS[task.priority];
    metaEl.appendChild(priBadge);

    // Date badge
    if (task.dueDate) {
      const dateInfo = formatDate(task.dueDate);
      if (dateInfo) {
        const dateBadge = document.createElement('span');
        dateBadge.className = `date-badge ${dateInfo.cls}`;
        dateBadge.textContent = dateInfo.label;
        metaEl.appendChild(dateBadge);
      }
    }

    // XP chip
    const xpChip = document.createElement('span');
    xpChip.className = 'xp-chip';
    xpChip.textContent = `+${task.xpValue} XP`;
    metaEl.appendChild(xpChip);

    body.appendChild(textEl);
    body.appendChild(metaEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'task-btn task-btn--edit';
    editBtn.title = 'Editar';
    editBtn.setAttribute('aria-label', 'Editar tarefa');
    editBtn.textContent = '✏️';

    const delBtn = document.createElement('button');
    delBtn.className = 'task-btn task-btn--delete';
    delBtn.title = 'Remover';
    delBtn.setAttribute('aria-label', 'Remover tarefa');
    delBtn.textContent = '🗑️';

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkWrap);
    li.appendChild(body);
    li.appendChild(actions);

    /* ── Item-level events ── */
    // Toggle done
    check.addEventListener('click', (e) => {
      const rect = check.getBoundingClientRect();
      Tasks.toggle(task.id, rect.left + rect.width / 2, rect.top);
      li.classList.toggle('completing');
      setTimeout(() => li.classList.remove('completing'), 500);
      fullRefresh();
    });

    // Delete
    delBtn.addEventListener('click', () => {
      li.classList.add('removing');
      li.addEventListener('animationend', () => {
        Tasks.remove(task.id);
        fullRefresh();
        UI.showToast('🗑️ Tarefa removida', 'error');
      }, { once: true });
    });

    // Edit (inline)
    editBtn.addEventListener('click', () => {
      const currentText = textEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'task-edit-input';
      input.value = currentText;
      input.maxLength = 120;

      body.replaceChild(input, textEl);
      input.focus();
      input.select();
      actions.style.opacity = '1';

      const commit = () => {
        const newText = input.value.trim();
        if (newText && newText !== currentText) {
          Tasks.update(task.id, newText);
          UI.showToast('✏️ Tarefa atualizada', 'info');
        }
        fullRefresh();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { input.blur(); }
        if (e.key === 'Escape') { body.replaceChild(textEl, input); actions.style.opacity = ''; }
      });
    });

    return li;
  };

  /* Filter + Sort tasks */
  const getVisibleTasks = () => {
    let list = [...State.tasks];

    // Filter
    if (State.activeFilter === 'done')    list = list.filter(t => t.done);
    if (State.activeFilter === 'pending') list = list.filter(t => !t.done);

    // Sort
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
    switch (State.activeSort) {
      case 'priority': list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]); break;
      case 'date':     list.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }); break;
      case 'alpha':    list.sort((a, b) => a.text.localeCompare(b.text, 'pt-BR')); break;
      default:         list.sort((a, b) => b.createdAt - a.createdAt); break;
    }

    return list;
  };

  /* Render the full task list */
  const renderList = () => {
    const list = getVisibleTasks();
    refs.taskList.innerHTML = '';

    if (list.length === 0) {
      refs.emptyState.classList.add('visible');
      refs.emptyState.setAttribute('aria-hidden', 'false');
    } else {
      refs.emptyState.classList.remove('visible');
      refs.emptyState.setAttribute('aria-hidden', 'true');
      const fragment = document.createDocumentFragment();
      list.forEach(task => fragment.appendChild(buildTaskElement(task)));
      refs.taskList.appendChild(fragment);
    }
  };

  /* Update char counter */
  const updateCharCounter = (length) => {
    const el = refs.charCounter;
    el.textContent = `${length}/120`;
    el.classList.toggle('warn',  length >= 80 && length < 110);
    el.classList.toggle('limit', length >= 110);
  };

  return { cacheRefs, renderList, updateCharCounter, refs };
})();

/* ─────────────────────────────────────────
   7. FILTER & SORT MODULE
───────────────────────────────────────── */
const FilterSort = (() => {
  const setFilter = (filter) => {
    State.activeFilter = filter;
    Storage.saveFilter();

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    fullRefresh();
  };

  const setSort = (sort) => {
    State.activeSort = sort;
    Storage.saveSort();

    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === sort);
    });

    Render.renderList();
  };

  return { setFilter, setSort };
})();

/* ─────────────────────────────────────────
   8. UI MODULE (toast, progress, counters)
───────────────────────────────────────── */
const UI = (() => {
  const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    clearTimeout(State.toastTimer);
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    State.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, CONFIG.TOAST_DURATION);
  };

  const updateProgress = () => {
    const total = State.tasks.length;
    const done  = State.tasks.filter(t => t.done).length;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

    document.getElementById('progressPct').textContent  = `${pct}%`;
    document.getElementById('progressFill').style.width = `${pct}%`;
    document.getElementById('progressBar').setAttribute('aria-valuenow', pct);

    // Glow dot position
    const glow = document.getElementById('progressGlow');
    glow.style.left    = `calc(${pct}% - 10px)`;
    glow.style.opacity = total > 0 && pct > 0 ? '0.7' : '0';

    document.getElementById('statTotal').textContent   = total === 0 ? '0 tarefas' : `${done} de ${total} tarefa${total !== 1 ? 's' : ''} concluída${done !== 1 ? 's' : ''}`;
    document.getElementById('statDone').textContent    = '';
    document.getElementById('statPending').textContent = `${total - done} pendente${total - done !== 1 ? 's' : ''}`;
  };

  const updateRemaining = () => {
    const pending = State.tasks.filter(t => !t.done).length;
    document.getElementById('remainingCount').textContent =
      pending === 0 ? '🎉 Tudo feito!' : `${pending} restante${pending !== 1 ? 's' : ''}`;
  };

  const updateXPBar = () => {
    const { current, next, levelIndex } = XPSystem.getLevelData(State.xp);
    const pct = XPSystem.getProgress(State.xp);

    document.getElementById('levelBadge').textContent = `Nível ${levelIndex + 1}`;
    document.getElementById('levelName').textContent  = `${current.icon} ${current.name}`;
    document.getElementById('xpBarFill').style.width  = `${pct}%`;

    const xpToNext = next ? `${State.xp} / ${next.min} XP` : `${State.xp} XP ✦`;
    document.getElementById('xpText').textContent = xpToNext;
  };

  const syncFilterButtons = () => {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === State.activeFilter);
    });
  };

  const syncSortButtons = () => {
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sort === State.activeSort);
    });
  };

  return { showToast, updateProgress, updateRemaining, updateXPBar, syncFilterButtons, syncSortButtons };
})();

/* ─────────────────────────────────────────
   HELPER: Full refresh
───────────────────────────────────────── */
function fullRefresh() {
  Render.renderList();
  UI.updateProgress();
  UI.updateRemaining();
}

/* ─────────────────────────────────────────
   9. EVENT MODULE
───────────────────────────────────────── */
const Events = (() => {
  const bindForm = () => {
    const form     = document.getElementById('taskForm');
    const input    = document.getElementById('taskInput');
    const priority = document.getElementById('prioritySelect');
    const dateInp  = document.getElementById('dateInput');

    // Char counter live
    input.addEventListener('input', () => {
      Render.updateCharCounter(input.value.length);
    });

    // Submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();

      if (!text) {
        input.classList.add('error');
        input.addEventListener('animationend', () => input.classList.remove('error'), { once: true });
        UI.showToast('⚠️ Digite uma tarefa antes de adicionar!', 'error');
        input.focus();
        return;
      }

      Tasks.add({ text, priority: priority.value, dueDate: dateInp.value });
      input.value   = '';
      dateInp.value = '';
      priority.value = 'medium';
      Render.updateCharCounter(0);
      fullRefresh();
      UI.showToast('✨ Tarefa adicionada!', 'info');
      input.focus();
    });

    // Enter on input submits
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') form.requestSubmit();
    });
  };

  const bindFilters = () => {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => FilterSort.setFilter(btn.dataset.filter));
    });
  };

  const bindSort = () => {
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => FilterSort.setSort(btn.dataset.sort));
    });
  };

  const bindClearDone = () => {
    document.getElementById('clearDoneBtn').addEventListener('click', () => {
      const count = Tasks.clearDone();
      if (count > 0) {
        fullRefresh();
        UI.showToast(`🧹 ${count} tarefa${count > 1 ? 's' : ''} concluída${count > 1 ? 's' : ''} removida${count > 1 ? 's' : ''}!`, 'info');
      } else {
        UI.showToast('Nenhuma tarefa concluída para remover.', 'info');
      }
    });
  };

  const bindKeyboard = () => {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter → focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        document.getElementById('taskInput').focus();
      }
    });
  };

  const bindAll = () => {
    bindForm();
    bindFilters();
    bindSort();
    bindClearDone();
    bindKeyboard();
  };

  return { bindAll };
})();

/* ─────────────────────────────────────────
   10. APP INIT + PUBLIC API
───────────────────────────────────────── */
const App = {
  init() {
    Storage.loadAll();
    Render.cacheRefs();
    Events.bindAll();
    UI.syncFilterButtons();
    UI.syncSortButtons();
    UI.updateXPBar();
    fullRefresh();

    // Set min date to today for the date picker
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateInput').setAttribute('min', today);

    // Update footer year automatically
    document.getElementById('footerYear').textContent = new Date().getFullYear();

    console.log('%c🚀 Levora loaded!', 'color:#AFF445;font-weight:bold;font-size:14px;');
  },

  showLevelUp(levelData) {
    document.getElementById('levelUpName').textContent = `${levelData.icon} ${levelData.name}`;
    const overlay = document.getElementById('levelUpOverlay');
    overlay.classList.add('show');
    overlay.removeAttribute('aria-hidden');
    document.getElementById('levelBadge').textContent =
      `Nível ${CONFIG.LEVELS.indexOf(levelData) + 1}`;
    UI.showToast(`🏆 Nível acima! Você é agora ${levelData.icon} ${levelData.name}!`, 'xp');
  },

  closeLevelUp() {
    const overlay = document.getElementById('levelUpOverlay');
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  },
};

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => App.init());
