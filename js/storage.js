(() => {
  'use strict';

  const STORE_KEY = 'ot.v3.state';
  const VERSION = 4;
  const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const normalizeTagKey = (window.TagColor && typeof window.TagColor.normalizeTagKey === 'function')
    ? window.TagColor.normalizeTagKey
    : (tag) => (typeof tag === 'string' && tag.trim() ? tag.trim().toLowerCase() : '');

  function normalizeMeta(meta) {
    const updatedAt = typeof meta?.updatedAt === 'number' ? meta.updatedAt : 0;
    const savedClientId = typeof meta?.clientId === 'string' ? meta.clientId : clientId;
    return { updatedAt, clientId: savedClientId };
  }

  function defaultState() {
    return {
      version: VERSION,
      sessions: [],
      breakLogs: [],
      goalMinutes: 240,
      theme: 'light',
      streak: { current: 0, best: 0, lastDay: null },
      badges: [],
      tagColors: {},
      todos: [],
      ignoredDays: [],
      meta: normalizeMeta(),
      tagSortWork: 'time-desc',
      tagSortBreak: 'time-desc'
    };
  }

  function hydrateState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const s = raw;
    base.sessions = Array.isArray(s.sessions) ? s.sessions : [];
    base.goalMinutes = typeof s.goalMinutes === 'number' ? s.goalMinutes : base.goalMinutes;
    base.theme = (s.theme === 'dark' ? 'dark' : 'light');
    base.breakLogs = Array.isArray(s.breakLogs) ? s.breakLogs : [];
    for (const b of base.breakLogs) {
      if (typeof b.tagTs !== 'number') b.tagTs = Math.round((b.start + b.end) / 2);
    }
    base.streak = s.streak && typeof s.streak === 'object' ? s.streak : base.streak;
    base.badges = Array.isArray(s.badges) ? s.badges : [];
    if (s.tagColors && typeof s.tagColors === 'object') {
      base.tagColors = {};
      for (const [k, v] of Object.entries(s.tagColors)) {
        if (typeof v !== 'string' || !v) continue;
        const nk = normalizeTagKey(k);
        if (nk) base.tagColors[nk] = v;
      }
    }
    base.todos = Array.isArray(s.todos) ? s.todos : [];
    if (Array.isArray(s.ignoredDays)) {
      base.ignoredDays = s.ignoredDays.filter(day => typeof day === 'string' && day.trim());
    }
    if (s.tagSortWork === 'time-desc' || s.tagSortWork === 'time-asc'
      || s.tagSortWork === 'recent-desc' || s.tagSortWork === 'recent-asc') {
      base.tagSortWork = s.tagSortWork;
    }
    if (s.tagSortBreak === 'time-desc' || s.tagSortBreak === 'time-asc'
      || s.tagSortBreak === 'recent-desc' || s.tagSortBreak === 'recent-asc') {
      base.tagSortBreak = s.tagSortBreak;
    }
    base.meta = normalizeMeta(s.meta);
    base.version = VERSION;
    return base;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      return hydrateState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function readStateFromValue(rawValue) {
    if (!rawValue) return null;
    try {
      return hydrateState(JSON.parse(rawValue));
    } catch {
      return null;
    }
  }

  function saveState(state) {
    if (!state || typeof state !== 'object') return;
    try {
      state.version = VERSION;
      state.meta = normalizeMeta(state.meta);
      state.meta.updatedAt = Date.now();
      state.meta.clientId = clientId;
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch { }
  }

  window.CakeStorage = {
    STORE_KEY,
    VERSION,
    defaultState,
    normalizeMeta,
    hydrateState,
    loadState,
    readStateFromValue,
    saveState
  };
})();
