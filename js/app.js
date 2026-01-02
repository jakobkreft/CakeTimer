
(() => {
  'use strict';

  // ---------- Constants & utils ----------
  const msPerSecond = 1000;
  const msPerMinute = 60 * msPerSecond;
  const msPerHour = 60 * msPerMinute;
  const msPerDay = 24 * msPerHour;

  const MIN_SESSION_MS = 15000;
  const DELETE_THRESH_MS = 5000;
  const DRAG_PX = 6;
  const DRAG_MIN_MS = 1000;

  const EARLY_BIRD_MS = (7 * msPerHour) + (30 * msPerMinute); // 07:30
  const SOLID_HOUR_MS = 60 * msPerMinute;
  const DEEP_WORK_MS = 180 * msPerMinute;

  const tau = Math.PI * 2;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  const fmtHM = (minsFloat) => {
    const total = Math.max(0, minsFloat);
    const h = Math.floor(total / 60);
    const m = Math.floor((total - h * 60) + 1e-6);
    return `${h}h ${m}m`;
  };
  const fmtHMS = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  };
  const fmtClockS = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const todayBounds = (d = new Date()) => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { start, end: start + msPerDay };
  };
  const effectiveEnd = (session, nowMs = Date.now()) => (session.end == null ? nowMs : session.end);
  const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ---------- Color utilities ----------
  const DEFAULT_ACCENT = TagColor.DEFAULT_ACCENT;
  const normalizeTagKey = TagColor.normalizeTagKey;

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255)
    ];
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function decodeTagIdentifier(val) {
    if (typeof val !== 'string') return '';
    try { return decodeURIComponent(val); }
    catch { return val; }
  }

  const COLOR_PICKER_SAT = 0.85;
  const COLOR_PICKER_LIGHT_MIN = 0.2;
  const COLOR_PICKER_LIGHT_RANGE = 0.6;
  function colorForTag(tag, fallbackKey, accentMeta) {
    return TagColor.colorForTag(tag, fallbackKey, accentMeta, state?.tagColors);
  }

  // ---------- Storage ----------
  const STORE_KEY = 'ot.v3.state';
  const SORT_ORDER = ['time-desc', 'time-asc', 'recent-desc', 'recent-asc'];

  function normalizeMeta(meta) {
    const updatedAt = typeof meta?.updatedAt === 'number' ? meta.updatedAt : 0;
    const savedClientId = typeof meta?.clientId === 'string' ? meta.clientId : clientId;
    return { updatedAt, clientId: savedClientId };
  }

  function defaultState() {
    return {
      version: 4,
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
    let base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const s = raw;
    base.sessions = Array.isArray(s.sessions) ? s.sessions : [];
    base.goalMinutes = typeof s.goalMinutes === 'number' ? s.goalMinutes : base.goalMinutes;
    base.theme = (s.theme === 'dark' ? 'dark' : 'light');
    base.breakLogs = Array.isArray(s.breakLogs) ? s.breakLogs : [];
    for (const b of base.breakLogs) { if (typeof b.tagTs !== 'number') b.tagTs = Math.round((b.start + b.end) / 2); }
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
    if (SORT_ORDER.includes(s.tagSortWork)) base.tagSortWork = s.tagSortWork;
    if (SORT_ORDER.includes(s.tagSortBreak)) base.tagSortBreak = s.tagSortBreak;
    base.meta = normalizeMeta(s.meta);
    base.version = 4;
    return base;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      return hydrateState(s);
    } catch { }
    return defaultState();
  }
  function readStoredStateFromValue(rawValue) {
    if (!rawValue) return null;
    try {
      return hydrateState(JSON.parse(rawValue));
    } catch {
      return null;
    }
  }

  function saveState() {
    try {
      state.meta = normalizeMeta(state.meta);
      state.meta.updatedAt = Date.now();
      state.meta.clientId = clientId;
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch { }
  }

  // ---------- State & elements ----------
  const state = loadState();
  const rootEl = document.documentElement;
  function applyTheme() { rootEl.classList.toggle('dark', state.theme === 'dark'); }
  applyTheme();
  const dial = document.getElementById('dial');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DIAL_SIZE = 1000;
  const DIAL_CENTER = DIAL_SIZE / 2;
  const DIAL_RADIUS = DIAL_SIZE * 0.45;
  function createSvgElement(tag) {
    return document.createElementNS(SVG_NS, tag);
  }
  const baseCircle = createSvgElement('circle');
  baseCircle.setAttribute('cx', DIAL_CENTER);
  baseCircle.setAttribute('cy', DIAL_CENTER);
  baseCircle.setAttribute('r', DIAL_RADIUS);
  baseCircle.setAttribute('pointer-events', 'none');

  const progressPath = createSvgElement('path');
  progressPath.setAttribute('pointer-events', 'none');

  const workGroup = createSvgElement('g');
  workGroup.setAttribute('pointer-events', 'none');
  workGroup.setAttribute('fill', 'none');

  const hourGroup = createSvgElement('g');
  hourGroup.setAttribute('pointer-events', 'none');
  hourGroup.setAttribute('fill', 'none');
  hourGroup.setAttribute('stroke-linecap', 'round');
  hourGroup.style.mixBlendMode = 'difference';

  const textGroup = createSvgElement('g');
  textGroup.setAttribute('pointer-events', 'none');
  textGroup.style.mixBlendMode = 'difference';

  function createCenteredText(yOffset) {
    const t = createSvgElement('text');
    t.setAttribute('x', DIAL_CENTER);
    t.setAttribute('y', (DIAL_CENTER + yOffset).toString());
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('fill', '#ffffff');
    t.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace');
    textGroup.appendChild(t);
    return t;
  }
  const workedTextSvg = createCenteredText(0);
  const goalTextSvg = createCenteredText(DIAL_SIZE * 0.055);
  const sessionTextSvg = createCenteredText(DIAL_SIZE * 0.115);
  sessionTextSvg.style.display = 'none';

  dial.appendChild(baseCircle);
  dial.appendChild(progressPath);
  dial.appendChild(workGroup);
  dial.appendChild(hourGroup);
  dial.appendChild(textGroup);

  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    syncFromStorageValue(e.newValue);
  });
  window.addEventListener('focus', syncFromStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromStorage();
  });

  // Side controls
  const toggleBtn = document.getElementById('toggleBtn');
  const resetBtn = document.getElementById('resetBtn');
  const goalText = document.getElementById('goalText');
  const goalMinus = document.getElementById('goalMinus');
  const goalPlus = document.getElementById('goalPlus');

  // Topbar quickbar
  const topToggleBtn = document.getElementById('topToggleBtn');
  const nowClock = document.getElementById('nowClock');
  const runFlag = document.getElementById('runFlag');
  const modeLabel = document.getElementById('modeLabel');   // "SESSION" or "BREAK"
  const modeTimer = document.getElementById('modeTimer');   // HH:MM:SS
  const themeBtn = document.getElementById('themeBtn');

  const streakLine = document.getElementById('streakLine');
  const welcomeEl = document.getElementById('welcome');
  const badgesRow = document.getElementById('badgesRow');
  const tagsWorkUL = document.getElementById('tagsWork');
  const tagsBreakUL = document.getElementById('tagsBreak');
  const tagSortWorkEl = document.getElementById('tagSortWork');
  const tagSortBreakEl = document.getElementById('tagSortBreak');

  // Tag sort modes: 'time-desc', 'time-asc', 'recent-desc', 'recent-asc'
  const SORT_LABELS = { 'time-desc': '↓TIME', 'time-asc': '↑TIME', 'recent-desc': '↓RECENT', 'recent-asc': '↑RECENT' };
  function syncSortLabels() {
    if (tagSortWorkEl) tagSortWorkEl.textContent = SORT_LABELS[state.tagSortWork] || '↓TIME';
    if (tagSortBreakEl) tagSortBreakEl.textContent = SORT_LABELS[state.tagSortBreak] || '↓TIME';
  }
  // Initialize UI labels from persisted state
  syncSortLabels();

  const addTodoBtn = document.getElementById('addTodo');
  const todosUL = document.getElementById('todosList');

  const infoPanel = document.getElementById('infoPanel');
  const infoCloseBtn = infoPanel ? infoPanel.querySelector('.info-panel__close') : null;
  const infoTriggers = Array.from(document.querySelectorAll('[data-info-trigger]'));
  let infoReturnFocus = null;
  let savedBodyOverflow = null;

  function setInfoExpanded(expanded) {
    infoTriggers.forEach(btn => btn.setAttribute('aria-expanded', expanded ? 'true' : 'false'));
  }

  function openInfo(trigger) {
    if (!infoPanel || !infoPanel.hidden) return;
    infoReturnFocus = trigger || null;
    infoPanel.hidden = false;
    setInfoExpanded(true);
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    infoPanel.focus({ preventScroll: true });
  }

  function closeInfo() {
    if (!infoPanel || infoPanel.hidden) return;
    infoPanel.hidden = true;
    setInfoExpanded(false);
    document.body.style.overflow = savedBodyOverflow || '';
    savedBodyOverflow = null;
    if (infoReturnFocus) infoReturnFocus.focus();
    infoReturnFocus = null;
  }

  if (infoPanel) {
    infoPanel.setAttribute('tabindex', '-1');
    infoPanel.addEventListener('click', (e) => { if (e.target === infoPanel) closeInfo(); });
  }

  if (infoCloseBtn) infoCloseBtn.addEventListener('click', closeInfo);
  infoTriggers.forEach(btn => btn.addEventListener('click', () => {
    if (!infoPanel) return;
    if (infoPanel.hidden) openInfo(btn);
    else closeInfo();
  }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && infoPanel && !infoPanel.hidden) {
      e.preventDefault();
      closeInfo();
    }
  });



  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.style.display = 'none'; document.body.appendChild(tip);

  const colorPicker = document.createElement('div');
  colorPicker.className = 'color-picker';
  colorPicker.hidden = true;
  const colorGradient = document.createElement('div');
  colorGradient.className = 'color-picker-gradient';
  const colorActions = document.createElement('div');
  colorActions.className = 'color-picker-actions';
  const autoColorBtn = document.createElement('button');
  autoColorBtn.type = 'button';
  autoColorBtn.className = 'color-picker-auto';
  autoColorBtn.textContent = 'Auto color';
  colorActions.appendChild(autoColorBtn);
  colorPicker.appendChild(colorGradient);
  colorPicker.appendChild(colorActions);
  document.body.appendChild(colorPicker);

  function applyColorPickerGradient() {
    const steps = 24;
    const stops = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const hue = ratio * 360;
      const lightness = COLOR_PICKER_LIGHT_MIN + COLOR_PICKER_LIGHT_RANGE * 0.6;
      const [r, g, b] = hslToRgb(hue, COLOR_PICKER_SAT, lightness);
      stops.push(`${rgbToHex(r, g, b)} ${ratio * 100}%`);
    }
    const hueGradient = `linear-gradient(90deg, ${stops.join(', ')})`;
    const shadowGradient = 'linear-gradient(to top, rgba(0,0,0,0.45), rgba(0,0,0,0))';
    const highlightGradient = 'linear-gradient(to bottom, rgba(255,255,255,0.5), rgba(255,255,255,0))';
    colorGradient.style.backgroundImage = `${shadowGradient}, ${highlightGradient}, ${hueGradient}`;
  }
  applyColorPickerGradient();

  let colorPickerState = { tag: null, tagKey: null };

  function closeColorPicker() {
    if (colorPicker.hidden) return;
    colorPicker.hidden = true;
    colorPickerState = { tag: null, tagKey: null };
  }

  function openColorPicker(tag, anchorEl) {
    const key = normalizeTagKey(tag);
    if (!key) return;
    colorPickerState = { tag, tagKey: key };
    const rect = anchorEl.getBoundingClientRect();
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const pickerWidth = 220;
    let left = rect.left + scrollX + rect.width / 2 - pickerWidth / 2;
    const viewportLeft = scrollX + 8;
    const viewportRight = scrollX + window.innerWidth - pickerWidth - 8;
    if (left < viewportLeft) left = viewportLeft;
    if (left > viewportRight) left = viewportRight;
    const top = rect.bottom + scrollY + 8;
    colorPicker.style.left = `${left}px`;
    colorPicker.style.top = `${top}px`;
    colorPicker.hidden = false;
  }

  function setTagColorOverride(tagKey, color) {
    if (!tagKey) return;
    if (!state.tagColors) state.tagColors = {};
    if (color) {
      state.tagColors[tagKey] = color;
    } else {
      delete state.tagColors[tagKey];
    }
    TagColor.clearCache();
    saveState();
    requestDraw();
    updateTagsPanel();
  }

  colorGradient.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!colorPickerState.tagKey) {
      closeColorPicker();
      return;
    }
    const rect = colorGradient.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      closeColorPicker();
      return;
    }
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const hue = x * 360;
    const lightness = COLOR_PICKER_LIGHT_MIN + (1 - y) * COLOR_PICKER_LIGHT_RANGE;
    const [r, g, b] = hslToRgb(hue, COLOR_PICKER_SAT, lightness);
    const hex = rgbToHex(r, g, b);
    setTagColorOverride(colorPickerState.tagKey, hex);
    closeColorPicker();
  });

  autoColorBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (colorPickerState.tagKey) {
      const accentValue = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || DEFAULT_ACCENT;
      const accentMeta = TagColor.resolveAccentMeta(accentValue);
      const currentColor = colorForTag(colorPickerState.tagKey, colorPickerState.tagKey, accentMeta);
      let nextColor = TagColor.randomColor(accentMeta);
      for (let i = 0; i < 4 && nextColor === currentColor; i++) {
        nextColor = TagColor.randomColor(accentMeta);
      }
      setTagColorOverride(colorPickerState.tagKey, nextColor);
    }
    closeColorPicker();
  });

  document.addEventListener('click', (e) => {
    if (colorPicker.hidden) return;
    if (colorPicker.contains(e.target)) return;
    if (e.target.closest('.tag-swatch')) return;
    closeColorPicker();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeColorPicker();
  });

  window.addEventListener('resize', closeColorPicker);
  window.addEventListener('scroll', closeColorPicker, true);

  function applyState(next) {
    if (!next) return;
    state.version = next.version;
    state.sessions = next.sessions;
    state.breakLogs = next.breakLogs;
    state.goalMinutes = next.goalMinutes;
    state.theme = next.theme;
    state.streak = next.streak || defaultState().streak;
    state.badges = next.badges;
    state.tagColors = next.tagColors || {};
    state.todos = next.todos || [];
    state.ignoredDays = next.ignoredDays || [];
    state.tagSortWork = next.tagSortWork;
    state.tagSortBreak = next.tagSortBreak;
    state.meta = normalizeMeta(next.meta);
    applyTheme();
    syncSortLabels();
    TagColor.clearCache();
    closeColorPicker();
    updateStreakUI();
    updateTagsPanel();
    updateWelcome();
    requestDraw();
  }

  function syncFromStorageValue(rawValue) {
    const incoming = readStoredStateFromValue(rawValue);
    if (!incoming) return;
    const currentUpdatedAt = state.meta?.updatedAt || 0;
    if ((incoming.meta?.updatedAt || 0) > currentUpdatedAt) {
      applyState(incoming);
    }
  }

  function syncFromStorage() {
    try {
      syncFromStorageValue(localStorage.getItem(STORE_KEY));
    } catch { }
  }

  // ---------- First-open-of-day streak handling ----------
  (function handleDailyStreak() {
    const today = ymd(new Date());
    const last = state.streak.lastDay;
    if (last !== today) {
      if (last) {
        const lastDate = new Date(last);
        const diff = Math.round((todayBounds().start - todayBounds(lastDate).start) / msPerDay);
        state.streak.current = (diff === 1) ? (state.streak.current || 0) + 1 : 1;
      } else {
        state.streak.current = 1;
      }
      state.streak.best = Math.max(state.streak.best || 0, state.streak.current);
      state.streak.lastDay = today;
      saveState();
    }
    updateStreakUI();
  })();

  // ---------- Welcome prompt (shown until work starts today) ----------
  function updateWelcome() {
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const segs = segmentsForDay(dayStart, nowMs, state.sessions);
    const hasWorkToday = segs.length > 0;
    if (hasWorkToday) {
      welcomeEl.hidden = true;
      return;
    }
    // Check for any past-day history
    const hasPastHistory = state.sessions.some(s => effectiveEnd(s, nowMs) < dayStart);
    welcomeEl.textContent = hasPastHistory ? 'WELCOME BACK!' : 'WELCOME!';
    welcomeEl.hidden = false;
  }
  updateWelcome();

  function updateStreakUI() {
    streakLine.textContent = `STREAK: ${state.streak.current || 0} • BEST: ${state.streak.best || 0}`;
  }

  // ---------- Session helpers ----------
  function isRunning() { const last = state.sessions[state.sessions.length - 1]; return !!(last && last.end == null); }

  function startSession() {
    if (isRunning()) return;
    state.sessions.push({ start: Date.now(), end: null });
    assignDefaultSessionNamesForToday();
    realignBreakLogsForToday();
    saveState();
    announce('Started'); requestDraw(); updateTagsPanel(); updateWelcome();
  }

  function stopSession() {
    if (!isRunning()) return;
    const last = state.sessions[state.sessions.length - 1];
    const now = Date.now();
    if (now - last.start < MIN_SESSION_MS) {
      state.sessions.pop();
    } else {
      last.end = now;
    }
    realignBreakLogsForToday();
    saveState();
    announce('Stopped'); requestDraw(); updateTagsPanel(); updateWelcome();
  }

  function clearToday() {
    const { start, end } = todayBounds(new Date());
    const nowMs = Date.now();
    if (isRunning()) stopSession();
    const next = [];
    for (const sess of state.sessions) {
      const s = sess.start, e = effectiveEnd(sess, nowMs);
      if (e <= start || s >= end) next.push(sess);
      else {
        if (s < start) next.push({ start: s, end: start, tag: sess.tag });
        if (e > end) next.push({ start: end, end: e, tag: sess.tag });
      }
    }
    state.sessions = next;
    state.breakLogs = state.breakLogs.filter(b => b.end <= start || b.start >= end);
    removeAllBadgesForDay(ymd(new Date(start)));
    saveState(); announce('Cleared today'); requestDraw(); updateTagsPanel(); updateWelcome();
  }

  function setGoal(mins) { state.goalMinutes = clamp(Math.round(mins), 0, 24 * 60); saveState(); requestDraw(); }
  function toggleTheme() {
    state.theme = (state.theme === 'dark') ? 'light' : 'dark';
    applyTheme();
    TagColor.clearCache();
    saveState();
    requestDraw();
    updateTagsPanel();
    closeColorPicker();
  }

  // Graceful stop on close
  let _closingHandled = false;
  function stopIfClosing() {
    if (_closingHandled) return;
    _closingHandled = true;
    if (isRunning()) {
      const last = state.sessions[state.sessions.length - 1];
      const now = Date.now();
      if (now - last.start < MIN_SESSION_MS) state.sessions.pop();
      else last.end = now;
    }
    saveState();
  }
  window.addEventListener('pagehide', stopIfClosing, { capture: true });
  window.addEventListener('beforeunload', stopIfClosing, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') saveState(); });

  const statusEl = document.getElementById('status');
  function announce(msg) { statusEl.textContent = msg; }

  // ---------- Geometry ----------
  const tau2 = Math.PI * 2;
  function polarToCartesian(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }
  const fullCirclePath = (() => {
    const cx = DIAL_CENTER, cy = DIAL_CENTER, r = DIAL_RADIUS;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  })();
  function slicePath(startAngle, endAngle) {
    let delta = endAngle - startAngle;
    while (delta < 0) delta += tau2;
    if (delta < 1e-4) return '';
    if (Math.abs(delta - tau2) < 1e-4) return fullCirclePath;
    const start = polarToCartesian(DIAL_CENTER, DIAL_CENTER, DIAL_RADIUS, startAngle);
    const end = polarToCartesian(DIAL_CENTER, DIAL_CENTER, DIAL_RADIUS, endAngle);
    const largeArc = delta > Math.PI ? 1 : 0;
    return `M ${DIAL_CENTER} ${DIAL_CENTER} L ${start.x} ${start.y} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }
  function angleFromPoint(x, y, cx, cy) { let a = Math.atan2(y - cy, x - cx); a -= (-Math.PI / 2); return (a % tau2 + tau2) % tau2; }
  function angleFromTime(ms, dayStart) { const seconds = (ms - dayStart) / 1000; return (seconds / 86400) * tau2; }
  function timeFromAngle(theta, dayStart) { const seconds = theta / tau2 * 86400; return dayStart + Math.round(seconds) * 1000; }

  // ---------- Preview sessions while dragging ----------
  let drag = null; // { segIndex, edge, dayStart, sessionIndex, isRunning, origStart, origEnd, curStart, curEnd }
  function getSessionsForCalc() {
    if (!drag) return state.sessions;
    const arr = state.sessions.slice();
    arr[drag.sessionIndex] = { start: drag.curStart, end: drag.curEnd, tag: state.sessions[drag.sessionIndex].tag };
    return arr;
  }

  // ---------- Build today's raw segments ----------
  function segmentsForDay(dayStart, nowMs = Date.now(), sessions = state.sessions) {
    const dayEnd = dayStart + msPerDay;
    const segs = [];
    sessions.forEach((sess, i) => {
      const s = sess.start, e = effectiveEnd(sess, nowMs);
      if (e <= dayStart || s >= dayEnd) return;
      const a = Math.max(s, dayStart), b = Math.min(e, dayEnd);
      if (b > a) segs.push({ startMs: a, endMs: b, sessionIndex: i, tag: sess.tag || null });
    });
    segs.sort((a, b) => a.startMs - b.startMs);
    return segs;
  }
  function gapsForDay(dayStart, segs) {
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;
    const clampEnd = Math.min(nowMs, dayEnd);
    const gaps = [];
    let cursor = dayStart;
    for (const seg of segs) {
      if (seg.startMs > cursor) gaps.push({ startMs: cursor, endMs: Math.min(seg.startMs, clampEnd) });
      cursor = Math.max(cursor, seg.endMs);
      if (cursor >= clampEnd) break;
    }
    if (cursor < clampEnd) gaps.push({ startMs: cursor, endMs: clampEnd });
    return gaps;
  }

  // ---------- Default session names (today) ----------
  function assignDefaultSessionNamesForToday() {
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const todaySessions = state.sessions
      .map((s, i) => ({ s, i }))
      .filter(x => effectiveEnd(x.s, nowMs) > dayStart && x.s.start < dayStart + msPerDay)
      .sort((a, b) => (Math.max(a.s.start, dayStart) - Math.max(b.s.start, dayStart)));

    const re = /^Session\s+(\d+)\b/i;
    let usedMax = 0; const usedNums = new Set();
    todaySessions.forEach(({ s }) => {
      if (typeof s.tag === 'string') {
        const m = s.tag.match(re);
        if (m) { const n = parseInt(m[1], 10); if (!isNaN(n)) { usedNums.add(n); usedMax = Math.max(usedMax, n); } }
      }
    });

    let changed = false, nextNum = usedMax;
    for (const { s, i } of todaySessions) {
      if (!s.tag || s.tag.trim() === '') {
        let candidate = nextNum + 1; while (usedNums.has(candidate)) candidate++;
        nextNum = candidate; usedNums.add(candidate);
        state.sessions[i].tag = `Session ${candidate}`;
        changed = true;
      }
    }
    if (changed) saveState();
  }

  // ---------- Break logs realignment ----------
  function realignBreakLogsForToday() {
    const { start: dayStart } = todayBounds(new Date());
    const segs = segmentsForDay(dayStart, Date.now(), state.sessions);
    const gaps = gapsForDay(dayStart, segs);

    let changed = false;
    for (let i = state.breakLogs.length - 1; i >= 0; i--) {
      const b = state.breakLogs[i];
      if (typeof b.tagTs !== 'number') b.tagTs = Math.round((b.start + b.end) / 2);
      if (b.tagTs < dayStart || b.tagTs > Math.min(Date.now(), dayStart + msPerDay)) continue;

      const gap = gaps.find(g => b.tagTs >= g.startMs && b.tagTs <= g.endMs);
      if (gap) {
        if (b.start !== gap.startMs || b.end !== gap.endMs) {
          b.start = gap.startMs; b.end = gap.endMs; changed = true;
        }
      } else {
        state.breakLogs.splice(i, 1);
        changed = true;
      }
    }
    if (changed) saveState();
  }

  function preciseWorkedSeconds(dayStart) {
    const dayEnd = dayStart + msPerDay;
    let total = 0; const nowMs = Date.now();
    for (const sess of state.sessions) {
      const s = sess.start, e = effectiveEnd(sess, nowMs);
      const a = Math.max(s, dayStart), b = Math.min(e, dayEnd);
      if (b > a) total += (b - a) / 1000;
    }
    return total;
  }

  // ---------- Hover + click/drag intent ----------
  let hover = { segIndex: -1, theta: 0, nearEdge: null };
  let dragCandidate = null;
  let clickPending = false;
  let downXY = { x: 0, y: 0 };
  let hoverDial = false;

  function findHover(x, y, unitsPerPixel) {
    const cx = DIAL_CENTER;
    const cy = DIAL_CENTER;
    const R = DIAL_RADIUS;
    const theta = angleFromPoint(x, y, cx, cy);
    const { start: dayStart } = todayBounds(new Date());
    const segs = segmentsForDay(dayStart, Date.now(), getSessionsForCalc());
    const threshold = (8 * unitsPerPixel) / R;
    let segIndex = -1, nearEdge = null;
    for (let i = 0; i < segs.length; i++) {
      const a0 = angleFromTime(segs[i].startMs, dayStart);
      const a1 = angleFromTime(segs[i].endMs, dayStart);
      if (theta >= a0 && theta <= a1) {
        segIndex = i;
        const ds = Math.abs(theta - a0), de = Math.abs(theta - a1);
        if (Math.min(ds, de) < threshold) nearEdge = (ds < de) ? 'start' : 'end';
        break;
      }
    }
    if (segIndex >= 0 && nearEdge === 'end') {
      const sess = state.sessions[segs[segIndex].sessionIndex];
      if (sess && sess.end == null) nearEdge = null;
    }
    hover = { segIndex, theta, nearEdge };
    updateCursor();
    return { segIndex, theta, nearEdge, segs, R, cx, cy, dayStart };
  }
  function updateCursor() {
    dial.classList.remove('edge-resize', 'segment-hover', 'dragging');
    if (drag) dial.classList.add('dragging');
    else if (hover.segIndex >= 0 && hover.nearEdge) dial.classList.add('edge-resize');
    else if (hover.segIndex >= 0) dial.classList.add('segment-hover');
  }

  function cappedEdgeTime(segIndex, edge, desiredTime, dayStart) {
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;
    const segs = segmentsForDay(dayStart, nowMs, getSessionsForCalc());
    const seg = segs[segIndex];
    if (!seg) return desiredTime;
    let minT, maxT;
    if (edge === 'start') {
      minT = dayStart;
      if (segIndex > 0) minT = Math.max(minT, segs[segIndex - 1].endMs);
      maxT = Math.min(seg.endMs, nowMs);
      return clamp(desiredTime, minT, maxT);
    } else {
      minT = seg.startMs;
      maxT = Math.min(dayEnd, nowMs);
      if (segIndex < segs.length - 1) maxT = Math.min(maxT, segs[segIndex + 1].startMs);
      return clamp(desiredTime, minT, maxT);
    }
  }

  function deleteTodaysSlice(sessionIndex, dayStart) {
    const dayEnd = dayStart + msPerDay;
    const sess = state.sessions[sessionIndex]; if (!sess) return;
    const nowMs = Date.now();
    const s = sess.start, e = effectiveEnd(sess, nowMs);
    if (e <= dayStart || s >= dayEnd) return;
    if (s >= dayStart && e <= dayEnd) { state.sessions.splice(sessionIndex, 1); return; }
    if (s < dayStart && e <= dayEnd) { sess.end = dayStart; return; }
    if (s >= dayStart && e > dayEnd) { sess.start = dayEnd; return; }
    if (s < dayStart && e > dayEnd) { sess.end = dayStart; state.sessions.push({ start: dayEnd, end: e, tag: sess.tag }); return; }
  }

  function updateDragPreview(thetaNew) {
    const desired = timeFromAngle(thetaNew, drag.dayStart);
    const capped = cappedEdgeTime(drag.segIndex, drag.edge, desired, drag.dayStart);
    const nowMs = Date.now();
    if (drag.edge === 'start') {
      const maxStart = (drag.curEnd ?? nowMs) - DRAG_MIN_MS;
      drag.curStart = clamp(capped, drag.dayStart, maxStart);
    } else {
      const minEnd = (drag.curStart + DRAG_MIN_MS);
      const dayEnd = drag.dayStart + msPerDay;
      drag.curEnd = clamp(capped, minEnd, Math.min(dayEnd, nowMs));
    }
    requestDraw();
  }

  // ---------- UI bindings ----------
  themeBtn.addEventListener('click', toggleTheme);
  goalMinus.addEventListener('click', () => setGoal(state.goalMinutes - 30));
  goalPlus.addEventListener('click', () => setGoal(state.goalMinutes + 30));

  // Both Start/Stop buttons behave the same
  function toggleTimer() { isRunning() ? stopSession() : startSession(); }
  toggleBtn.addEventListener('click', toggleTimer);
  topToggleBtn.addEventListener('click', toggleTimer);

  resetBtn.addEventListener('click', () => { if (confirm('Clear ONLY today?')) clearToday(); });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ') { e.preventDefault(); toggleTimer(); }
    else if (key === 'arrowup') setGoal(state.goalMinutes + 30);
    else if (key === 'arrowdown') setGoal(state.goalMinutes - 30);
    else if (key === 'r') location.href = 'review.html';
    else if (key === 't') attemptTagAtHover();
  });

  dial.addEventListener('pointerenter', () => { hoverDial = true; requestDraw(); });
  dial.addEventListener('pointerleave', () => {
    hoverDial = false;
    tip.style.display = 'none'; hover = { segIndex: -1, theta: 0, nearEdge: null }; updateCursor();
    dragCandidate = null; clickPending = false;
    requestDraw();
  });

  // Pointer interactions: drag edges OR click to toggle (inside cake)
  dial.addEventListener('pointermove', (e) => {
    const rect = dial.getBoundingClientRect();
    const unitsPerPixel = DIAL_SIZE / rect.width;
    const x = (e.clientX - rect.left) * unitsPerPixel;
    const y = (e.clientY - rect.top) * unitsPerPixel;
    const res = findHover(x, y, unitsPerPixel);

    const dayStart = res.dayStart;
    const nowMs = Date.now();

    // Tooltip
    if (!drag) {
      if (res.segIndex >= 0) {
        const seg = res.segs[res.segIndex];
        const durMs = Math.max(0, seg.endMs - seg.startMs);
        const sTime = new Date(seg.startMs), eTime = new Date(seg.endMs);
        const tagStr = (seg.tag && seg.tag.trim()) ? seg.tag : '(Session)';
        tip.style.display = 'block'; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`;
        const mins = Math.floor(durMs / 60000), secs = Math.floor((durMs % 60000) / 1000);
        tip.innerHTML = `<b>SESSION</b><br>${fmtTime(sTime)} → ${fmtTime(eTime)}<br>${Math.floor(mins / 60)}h ${mins % 60}m ${secs}s<br>TAG: ${escapeHtml(tagStr)}<br><small>Press <b>T</b> to rename • Drag edge to adjust</small>`;
      } else {
        const t = timeFromAngle(res.theta, dayStart);
        if (t >= dayStart && t <= Math.min(nowMs, dayStart + msPerDay)) {
          const gaps = gapsForDay(dayStart, res.segs);
          const gap = gaps.find(g => t >= g.startMs && t <= g.endMs);
          if (gap) {
            const sTime = new Date(gap.startMs), eTime = new Date(gap.endMs);
            const existing = findBreakLogCovering(gap.startMs, gap.endMs, t);
            const tag = existing?.tag ? `TAG: ${escapeHtml(existing.tag)}<br>` : '';
            tip.style.display = 'block'; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`;
            const durMs = gap.endMs - gap.startMs;
            const mins = Math.floor(durMs / 60000), secs = Math.floor((durMs % 60000) / 1000);
            tip.innerHTML = `<b>BREAK</b><br>${fmtTime(sTime)} → ${fmtTime(eTime)}<br>${Math.floor(mins / 60)}h ${mins % 60}m ${secs}s<br>${tag}<small>Press <b>T</b> to tag</small>`;
          } else tip.style.display = 'none';
        } else {
          tip.style.display = 'none';
        }
      }
    }

    if (dragCandidate) {
      const dx = x - downXY.x, dy = y - downXY.y;
      if (Math.hypot(dx, dy) >= DRAG_PX) {
        const seg = res.segs[dragCandidate.segIndex];
        const sessIdx = seg.sessionIndex;
        const session = state.sessions[sessIdx];
        if (!session) {
          dragCandidate = null;
        } else {
          const isRunning = session.end == null;
          if (isRunning && dragCandidate.edge === 'end') {
            dragCandidate = null;
          } else {
            drag = {
              segIndex: dragCandidate.segIndex,
              edge: dragCandidate.edge,
              dayStart: res.dayStart,
              sessionIndex: sessIdx,
              isRunning,
              origStart: session.start,
              origEnd: session.end,
              curStart: session.start,
              curEnd: isRunning ? null : session.end,
            };
            dial.setPointerCapture(e.pointerId);
            clickPending = false;
          }
        }
      }
    }
    if (drag) {
      tip.style.display = 'none';
      updateDragPreview(res.theta);
    }
  });

  dial.addEventListener('pointerdown', (e) => {
    const rect = dial.getBoundingClientRect();
    const unitsPerPixel = DIAL_SIZE / rect.width;
    const x = (e.clientX - rect.left) * unitsPerPixel;
    const y = (e.clientY - rect.top) * unitsPerPixel;
    const { segIndex, nearEdge } = findHover(x, y, unitsPerPixel);
    downXY = { x, y };
    tip.style.display = 'none';
    clickPending = true;
    dragCandidate = (segIndex >= 0 && nearEdge) ? { segIndex, edge: nearEdge } : null;
  });

  dial.addEventListener('pointerup', (e) => {
    if (drag) {
      const sessionsFinal = getSessionsForCalc();
      const segsFinal = segmentsForDay(drag.dayStart, Date.now(), sessionsFinal);
      const segBySession = segsFinal.find(s => s.sessionIndex === drag.sessionIndex);
      if (!segBySession || (segBySession.endMs - segBySession.startMs) <= DELETE_THRESH_MS) {
        deleteTodaysSlice(drag.sessionIndex, drag.dayStart);
        saveState();
      } else {
        state.sessions[drag.sessionIndex].start = drag.curStart;
        state.sessions[drag.sessionIndex].end = drag.isRunning ? null : drag.curEnd;
        saveState();
      }
      assignDefaultSessionNamesForToday();
      realignBreakLogsForToday();

      dial.releasePointerCapture(e.pointerId);
      drag = null; dragCandidate = null;
      updateCursor(); requestDraw(); updateTagsPanel();
      return;
    }
    // toggle start/stop on click inside cake
    if (clickPending) {
      const rect = dial.getBoundingClientRect();
      const unitsPerPixel = DIAL_SIZE / rect.width;
      const x = (e.clientX - rect.left) * unitsPerPixel;
      const y = (e.clientY - rect.top) * unitsPerPixel;
      const cx = DIAL_CENTER, cy = DIAL_CENTER, R = DIAL_RADIUS;
      if (Math.hypot(x - cx, y - cy) <= R) toggleTimer();
    }
    clickPending = false;
  });

  // Tagging logic (press T)
  function attemptTagAtHover() {
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const segs = segmentsForDay(dayStart, nowMs, getSessionsForCalc());

    if (hover.segIndex >= 0) {
      const seg = segs[hover.segIndex];
      const sessIdx = seg.sessionIndex;
      const current = (state.sessions[sessIdx].tag && state.sessions[sessIdx].tag.trim())
        ? state.sessions[sessIdx].tag
        : state.sessions[sessIdx].tag ?? '';
      const input = prompt('Tag this work session (text):', current);
      if (input !== null) {
        state.sessions[sessIdx].tag = input.trim() || undefined;
        if (!state.sessions[sessIdx].tag) assignDefaultSessionNamesForToday();
        saveState(); updateTagsPanel(); requestDraw();
      }
    } else {
      const theta = hover.theta;
      const t = timeFromAngle(theta, dayStart);
      if (t < dayStart || t > Math.min(nowMs, dayStart + msPerDay)) return;
      const gaps = gapsForDay(dayStart, segs);
      const gap = gaps.find(g => t >= g.startMs && t <= g.endMs);
      if (!gap) return;
      const existing = findBreakLogCovering(gap.startMs, gap.endMs, t);
      const current = existing?.tag || '';
      const input = prompt('Tag this break (text):', current);
      if (input === null) return;
      const val = input.trim();
      if (existing) {
        existing.tag = val || undefined;
        if (!existing.tag) {
          const ix = state.breakLogs.indexOf(existing);
          if (ix >= 0) state.breakLogs.splice(ix, 1);
        } else {
          if (typeof existing.tagTs !== 'number') existing.tagTs = t;
          existing.start = gap.startMs; existing.end = gap.endMs;
        }
      } else if (val) {
        state.breakLogs.push({ start: gap.startMs, end: gap.endMs, tag: val, tagTs: t });
      }
      saveState();
      realignBreakLogsForToday();
      updateTagsPanel(); requestDraw();
    }
  }

  function findBreakLogCovering(gapStart, gapEnd, t) {
    return state.breakLogs.find(b => b.tagTs != null && b.tagTs >= gapStart && b.tagTs <= gapEnd)
      || state.breakLogs.find(b => b.start <= t && b.end >= t && b.start >= gapStart - 1000 && b.end <= gapEnd + 1000);
  }

  // ---------- Topbar helpers ----------
  function lastStopTimeToday(dayStart) {
    const now = Date.now();
    let lastStop = dayStart;
    for (const s of state.sessions) {
      if (s.end != null && s.end <= now && s.end >= dayStart && s.end <= dayStart + msPerDay) {
        if (s.end > lastStop) lastStop = s.end;
      }
    }
    return lastStop;
  }

  function updateTopbarUI(dayStart, running, liveMs) {
    // Current time with seconds
    nowClock.textContent = fmtClockS(new Date());

    // Mirror buttons
    const btnLabel = running ? 'STOP' : 'START';
    topToggleBtn.textContent = btnLabel;
    topToggleBtn.setAttribute('aria-pressed', running ? 'true' : 'false');
    toggleBtn.textContent = btnLabel;
    toggleBtn.setAttribute('aria-pressed', running ? 'true' : 'false');

    if (running) {
      // Show green "WORK TIME!" and make SESSION + timer green too
      runFlag.hidden = false;
      modeLabel.textContent = 'SESSION';
      modeTimer.textContent = fmtHMS(liveMs);
      modeLabel.classList.add('accent');
      modeTimer.classList.add('accent');
    } else {
      // Hide flag and revert SESSION/BREAK color
      runFlag.hidden = true;
      modeLabel.textContent = 'BREAK';
      const since = lastStopTimeToday(dayStart);
      modeTimer.textContent = fmtHMS(Date.now() - since);
      modeLabel.classList.remove('accent');
      modeTimer.classList.remove('accent');
    }
  }


  // ---------- Drawing ----------
  let pendingDraw = false;
  function requestDraw() { if (!pendingDraw) { pendingDraw = true; requestAnimationFrame(drawDial); } }

  function drawDial() {
    pendingDraw = false;

    const styles = getComputedStyle(document.documentElement);
    const ringBg = styles.getPropertyValue('--ring-bg').trim() || '#ffffff';
    const progressFill = styles.getPropertyValue('--progress').trim() || '#e5e7e0';
    const accentFill = styles.getPropertyValue('--accent').trim() || '#16a34a';

    baseCircle.setAttribute('fill', ringBg);

    const rect = dial.getBoundingClientRect();
    const unitsPerPixel = rect.width ? (DIAL_SIZE / rect.width) : 1;
    const pxPerUnit = rect.width ? (rect.width / DIAL_SIZE) : 0;

    const { start: dayStart } = todayBounds(new Date());
    assignDefaultSessionNamesForToday();
    realignBreakLogsForToday();

    const now = Date.now();
    const nowTheta = ((now - dayStart) / msPerDay) * (Math.PI * 2) - Math.PI / 2;
    const progressD = slicePath(-Math.PI / 2, nowTheta);
    if (progressD) {
      progressPath.setAttribute('d', progressD);
      progressPath.setAttribute('fill', progressFill);
      progressPath.style.display = '';
    } else {
      progressPath.removeAttribute('d');
      progressPath.style.display = 'none';
    }

    const segs = segmentsForDay(dayStart, now, getSessionsForCalc());
    const accentMeta = TagColor.resolveAccentMeta(accentFill);
    if (segs.length) {
      const frag = document.createDocumentFragment();
      for (const seg of segs) {
        const startAngle = angleFromTime(seg.startMs, dayStart) - Math.PI / 2;
        const endAngle = angleFromTime(seg.endMs, dayStart) - Math.PI / 2;
        const d = slicePath(startAngle, endAngle);
        if (!d) continue;
        const path = createSvgElement('path');
        const tagForColor = (typeof seg.tag === 'string' && seg.tag.trim()) ? seg.tag.trim() : '';
        const fallbackKey = TagColor.sessionFallbackKey(state.sessions[seg.sessionIndex]?.start ?? seg.startMs);
        const fillColor = colorForTag(tagForColor, fallbackKey, accentMeta);
        path.setAttribute('d', d);
        path.setAttribute('fill', fillColor);
        frag.appendChild(path);
      }
      workGroup.replaceChildren(frag);
    } else {
      workGroup.replaceChildren();
    }

    if (hoverDial) {
      const frag = document.createDocumentFragment();
      for (let hr = 0; hr < 24; hr++) {
        const a = (hr / 24) * (Math.PI * 2) - Math.PI / 2;
        const inner = polarToCartesian(DIAL_CENTER, DIAL_CENTER, DIAL_RADIUS * 0.955, a);
        const outer = polarToCartesian(DIAL_CENTER, DIAL_CENTER, DIAL_RADIUS * 0.985, a);
        const line = createSvgElement('line');
        line.setAttribute('x1', inner.x);
        line.setAttribute('y1', inner.y);
        line.setAttribute('x2', outer.x);
        line.setAttribute('y2', outer.y);
        frag.appendChild(line);
      }
      hourGroup.replaceChildren(frag);
      const renderRadiusPx = DIAL_RADIUS * pxPerUnit;
      const thinPx = Math.max(1, Math.round(renderRadiusPx * 0.006));
      const strokeUnits = thinPx * unitsPerPixel;
      hourGroup.setAttribute('stroke-width', strokeUnits || 1);
      hourGroup.setAttribute('stroke', '#ffffff');
      hourGroup.style.display = '';
    } else {
      hourGroup.replaceChildren();
      hourGroup.style.display = 'none';
    }

    const workedSeconds = preciseWorkedSeconds(dayStart);
    const workedMinutes = workedSeconds / 60;
    const goal = state.goalMinutes;
    const remaining = Math.max(0, goal - workedMinutes);
    const running = isRunning();
    const last = state.sessions[state.sessions.length - 1];
    const liveMs = running && last ? (Date.now() - last.start) : 0;

    const largeSize = DIAL_SIZE * 0.06;
    const smallSize = DIAL_SIZE * 0.026;
    const sessionSize = DIAL_SIZE * 0.03;

    workedTextSvg.textContent = fmtHM(workedMinutes);
    workedTextSvg.setAttribute('font-size', largeSize);
    workedTextSvg.setAttribute('font-weight', '500');

    if (remaining > 0) {
      goalTextSvg.textContent = `${fmtHM(remaining)} TO GOAL`;
    } else {
      goalTextSvg.textContent = 'GOAL REACHED';
    }
    goalTextSvg.setAttribute('font-size', smallSize);
    goalTextSvg.setAttribute('font-weight', '400');

    if (running) {
      sessionTextSvg.textContent = `SESSION ${fmtHMS(liveMs)}`;
      sessionTextSvg.setAttribute('font-size', sessionSize);
      sessionTextSvg.setAttribute('font-weight', '500');
      sessionTextSvg.style.display = '';
    } else {
      sessionTextSvg.style.display = 'none';
    }

    // UI labels + panels
    goalText.textContent = fmtHM(state.goalMinutes);
    recomputeAndSyncTodayBadges(dayStart, workedSeconds);
    renderBadgesRow();
    updateTagsPanel();

    renderTodos();

    // Topbar quickbar
    updateTopbarUI(dayStart, running, liveMs);
    setFaviconMode(running);
  }

  // drive redraws
  setInterval(requestDraw, 500);
  requestDraw();

  function scheduleMidnightSave() {
    const now = Date.now();
    const { end } = todayBounds(new Date());
    const delay = Math.max(1000, end - now + 2000);
    setTimeout(() => {
      // New day: remove yesterday's completed todos from state
      const { start: freshStart } = todayBounds(new Date());
      pruneOldCompletedTodos(freshStart);
      saveState();
      renderTodos();
      scheduleMidnightSave();
    }, delay);
  }
  scheduleMidnightSave();


  // ---------- Badges (award & revoke) ----------
  function computeEligibleBadges(dayStart, workedSeconds) {
    const eligible = new Set();
    const segs = segmentsForDay(dayStart);

    for (const seg of segs) {
      const dur = seg.endMs - seg.startMs;
      if (dur >= SOLID_HOUR_MS) eligible.add('solid-hour');
      if (dur >= DEEP_WORK_MS) eligible.add('deep-work');
      if (eligible.has('solid-hour') && eligible.has('deep-work')) break;
    }

    const firstToday = state.sessions
      .filter(s => s.start >= dayStart && s.start < dayStart + msPerDay)
      .sort((a, b) => a.start - b.start)[0];
    if (firstToday && (firstToday.start - dayStart) < EARLY_BIRD_MS) {
      eligible.add('early-bird');
    }

    const goalSecs = (state.goalMinutes || 0) * 60;
    if (workedSeconds >= goalSecs && goalSecs > 0) eligible.add('goal-complete');

    return eligible;
  }

  function recomputeAndSyncTodayBadges(dayStart, workedSeconds) {
    const dayStr = ymd(new Date(dayStart));
    const eligible = computeEligibleBadges(dayStart, workedSeconds);

    const current = new Set(state.badges.filter(b => b.date === dayStr).map(b => b.id));
    let changed = false;

    // Remove revoked
    if (current.size) {
      const keep = [];
      for (const b of state.badges) {
        if (b.date !== dayStr) { keep.push(b); continue; }
        if (eligible.has(b.id)) keep.push(b);
        else changed = true;
      }
      if (changed) state.badges = keep;
    }
    // Add missing
    for (const id of eligible) {
      if (!current.has(id)) { state.badges.push({ id, date: dayStr }); changed = true; }
    }
    if (state.badges.length > 60) { state.badges.splice(0, state.badges.length - 60); changed = true; }
    if (changed) saveState();
  }

  function removeAllBadgesForDay(dayStr) {
    const orig = state.badges.length;
    state.badges = state.badges.filter(b => b.date !== dayStr);
    if (state.badges.length !== orig) saveState();
  }

  function renderBadgesRow() {
    const label = (id) => (
      id === 'solid-hour' ? 'Solid Hour' :
        id === 'early-bird' ? 'Early Bird' :
          id === 'deep-work' ? 'Deep Work' :
            id === 'goal-complete' ? 'Goal Complete' : id
    );
    const { start } = todayBounds(new Date());
    const dayStr = ymd(new Date(start));
    const order = ['early-bird', 'solid-hour', 'deep-work', 'goal-complete'];

    const todaysMap = new Map();
    for (const b of state.badges) {
      if (b.date === dayStr && !todaysMap.has(b.id)) todaysMap.set(b.id, b);
    }
    const todays = Array.from(todaysMap.values())
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    badgesRow.innerHTML = todays.length
      ? todays.map(b => `<span class="badge-pill">[ ${label(b.id)} ]</span>`).join('')
      : '<span class="badge-pill">[ — ]</span>';
  }

  // ---------- Tags Today panel ----------
  function updateTagsPanel() {
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;

    // Work tags: collect duration and lastUsed per tag
    const workData = new Map(); // tag -> { ms, lastUsed }
    for (const sess of state.sessions) {
      const a = Math.max(sess.start, dayStart);
      const endTime = effectiveEnd(sess, nowMs);
      const b = Math.min(endTime, dayEnd);
      const s = Math.max(0, b - a);
      if (s <= 0) continue;
      const tag = (sess.tag && sess.tag.trim()) ? sess.tag : null;
      if (!tag) continue;
      const existing = workData.get(tag);
      if (existing) {
        existing.ms += s;
        if (endTime > existing.lastUsed) existing.lastUsed = endTime;
      } else {
        workData.set(tag, { ms: s, lastUsed: endTime });
      }
    }
    const accentValue = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || DEFAULT_ACCENT;
    const accentMeta = TagColor.resolveAccentMeta(accentValue);
    renderTagList(tagsWorkUL, workData, accentMeta, true, state.tagSortWork);

    // Break tags: collect duration and lastUsed per tag
    const breakData = new Map(); // tag -> { ms, lastUsed }
    for (const br of state.breakLogs) {
      if (!br.tag) continue;
      const a = Math.max(br.start, dayStart);
      const b = Math.min(br.end, Math.min(nowMs, dayEnd));
      const s = Math.max(0, b - a);
      if (s > 0) {
        const existing = breakData.get(br.tag);
        if (existing) {
          existing.ms += s;
          if (br.end > existing.lastUsed) existing.lastUsed = br.end;
        } else {
          breakData.set(br.tag, { ms: s, lastUsed: br.end });
        }
      }
    }
    renderTagList(tagsBreakUL, breakData, accentMeta, false, state.tagSortBreak);
  }

  function renderTagList(ul, dataMap, accentMeta, colorize = false, sortMode = 'time-desc') {
    const items = Array.from(dataMap.entries())
      .map(([tag, data]) => ({ tag, mins: data.ms / 60000, lastUsed: data.lastUsed }));

    // Apply sort based on sortMode
    if (sortMode === 'time-desc') items.sort((a, b) => b.mins - a.mins);
    else if (sortMode === 'time-asc') items.sort((a, b) => a.mins - b.mins);
    else if (sortMode === 'recent-desc') items.sort((a, b) => b.lastUsed - a.lastUsed);
    else if (sortMode === 'recent-asc') items.sort((a, b) => a.lastUsed - b.lastUsed);

    if (!items.length) {
      ul.innerHTML = `<li><span class="label">—</span><span class="time">0h 0m</span></li>`;
      return;
    }

    ul.innerHTML = items.map(it => {
      const safeTag = escapeHtml(it.tag);
      const encodedTag = encodeURIComponent(it.tag);
      const color = colorize ? colorForTag(it.tag, it.tag, accentMeta) : null;
      const swatch = colorize
        ? `<button type="button" class="tag-swatch" data-tag="${encodedTag}" aria-label="Choose color for ${safeTag}" style="background:${color}"></button>`
        : '';
      return `<li>${swatch}<span class="label" data-tag="${encodedTag}" title="Click to rename">${safeTag}</span><span class="time">${fmtHM(it.mins)}</span></li>`;
    }).join('');
  }

  function renameWorkTag(oldTag, newTag) {
    const { start: dayStart, end } = todayBounds(new Date());
    const nowMs = Date.now();
    let changed = false;

    for (const sess of state.sessions) {
      const sInToday = effectiveEnd(sess, nowMs) > dayStart && sess.start < end;
      if (!sInToday) continue;
      if ((sess.tag || '').trim() === oldTag) {
        if (newTag) {
          sess.tag = newTag;
        } else {
          // clear → default Session N naming will be re-applied
          sess.tag = undefined;
        }
        changed = true;
      }
    }
    if (changed) {
      const oldKey = normalizeTagKey(oldTag);
      const newKey = normalizeTagKey(newTag);
      if (!state.tagColors) state.tagColors = {};
      if (oldKey && state.tagColors[oldKey]) {
        const preserved = state.tagColors[oldKey];
        delete state.tagColors[oldKey];
        if (newKey) state.tagColors[newKey] = preserved;
      }
      if (!newTag) assignDefaultSessionNamesForToday();
      TagColor.clearCache();
      closeColorPicker();
      saveState();
      updateTagsPanel();
      requestDraw();
    }
  }

  function renameBreakTag(oldTag, newTag) {
    const { start: dayStart, end } = todayBounds(new Date());
    let changed = false;

    for (let i = state.breakLogs.length - 1; i >= 0; i--) {
      const b = state.breakLogs[i];
      const inToday = (b.tagTs != null ? (b.tagTs >= dayStart && b.tagTs < end)
        : (b.start >= dayStart && b.start < end));
      if (!inToday) continue;

      if ((b.tag || '').trim() === oldTag) {
        if (newTag) {
          b.tag = newTag;
        } else {
          // empty → remove the tagged break entry
          state.breakLogs.splice(i, 1);
        }
        changed = true;
      }
    }
    if (changed) {
      saveState();
      updateTagsPanel();
      requestDraw();
    }
  }


  // ---------- TODOs ----------
  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  function pruneOldCompletedTodos(dayStart) {
    // Keep incomplete todos always.
    // Keep completed todos only if completed today.
    const before = state.todos.length;
    state.todos = state.todos.filter(t => !t.done || (t.completedAt != null && t.completedAt >= dayStart && t.completedAt < dayStart + msPerDay));
    if (state.todos.length !== before) saveState();
  }

  function addTodoFlow() {
    const text = (prompt('New task:') || '').trim();
    if (!text) return;
    state.todos.push({ id: uid(), text, done: false, created: Date.now() });
    saveState();
    renderTodos();
  }

  function toggleTodoById(id, done) {
    const t = state.todos.find(x => x.id === id);
    if (!t) return;
    t.done = !!done;
    if (t.done) t.completedAt = Date.now();
    else delete t.completedAt;
    saveState();
    renderTodos();
  }

  function renderTodos() {
    const { start: dayStart } = todayBounds(new Date());

    const view = state.todos.filter(t =>
      !t.done || (t.completedAt != null && t.completedAt >= dayStart && t.completedAt < dayStart + msPerDay)
    );

    // Sort: incomplete first (by created), then completed (by completedAt asc)
    view.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.done && !b.done) return (a.created || 0) - (b.created || 0);
      const ac = a.completedAt || 0, bc = b.completedAt || 0;
      return ac - bc;
    });

    todosUL.innerHTML = view.map(t => (
      `<li class="todo-item ${t.done ? 'todo-done' : ''}">
       <input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''} />
       <span class="todo-text" data-id="${t.id}" title="Click to rename">${escapeHtml(t.text)}</span>
     </li>`
    )).join('') || `<li class="todo-item"><span class="todo-text">—</span></li>`;
  }

  function deleteTodoById(id) {
    const idx = state.todos.findIndex(x => x.id === id);
    if (idx >= 0) {
      state.todos.splice(idx, 1);
      saveState();
      renderTodos();
    }
  }


  // Events
  if (addTodoBtn) addTodoBtn.addEventListener('click', addTodoFlow);

  if (todosUL) {
    todosUL.addEventListener('click', (e) => {
      const el = e.target;
      if (el && el.matches('input[type="checkbox"][data-id]')) {
        toggleTodoById(el.getAttribute('data-id'), el.checked);
      }
      if (el && el.matches('.todo-text[data-id]')) {
        const id = el.getAttribute('data-id');
        const t = state.todos.find(x => x.id === id);
        if (!t) return;
        const input = prompt('Rename task:', t.text);
        if (input === null) return; // cancelled
        const val = input.trim();
        if (!val) {
          // empty → delete
          deleteTodoById(id);
        } else {
          t.text = val;
          saveState();
          renderTodos();
        }
      }
    });
  }

  if (tagsWorkUL) {
    tagsWorkUL.addEventListener('click', (e) => {
      const swatch = e.target.closest('.tag-swatch[data-tag]');
      if (swatch) {
        const encoded = swatch.getAttribute('data-tag') || '';
        const tag = decodeTagIdentifier(encoded);
        if (tag) {
          openColorPicker(tag, swatch);
          e.stopPropagation();
          e.preventDefault();
        }
        return;
      }
      const lbl = e.target.closest('.label[data-tag]');
      if (!lbl) return;
      const encoded = lbl.getAttribute('data-tag') || '';
      const oldTag = decodeTagIdentifier(encoded);
      const input = prompt('Rename work tag:', oldTag);
      if (input === null) return; // cancelled
      const newTag = input.trim();
      renameWorkTag(oldTag, newTag);
    });
  }

  if (tagsBreakUL) {
    tagsBreakUL.addEventListener('click', (e) => {
      const lbl = e.target.closest('.label[data-tag]');
      if (!lbl) return;
      const encoded = lbl.getAttribute('data-tag') || '';
      const oldTag = decodeTagIdentifier(encoded);
      const input = prompt('Rename break tag:', oldTag);
      if (input === null) return; // cancelled
      const newTag = input.trim();
      renameBreakTag(oldTag, newTag);
    });
  }

  // Sort toggle handlers
  if (tagSortWorkEl) {
    tagSortWorkEl.addEventListener('click', () => {
      const idx = SORT_ORDER.indexOf(state.tagSortWork);
      state.tagSortWork = SORT_ORDER[(idx + 1) % SORT_ORDER.length];
      tagSortWorkEl.textContent = SORT_LABELS[state.tagSortWork];
      saveState();
      updateTagsPanel();
    });
  }
  if (tagSortBreakEl) {
    tagSortBreakEl.addEventListener('click', () => {
      const idx = SORT_ORDER.indexOf(state.tagSortBreak);
      state.tagSortBreak = SORT_ORDER[(idx + 1) % SORT_ORDER.length];
      tagSortBreakEl.textContent = SORT_LABELS[state.tagSortBreak];
      saveState();
      updateTagsPanel();
    });
  }

  // --- Favicon swapper ---
  let lastFaviconRunning = null;
  function setFaviconMode(running) {
    if (lastFaviconRunning === running) return;
    lastFaviconRunning = running;
    const href = running ? 'assets/favicon1.ico' : 'assets/favicon0.ico';
    const head = document.head;

    // Remove existing icon links so browsers reliably refresh the favicon
    head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());

    // Add fresh icon link (small cache-bust so it updates immediately)
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/x-icon';
    link.href = `${href}?v=${running ? '0' : '1'}`;
    head.appendChild(link);
  }


  // ---------- Helpers ----------
  function escapeHtml(s) { return s ? s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) : s; }
})();
