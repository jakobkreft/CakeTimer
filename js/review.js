(() => {
  'use strict';

  const STORE_KEY = 'ot.v3.state';
  const msPerSecond = 1000;
  const msPerMinute = 60 * msPerSecond;
  const msPerHour = 60 * msPerMinute;
  const msPerDay = 24 * msPerHour;
  const tau = Math.PI * 2;
  const DEFAULT_ACCENT = TagColor.DEFAULT_ACCENT;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pad = (n) => String(n).padStart(2, '0');
  const escapeHtml = (str) => (str == null ? '' : String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const normalizeTagKey = TagColor.normalizeTagKey;

  const defaultState = {
    sessions: [],
    breakLogs: [],
    goalMinutes: 240,
    theme: 'light',
    tagColors: {},
    todos: [],
    ignoredDays: [],
    meta: { updatedAt: 0, clientId }
  };

  function normalizeMeta(meta) {
    const updatedAt = typeof meta?.updatedAt === 'number' ? meta.updatedAt : 0;
    const savedClientId = typeof meta?.clientId === 'string' ? meta.clientId : clientId;
    return { updatedAt, clientId: savedClientId };
  }

  function hydrateState(raw) {
    const base = { ...defaultState };
    if (!raw || typeof raw !== 'object') return base;
    const parsed = raw;
    if (Array.isArray(parsed.sessions)) base.sessions = normalizeSessions(parsed.sessions);
    if (Array.isArray(parsed.breakLogs)) base.breakLogs = normalizeBreakLogs(parsed.breakLogs);
    if (typeof parsed.goalMinutes === 'number' && !Number.isNaN(parsed.goalMinutes)) {
      base.goalMinutes = parsed.goalMinutes;
    }
    if (typeof parsed.theme === 'string') {
      base.theme = parsed.theme === 'dark' ? 'dark' : 'light';
    }
    if (parsed.tagColors && typeof parsed.tagColors === 'object') {
      base.tagColors = {};
      for (const [rawKey, value] of Object.entries(parsed.tagColors)) {
        const key = normalizeTagKey(rawKey);
        if (!key) continue;
        if (typeof value === 'string' && value.trim()) {
          base.tagColors[key] = value.trim();
        }
      }
    }
    if (Array.isArray(parsed.todos)) base.todos = normalizeTodos(parsed.todos);
    if (Array.isArray(parsed.ignoredDays)) {
      base.ignoredDays = parsed.ignoredDays.filter(day => typeof day === 'string' && day.trim());
    }
    base.meta = normalizeMeta(parsed.meta);
    return base;
  }

  let state = { ...defaultState };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      state = hydrateState(JSON.parse(raw));
    }
  } catch (err) {
    console.error('Unable to parse saved review data', err);
  }

  function saveState() {
    try {
      state.meta = normalizeMeta(state.meta);
      state.meta.updatedAt = Date.now();
      state.meta.clientId = clientId;
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Unable to save review data', err);
    }
  }
  let accentMeta = TagColor.resolveAccentMeta(DEFAULT_ACCENT);
  let breakSwatchColor = '#9ca3af';
  let rootStyles = getComputedStyle(document.documentElement);

  function refreshTheme() {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--accent').trim() || DEFAULT_ACCENT;
    breakSwatchColor = rootStyles.getPropertyValue('--muted').trim() || '#9ca3af';
    accentMeta = TagColor.resolveAccentMeta(accentColor);
    TagColor.clearCache();
  }

  refreshTheme();

  const summarySection = document.getElementById('summarySection');
  const timelineSection = document.getElementById('timelineSection');
  const weeklySection = document.getElementById('weeklySection');
  const monthlySection = document.getElementById('monthlySection');
  const tagSection = document.getElementById('tagSection');
  const breakSection = document.getElementById('breakSection');
  const overviewCards = document.getElementById('overviewCards');
  const dailyList = document.getElementById('dailyList');
  const weeklyStatsRoot = document.getElementById('weeklyStats');
  const monthlyStatsRoot = document.getElementById('monthlyStats');
  const tagStatsRoot = document.getElementById('tagStats');
  const breakStatsRoot = document.getElementById('breakStats');
  const rangeLabelEl = document.getElementById('rangeLabel');
  const emptyState = document.getElementById('reviewEmptyState');
  const activitySection = document.getElementById('activitySection');
  const activitySummary = document.getElementById('activitySummary');
  const activityMonthLabels = document.getElementById('activityMonthLabels');
  const activityGrid = document.getElementById('activityGrid');
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

  const dayMenu = document.createElement('div');
  dayMenu.className = 'day-menu';
  dayMenu.hidden = true;
  const dayMenuIgnoreBtn = document.createElement('button');
  dayMenuIgnoreBtn.type = 'button';
  dayMenuIgnoreBtn.className = 'day-menu-item';
  const dayMenuDeleteBtn = document.createElement('button');
  dayMenuDeleteBtn.type = 'button';
  dayMenuDeleteBtn.className = 'day-menu-item day-menu-item--danger';
  dayMenuDeleteBtn.textContent = 'Delete day…';
  dayMenu.appendChild(dayMenuIgnoreBtn);
  dayMenu.appendChild(dayMenuDeleteBtn);
  document.body.appendChild(dayMenu);

  let dayMenuState = null;

  function isDayIgnored(dayStr) {
    return Array.isArray(state.ignoredDays) && state.ignoredDays.includes(dayStr);
  }

  function setDayIgnored(dayStr, ignored) {
    if (!Array.isArray(state.ignoredDays)) state.ignoredDays = [];
    const idx = state.ignoredDays.indexOf(dayStr);
    if (ignored && idx === -1) state.ignoredDays.push(dayStr);
    if (!ignored && idx !== -1) state.ignoredDays.splice(idx, 1);
    saveState();
  }

  function openDayMenu(day, anchorEl) {
    if (!dayMenu || !anchorEl) return;
    closeDayMenu();
    const dayStr = day.dayStr || ymdFromMs(day.dayStart);
    dayMenuState = { dayStart: day.dayStart, dayStr };
    dayMenuIgnoreBtn.textContent = isDayIgnored(dayStr) ? 'Unignore day' : 'Ignore day';
    const rect = anchorEl.getBoundingClientRect();
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const menuWidth = 180;
    let left = rect.left + scrollX + rect.width / 2 - menuWidth / 2;
    const viewportLeft = scrollX + 8;
    const viewportRight = scrollX + window.innerWidth - menuWidth - 8;
    if (left < viewportLeft) left = viewportLeft;
    if (left > viewportRight) left = viewportRight;
    const top = rect.top + scrollY + rect.height / 2;
    dayMenu.style.left = `${left}px`;
    dayMenu.style.top = `${top}px`;
    dayMenu.hidden = false;
  }

  function closeDayMenu() {
    if (dayMenu.hidden) return;
    dayMenu.hidden = true;
    dayMenuState = null;
  }

  dayMenuIgnoreBtn.addEventListener('click', () => {
    if (!dayMenuState) return;
    const ignored = isDayIgnored(dayMenuState.dayStr);
    setDayIgnored(dayMenuState.dayStr, !ignored);
    closeDayMenu();
    renderAll();
  });

  dayMenuDeleteBtn.addEventListener('click', () => {
    if (!dayMenuState) return;
    const target = { ...dayMenuState };
    closeDayMenu();
    const confirmed = confirm('Delete all sessions, breaks, and completed todos for this day? This cannot be undone.');
    if (!confirmed) return;
    deleteDay(target.dayStart);
    saveState();
    renderAll();
  });

  document.addEventListener('click', (e) => {
    if (dayMenu.hidden) return;
    if (dayMenu.contains(e.target)) return;
    closeDayMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dayMenu.hidden) {
      e.preventDefault();
      closeDayMenu();
    }
  });

  window.addEventListener('resize', closeDayMenu);
  window.addEventListener('scroll', closeDayMenu, true);

  function readStoredStateFromValue(rawValue) {
    if (!rawValue) return null;
    try {
      return hydrateState(JSON.parse(rawValue));
    } catch {
      return null;
    }
  }

  function syncFromStorageValue(rawValue) {
    const incoming = readStoredStateFromValue(rawValue);
    if (!incoming) return;
    const currentUpdatedAt = state.meta?.updatedAt || 0;
    if ((incoming.meta?.updatedAt || 0) > currentUpdatedAt) {
      state = incoming;
      refreshTheme();
      renderAll();
    }
  }

  function syncFromStorage() {
    try {
      syncFromStorageValue(localStorage.getItem(STORE_KEY));
    } catch { }
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    syncFromStorageValue(e.newValue);
  });
  window.addEventListener('focus', syncFromStorage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncFromStorage();
  });

  renderAll();

  function renderAll() {
    closeDayMenu();
    const hasSessions = state.sessions.some((s) => typeof s.start === 'number');
    const hasBreaks = state.breakLogs.some((b) => typeof b.start === 'number');

    if (!hasSessions && !hasBreaks) {
      revealEmpty();
      return;
    }

    const data = buildData(Date.now());

    if (!data.dailyData.length) {
      revealEmpty();
      return;
    }

    if (emptyState && emptyState.parentElement) emptyState.remove();

    if (rangeLabelEl && data.firstActiveDate && data.lastActiveDate) {
      rangeLabelEl.textContent = formatDateRange(data.firstActiveDate, data.lastActiveDate);
    } else if (rangeLabelEl) {
      rangeLabelEl.textContent = '';
    }

    renderOverview(data);
    renderActivityGraph(data);
    renderDailyTimeline(data);
    renderWeekly(data);
    renderMonthly(data);
    renderTagStats(data);
    renderBreakStats(data);
  }

  function revealEmpty() {
    if (summarySection) summarySection.hidden = true;
    if (timelineSection) timelineSection.hidden = true;
    if (weeklySection) weeklySection.hidden = true;
    if (monthlySection) monthlySection.hidden = true;
    if (activitySection) activitySection.hidden = true;
    if (tagSection) tagSection.hidden = true;
    if (breakSection) breakSection.hidden = true;
    if (emptyState) emptyState.hidden = false;
  }

  function deleteDay(dayStart) {
    const dayEnd = dayStart + msPerDay;
    const nowMs = Date.now();

    const nextSessions = [];
    for (const sess of state.sessions) {
      if (!sess || typeof sess.start !== 'number') continue;
      const sessEnd = sess.end == null ? nowMs : sess.end;
      if (sessEnd <= dayStart || sess.start >= dayEnd) {
        nextSessions.push(sess);
        continue;
      }
      if (sess.start < dayStart) {
        nextSessions.push({ start: sess.start, end: dayStart, tag: sess.tag });
      }
      if (sessEnd > dayEnd) {
        nextSessions.push({
          start: dayEnd,
          end: sess.end == null ? null : sess.end,
          tag: sess.tag
        });
      }
    }
    nextSessions.sort((a, b) => a.start - b.start);
    state.sessions = nextSessions;

    const nextBreaks = [];
    for (const br of state.breakLogs) {
      if (!br || typeof br.start !== 'number' || typeof br.end !== 'number') continue;
      if (br.end <= dayStart || br.start >= dayEnd) {
        nextBreaks.push(br);
        continue;
      }
      if (br.start < dayStart) {
        const seg = { ...br, end: dayStart };
        if (typeof seg.tagTs !== 'number' || seg.tagTs < seg.start || seg.tagTs > seg.end) {
          seg.tagTs = Math.round((seg.start + seg.end) / 2);
        }
        nextBreaks.push(seg);
      }
      if (br.end > dayEnd) {
        const seg = { ...br, start: dayEnd };
        if (typeof seg.tagTs !== 'number' || seg.tagTs < seg.start || seg.tagTs > seg.end) {
          seg.tagTs = Math.round((seg.start + seg.end) / 2);
        }
        nextBreaks.push(seg);
      }
    }
    nextBreaks.sort((a, b) => a.start - b.start);
    state.breakLogs = nextBreaks;

    if (Array.isArray(state.todos)) {
      state.todos = state.todos.filter((todo) => {
        if (!todo || !todo.done || typeof todo.completedAt !== 'number') return true;
        return todo.completedAt < dayStart || todo.completedAt >= dayEnd;
      });
    }

    const dayStr = ymdFromMs(dayStart);
    if (Array.isArray(state.ignoredDays)) {
      state.ignoredDays = state.ignoredDays.filter(day => day !== dayStr);
    }
  }

  function normalizeSessions(list) {
    const out = [];
    for (const item of list) {
      if (!item || typeof item.start !== 'number') continue;
      const start = Number(item.start);
      const end = item.end == null ? null : Number(item.end);
      if (Number.isNaN(start)) continue;
      if (end != null && (Number.isNaN(end) || end <= start)) continue;
      const tag = typeof item.tag === 'string' ? item.tag : (item.tag == null ? null : String(item.tag));
      out.push({ start, end, tag });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }

  function normalizeBreakLogs(list) {
    const out = [];
    for (const item of list) {
      if (!item || typeof item.start !== 'number' || typeof item.end !== 'number') continue;
      const start = Number(item.start);
      const end = Number(item.end);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
      const tag = typeof item.tag === 'string' ? item.tag : (item.tag == null ? null : String(item.tag));
      const tagTs = typeof item.tagTs === 'number' ? Number(item.tagTs) : null;
      out.push({ start, end, tag, tagTs });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }

  function normalizeTodos(list) {
    const out = [];
    for (const todo of list) {
      if (!todo || typeof todo !== 'object') continue;
      const normalized = {
        id: todo.id != null ? todo.id : undefined,
        text: typeof todo.text === 'string' ? todo.text : (todo.text == null ? '' : String(todo.text)),
        done: !!todo.done,
        created: typeof todo.created === 'number' && !Number.isNaN(todo.created) ? Number(todo.created) : undefined,
        completedAt: null
      };
      if (normalized.done && typeof todo.completedAt === 'number' && !Number.isNaN(todo.completedAt)) {
        normalized.completedAt = Number(todo.completedAt);
      }
      if (!normalized.done) normalized.completedAt = null;
      out.push(normalized);
    }
    return out;
  }

  function buildData(nowMs) {
    let earliest = Number.POSITIVE_INFINITY;
    state.sessions.forEach((s) => {
      if (typeof s.start === 'number') earliest = Math.min(earliest, s.start);
    });
    state.breakLogs.forEach((b) => {
      if (typeof b.start === 'number') earliest = Math.min(earliest, b.start);
      if (typeof b.tagTs === 'number') earliest = Math.min(earliest, b.tagTs);
    });
    state.todos.forEach((todo) => {
      if (!todo || !todo.done || typeof todo.completedAt !== 'number') return;
      if (!Number.isNaN(todo.completedAt)) earliest = Math.min(earliest, todo.completedAt);
    });
    if (!Number.isFinite(earliest)) earliest = nowMs;

    const firstDayStart = startOfDayMs(earliest);
    const lastDayStart = startOfDayMs(nowMs);
    const goalMs = Number.isFinite(state.goalMinutes) ? Math.max(0, state.goalMinutes) * msPerMinute : 0;
    const ignoredSet = new Set(Array.isArray(state.ignoredDays) ? state.ignoredDays : []);

    const dailyData = [];
    const weeklyMap = new Map();
    const monthlyMap = new Map();
    const tagTotals = new Map();
    const breakTagTotals = new Map();

    let totalWorkMs = 0;
    let totalBreakMs = 0;
    let totalTaggedBreakMs = 0;
    let totalTodosCompleted = 0;
    let totalSessions = 0;
    let activeDays = 0;
    let goalHits = 0;
    let longestSession = { ms: 0, date: null, tag: null };
    let longestDay = { ms: 0, date: null };
    let firstActiveDate = null;
    let lastActiveDate = null;

    for (let dayStart = firstDayStart; dayStart <= lastDayStart; dayStart += msPerDay) {
      const dayStr = ymdFromMs(dayStart);
      const ignored = ignoredSet.has(dayStr);
      const day = buildDay(dayStart, nowMs, goalMs, ignored, dayStr);
      if (!day) continue;

      dailyData.push(day);
      if (!firstActiveDate) firstActiveDate = day.date;
      lastActiveDate = day.date;

      const weekKey = startOfWeekMs(day.dayStart);
      let week = weeklyMap.get(weekKey);
      if (!week) {
        const startDate = new Date(weekKey);
        const { week: isoWeek, year: isoYear } = getISOWeek(startDate);
        week = {
          startMs: weekKey,
          endMs: weekKey + 6 * msPerDay,
          isoWeek,
          isoYear,
          workMs: 0,
          breakMs: 0,
          sessionCount: 0,
          activeDays: 0,
          goalHits: 0,
          tagDurations: new Map(),
          breakTagDurations: new Map(),
          dayRefs: []
        };
        weeklyMap.set(weekKey, week);
      }
      week.dayRefs.push(day);

      const monthKey = monthKeyFromDay(day.dayStart);
      let month = monthlyMap.get(monthKey);
      if (!month) {
        const date = new Date(day.dayStart);
        const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        month = {
          key: monthKey,
          label: startDate.toLocaleDateString([], { month: 'long', year: 'numeric' }),
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          workMs: 0,
          breakMs: 0,
          sessionCount: 0,
          activeDays: 0,
          tagDurations: new Map(),
          breakTagDurations: new Map()
        };
        monthlyMap.set(monthKey, month);
      }

      if (!day.ignored) {
        totalWorkMs += day.workMs;
        totalBreakMs += day.breakMs;
        totalTaggedBreakMs += day.taggedBreakMs;
        totalSessions += day.sessionCount;
        activeDays += 1;
        if (day.goalMet) goalHits += 1;
        if (day.workMs > longestDay.ms) longestDay = { ms: day.workMs, date: day.date };
        if (day.longestSessionMs > longestSession.ms) {
          longestSession = { ms: day.longestSessionMs, date: day.date, tag: day.longestSessionTag };
        }
        day.tagDurations.forEach((ms, tag) => {
          tagTotals.set(tag, (tagTotals.get(tag) || 0) + ms);
        });
        day.breakTagDurations.forEach((ms, tag) => {
          breakTagTotals.set(tag, (breakTagTotals.get(tag) || 0) + ms);
        });
        totalTodosCompleted += day.todosCompleted.length;
        week.workMs += day.workMs;
        week.breakMs += day.breakMs;
        week.sessionCount += day.sessionCount;
        week.activeDays += 1;
        if (day.goalMet) week.goalHits += 1;
        mergeDurationMap(week.tagDurations, day.tagDurations);
        mergeDurationMap(week.breakTagDurations, day.breakTagDurations);
        month.workMs += day.workMs;
        month.breakMs += day.breakMs;
        month.sessionCount += day.sessionCount;
        month.activeDays += 1;
        mergeDurationMap(month.tagDurations, day.tagDurations);
        mergeDurationMap(month.breakTagDurations, day.breakTagDurations);
      }
    }

    dailyData.sort((a, b) => b.dayStart - a.dayStart);

    const weeklyArray = Array.from(weeklyMap.values()).sort((a, b) => b.startMs - a.startMs);
    weeklyArray.forEach((week) => week.dayRefs.sort((a, b) => b.dayStart - a.dayStart));
    const monthlyArray = Array.from(monthlyMap.values()).sort((a, b) => b.startMs - a.startMs);

    const tagTotalsArray = Array.from(tagTotals.entries()).map(([tag, ms]) => ({
      tag,
      display: formatTagLabel(tag),
      ms,
      color: colorForTag(tag, tag || 'untagged'),
      share: totalWorkMs > 0 ? ms / totalWorkMs : 0
    })).sort((a, b) => b.ms - a.ms);

    const breakTagTotalsArray = Array.from(breakTagTotals.entries()).map(([tag, ms]) => ({
      tag,
      display: formatTagLabel(tag),
      ms,
      color: colorForBreakTag(tag),
      share: totalTaggedBreakMs > 0 ? ms / totalTaggedBreakMs : 0
    })).sort((a, b) => b.ms - a.ms);

    return {
      dailyData,
      weeklyArray,
      monthlyArray,
      tagTotalsArray,
      breakTagTotalsArray,
      totals: {
        workMs: totalWorkMs,
        breakMs: totalBreakMs,
        taggedBreakMs: totalTaggedBreakMs,
        todosCompleted: totalTodosCompleted,
        sessions: totalSessions,
        activeDays,
        goalHits,
        goalMs,
        longestDay,
        longestSession
      },
      firstActiveDate,
      lastActiveDate
    };
  }

  function buildDay(dayStart, nowMs, goalMs, ignored, dayStr) {
    const daySessions = sessionsForDay(dayStart, nowMs);
    if (!daySessions.length) return null;

    const workMs = daySessions.reduce((sum, sess) => sum + (sess.end - sess.start), 0);
    if (workMs <= 0) return null;

    const tagDurations = new Map();
    const segments = [];
    let longestSessionMs = 0;
    let longestSessionTag = null;

    daySessions.forEach((sess, idx) => {
      const duration = sess.end - sess.start;
      tagDurations.set(sess.tag, (tagDurations.get(sess.tag) || 0) + duration);
      if (duration > longestSessionMs) {
        longestSessionMs = duration;
        longestSessionTag = sess.tag;
      }
      const fallbackKey = TagColor.sessionFallbackKey(sess.sourceStart ?? sess.start);
      segments.push({
        startMs: sess.start,
        endMs: sess.end,
        tag: sess.tag,
        color: colorForTag(sess.tag, fallbackKey)
      });
    });

    const breakSegments = gapsBetweenSessions(daySessions);
    const breakMs = breakSegments.reduce((sum, gap) => sum + (gap.end - gap.start), 0);

    const breakTagDurations = breakTagsForDay(dayStart, nowMs);
    const todosCompleted = completedTodosForDay(dayStart, dayStart + msPerDay);
    let taggedBreakMs = 0;
    breakTagDurations.forEach((ms) => {
      taggedBreakMs += ms;
    });

    return {
      dayStart,
      date: new Date(dayStart),
      dayStr: dayStr || ymdFromMs(dayStart),
      ignored: !!ignored,
      workMs,
      breakMs,
      taggedBreakMs,
      sessionCount: daySessions.length,
      longestSessionMs,
      longestSessionTag,
      firstStart: daySessions[0].start,
      lastEnd: daySessions[daySessions.length - 1].end,
      tagDurations,
      breakTagDurations,
      todosCompleted,
      segments,
      goalMet: goalMs > 0 ? workMs >= goalMs : false
    };
  }

  function sessionsForDay(dayStart, nowMs) {
    const dayEnd = dayStart + msPerDay;
    const result = [];
    for (const session of state.sessions) {
      if (!session || typeof session.start !== 'number') continue;
      const rawEnd = session.end == null ? nowMs : session.end;
      if (rawEnd <= dayStart || session.start >= dayEnd) continue;
      const start = Math.max(session.start, dayStart);
      const end = Math.min(rawEnd, dayEnd, nowMs);
      if (end <= start) continue;
      result.push({
        start,
        end,
        tag: normalizeDisplayTag(session.tag),
        sourceStart: session.start
      });
    }
    result.sort((a, b) => a.start - b.start);
    return result;
  }

  function gapsBetweenSessions(sessions) {
    const gaps = [];
    for (let i = 1; i < sessions.length; i += 1) {
      const prev = sessions[i - 1];
      const current = sessions[i];
      if (current.start > prev.end) {
        gaps.push({ start: prev.end, end: current.start });
      }
    }
    return gaps;
  }

  function breakTagsForDay(dayStart, nowMs) {
    const result = new Map();
    if (!state.breakLogs.length) return result;
    const dayEnd = dayStart + msPerDay;
    for (const log of state.breakLogs) {
      if (!log || typeof log.start !== 'number' || typeof log.end !== 'number') continue;
      if (log.end <= dayStart || log.start >= dayEnd) continue;
      if (typeof log.tagTs === 'number' && (log.tagTs < dayStart || log.tagTs >= dayEnd)) continue;
      const start = Math.max(log.start, dayStart);
      const end = Math.min(log.end, dayEnd, nowMs);
      if (end <= start) continue;
      const tag = normalizeDisplayTag(log.tag);
      if (!tag) continue;
      result.set(tag, (result.get(tag) || 0) + (end - start));
    }
    return result;
  }

  function completedTodosForDay(dayStart, dayEnd) {
    if (!Array.isArray(state.todos)) return [];
    const entries = [];
    for (const todo of state.todos) {
      if (!todo || !todo.done || typeof todo.completedAt !== 'number') continue;
      const ts = Number(todo.completedAt);
      if (Number.isNaN(ts) || ts < dayStart || ts >= dayEnd) continue;
      entries.push({
        text: typeof todo.text === 'string' && todo.text.trim() ? todo.text.trim() : 'Todo',
        timestamp: ts
      });
    }
    entries.sort((a, b) => a.timestamp - b.timestamp);
    return entries;
  }

  function mergeDurationMap(target, source) {
    source.forEach((value, key) => {
      target.set(key, (target.get(key) || 0) + value);
    });
  }

  function renderOverview(data) {
    if (!summarySection || !overviewCards) return;
    summarySection.hidden = false;
    overviewCards.innerHTML = '';

    const totals = data.totals;
    const metricData = [
      {
        label: 'Total focus',
        value: formatDuration(totals.workMs),
        hint: `${totals.activeDays} active ${plural(totals.activeDays, 'day')}`
      },
      {
        label: 'Average / active day',
        value: formatDuration(totals.activeDays ? totals.workMs / totals.activeDays : 0),
        hint: totals.goalMs > 0 ? `Goal ${formatDuration(totals.goalMs)}` : 'No goal set'
      },
      {
        label: 'Sessions logged',
        value: String(totals.sessions),
        hint: totals.activeDays ? `${(totals.sessions / totals.activeDays).toFixed(1)} per day` : '—'
      },
      {
        label: 'Todos completed',
        value: String(totals.todosCompleted),
        hint: totals.activeDays && totals.todosCompleted ? `${(totals.todosCompleted / totals.activeDays).toFixed(1)} per day` : '—'
      },
      {
        label: 'Biggest day',
        value: totals.longestDay.ms ? formatDuration(totals.longestDay.ms) : '—',
        hint: totals.longestDay.date ? formatDate(totals.longestDay.date) : '—'
      },
      {
        label: 'Longest session',
        value: totals.longestSession.ms ? formatDuration(totals.longestSession.ms) : '—',
        hint: totals.longestSession.date ? `${formatDate(totals.longestSession.date)} • ${formatTagLabel(totals.longestSession.tag)}` : '—'
      },
      {
        label: 'Goal hits',
        value: totals.goalMs > 0 && totals.activeDays ? percent(totals.goalHits / totals.activeDays) : '—',
        hint: totals.goalMs > 0 && totals.activeDays ? `${totals.goalHits}/${totals.activeDays} days` : 'Goal not set'
      }
    ];

    metricData.forEach((metric) => {
      const card = document.createElement('article');
      card.className = 'metric-card';
      const title = document.createElement('h3');
      title.textContent = metric.label;
      card.appendChild(title);
      const value = document.createElement('div');
      value.className = 'metric-value';
      value.textContent = metric.value;
      card.appendChild(value);
      const hint = document.createElement('div');
      hint.className = 'metric-hint';
      hint.textContent = metric.hint;
      card.appendChild(hint);
      overviewCards.appendChild(card);
    });
  }

  function renderActivityGraph(data) {
    if (!activitySection || !activityGrid || !activityMonthLabels) return;
    activitySection.hidden = false;
    activityGrid.innerHTML = '';
    activityMonthLabels.innerHTML = '';

    const now = Date.now();
    const nowDate = new Date(now);

    // Build 53 weeks of data (covers ~1 year, aligning to weeks)
    // End on the current day, start 52 weeks back on a Monday
    const todayDayOfWeek = nowDate.getDay(); // 0 = Sunday
    // Convert to Monday-based: Mon=0, Tue=1, ..., Sun=6
    const mondayBasedDay = (todayDayOfWeek + 6) % 7;
    const endDayStart = startOfDayMs(now);

    // Go back to find the Monday that starts 52 weeks ago
    const weeksBack = 52;
    const startMonday = new Date(endDayStart);
    startMonday.setDate(startMonday.getDate() - (weeksBack * 7) - mondayBasedDay);
    const startMs = startMonday.getTime();

    // Build a map of dayStart -> workMs from existing data
    const workByDay = new Map();
    data.dailyData.forEach((day) => {
      workByDay.set(day.dayStart, day.ignored ? 0 : day.workMs);
    });

    // Thresholds for intensity levels (in minutes)
    // Level 0: 0 (no work)
    // Level 1: 1-60 min
    // Level 2: 61-120 min
    // Level 3: 121-240 min
    // Level 4: 240+ min
    const thresholds = [0, 1, 60, 120, 240]; // in minutes

    function getLevel(workMs) {
      const mins = workMs / msPerMinute;
      if (mins <= 0) return 0;
      if (mins < 60) return 1;
      if (mins < 120) return 2;
      if (mins < 240) return 3;
      return 4;
    }

    // Build week columns
    const columns = [];
    let currentDay = startMs;
    let workingDays = 0;

    while (currentDay <= endDayStart) {
      const weekColumn = [];
      const weekStartMs = currentDay;

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if (currentDay > endDayStart) {
          // Future day placeholder (shouldn't render)
          weekColumn.push(null);
        } else {
          const workMs = workByDay.get(currentDay) || 0;
          if (workMs > 0) workingDays++;
          const level = getLevel(workMs);
          const date = new Date(currentDay);
          weekColumn.push({
            date,
            dayStart: currentDay,
            workMs,
            level,
            tooltip: `${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}: ${formatDuration(workMs)}`
          });
        }
        currentDay += msPerDay;
      }

      columns.push({ weekStartMs, days: weekColumn });
    }

    // Update summary text
    if (activitySummary) {
      activitySummary.textContent = `${workingDays} working ${plural(workingDays, 'day')} in the last year`;
    }

    // Render month labels
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let lastMonth = -1;
    const columnWidth = 15; // 12px cell + 3px gap

    columns.forEach((col, colIndex) => {
      const firstDay = col.days.find(d => d !== null);
      if (!firstDay) return;

      const month = firstDay.date.getMonth();
      if (month !== lastMonth) {
        const label = document.createElement('span');
        label.className = 'activity-month-label';
        label.textContent = monthNames[month];
        // Position based on column index
        label.style.marginLeft = colIndex === 0 ? '0' : '0';

        // Calculate width until next month or end
        let colspan = 1;
        for (let i = colIndex + 1; i < columns.length; i++) {
          const nextFirst = columns[i].days.find(d => d !== null);
          if (nextFirst && nextFirst.date.getMonth() !== month) break;
          colspan++;
        }
        label.style.width = `${colspan * columnWidth}px`;

        activityMonthLabels.appendChild(label);
        lastMonth = month;
      }
    });

    // Render grid columns
    columns.forEach((col) => {
      const colEl = document.createElement('div');
      colEl.className = 'activity-column';

      col.days.forEach((day) => {
        const cell = document.createElement('div');
        cell.className = 'activity-cell';

        if (day === null) {
          // Empty cell for future dates
          cell.classList.add('activity-cell--empty');
          cell.style.visibility = 'hidden';
        } else {
          cell.classList.add(`activity-cell--level-${day.level}`);
          cell.title = day.tooltip;
        }

        colEl.appendChild(cell);
      });

      activityGrid.appendChild(colEl);
    });
  }

  function renderDailyTimeline(data) {
    if (!timelineSection || !dailyList) return;
    dailyList.innerHTML = '';
    if (!data.weeklyArray.length) {
      timelineSection.hidden = true;
      return;
    }
    timelineSection.hidden = false;

    data.weeklyArray.forEach((week, index) => {
      const details = document.createElement('details');
      details.className = 'week-block';
      if (index < 3) details.open = true;

      const summary = document.createElement('summary');
      const label = document.createElement('span');
      label.textContent = `Week ${week.isoWeek} • ${week.isoYear}`;
      summary.appendChild(label);

      const metrics = document.createElement('span');
      metrics.className = 'week-metrics';
      const goalRatio = week.activeDays ? percent(week.goalHits / week.activeDays) : '—';
      metrics.innerHTML = `<span>${formatDuration(week.workMs)}</span><span>${week.activeDays} ${plural(week.activeDays, 'day')}</span><span>Goal ${goalRatio}</span>`;
      summary.appendChild(metrics);

      const range = document.createElement('span');
      range.className = 'section-hint';
      range.textContent = formatWeekRange(week, data.lastActiveDate);
      summary.appendChild(range);

      details.appendChild(summary);

      const grid = document.createElement('div');
      grid.className = 'daily-grid';
      week.dayRefs.forEach((day) => {
        grid.appendChild(createDailyCard(day));
      });
      details.appendChild(grid);

      dailyList.appendChild(details);
    });
  }

  function createDailyCard(day) {
    const card = document.createElement('article');
    card.className = 'daily-card';
    if (day.goalMet && !day.ignored) card.classList.add('goal-met');
    if (day.ignored) card.classList.add('daily-card--ignored');

    const header = document.createElement('div');
    header.className = 'daily-card-header';
    const dayName = document.createElement('span');
    dayName.textContent = day.date.toLocaleDateString([], { weekday: 'short' });
    const dayDate = document.createElement('span');
    dayDate.className = 'day-date';
    dayDate.textContent = day.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const meta = document.createElement('div');
    meta.className = 'daily-card-meta';
    meta.appendChild(dayDate);
    if (day.ignored) {
      const ignored = document.createElement('span');
      ignored.className = 'ignored-pill';
      ignored.textContent = 'Ignored';
      meta.appendChild(ignored);
    }
    header.appendChild(dayName);
    header.appendChild(meta);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'daily-card-body';

    const cakeWrapper = document.createElement('div');
    cakeWrapper.className = 'daily-cake';
    cakeWrapper.appendChild(buildMiniCake(day));
    body.appendChild(cakeWrapper);

    const metrics = document.createElement('div');
    metrics.className = 'daily-metrics';

    metrics.appendChild(metricRow('Work', formatDuration(day.workMs)));
    metrics.appendChild(metricRow('Sessions', String(day.sessionCount)));
    const longestValue = day.longestSessionMs ? `${formatDuration(day.longestSessionMs)}${day.longestSessionTag ? ` • ${formatTagLabel(day.longestSessionTag)}` : ''}` : '—';
    metrics.appendChild(metricRow('Longest', longestValue));
    const breaksValue = day.breakMs ? `${formatDuration(day.breakMs)}${day.taggedBreakMs ? ` (${formatDuration(day.taggedBreakMs)} tagged)` : ''}` : '—';
    metrics.appendChild(metricRow('Breaks', breaksValue));
    metrics.appendChild(metricRow('Window', `${formatTime(day.firstStart)} → ${formatTime(day.lastEnd)}`));
    const todosLabel = day.todosCompleted.length ? `${day.todosCompleted.length} ${plural(day.todosCompleted.length, 'todo')}` : '0';
    metrics.appendChild(metricRow('Todos done', todosLabel));
    metrics.appendChild(metricRow('Goal', day.goalMet ? 'Hit' : 'Missed', day.goalMet ? ['goal-chip', 'hit'] : ['goal-chip', 'miss']));

    body.appendChild(metrics);
    card.appendChild(body);

    const tagEntries = getTagEntries(day.tagDurations, day.workMs);
    if (tagEntries.length) {
      const block = document.createElement('div');
      block.className = 'tag-breakdown';
      const title = document.createElement('div');
      title.className = 'subsection-title';
      title.textContent = 'Tags';
      block.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'tag-list';
      tagEntries.forEach((entry) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="swatch" style="background:${entry.color}"></span><span class="label" title="${escapeHtml(entry.display)}">${escapeHtml(entry.display)}</span><span class="value">${formatDuration(entry.ms)} (${percent(entry.share)})</span>`;
        list.appendChild(li);
      });
      block.appendChild(list);
      card.appendChild(block);
    }

    const breakEntries = getBreakEntries(day.breakTagDurations, day.taggedBreakMs);
    if (breakEntries.length) {
      const block = document.createElement('div');
      block.className = 'break-breakdown';
      const title = document.createElement('div');
      title.className = 'subsection-title';
      title.textContent = 'Break tags';
      block.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'break-list';
      breakEntries.forEach((entry) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="swatch" style="background:${entry.color}"></span><span class="label" title="${escapeHtml(entry.display)}">${escapeHtml(entry.display)}</span><span class="value">${formatDuration(entry.ms)} (${percent(entry.share)})</span>`;
        list.appendChild(li);
      });
      block.appendChild(list);
      card.appendChild(block);
    }

    if (day.todosCompleted.length) {
      const block = document.createElement('div');
      block.className = 'todo-breakdown';
      const title = document.createElement('div');
      title.className = 'subsection-title';
      title.textContent = 'Completed todos';
      block.appendChild(title);
      const list = document.createElement('ul');
      list.className = 'todo-list';
      day.todosCompleted.forEach((entry) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="label" title="${escapeHtml(entry.text)}">${escapeHtml(entry.text)}</span><span class="time">${formatTime(entry.timestamp)}</span>`;
        list.appendChild(li);
      });
      block.appendChild(list);
      card.appendChild(block);
    }

    card.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('a, button, summary')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!dayMenu.hidden && dayMenuState?.dayStart === day.dayStart) {
        closeDayMenu();
        return;
      }
      openDayMenu(day, card);
    });

    return card;
  }

  function metricRow(label, value, valueClass) {
    const row = document.createElement('div');
    row.className = 'metric-row';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = label;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    if (valueClass) {
      const classes = Array.isArray(valueClass)
        ? valueClass
        : String(valueClass).trim().split(/\s+/);
      classes.filter(Boolean).forEach((cls) => valueSpan.classList.add(cls));
    }
    valueSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
  }

  function buildMiniCake(day) {
    const size = 120;
    const center = size / 2;
    const radius = size * 0.42;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const base = document.createElementNS(SVG_NS, 'circle');
    base.setAttribute('cx', center);
    base.setAttribute('cy', center);
    base.setAttribute('r', radius);
    base.setAttribute('fill', rootStyles.getPropertyValue('--ring-bg').trim() || '#fff');
    svg.appendChild(base);

    day.segments.forEach((segment) => {
      const startAngle = ((segment.startMs - day.dayStart) / msPerDay) * tau - Math.PI / 2;
      const endAngle = ((segment.endMs - day.dayStart) / msPerDay) * tau - Math.PI / 2;
      const pathData = arcPath(center, center, radius, startAngle, endAngle);
      if (!pathData) return;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', segment.color);
      svg.appendChild(path);
    });

    const outline = document.createElementNS(SVG_NS, 'circle');
    outline.setAttribute('cx', center);
    outline.setAttribute('cy', center);
    outline.setAttribute('r', radius);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', rootStyles.getPropertyValue('--border').trim() || '#000');
    outline.setAttribute('stroke-width', '0.6');
    svg.appendChild(outline);

    return svg;
  }

  function arcPath(cx, cy, r, startAngle, endAngle) {
    let delta = endAngle - startAngle;
    while (delta < 0) delta += tau;
    if (delta <= 0) return '';
    if (Math.abs(delta - tau) < 1e-4) {
      const point = polarToCartesian(cx, cy, r, startAngle);
      const opposite = polarToCartesian(cx, cy, r, startAngle + Math.PI);
      return `M ${cx} ${cy} L ${point.x} ${point.y} A ${r} ${r} 0 1 1 ${opposite.x} ${opposite.y} A ${r} ${r} 0 1 1 ${point.x} ${point.y} Z`;
    }
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = delta > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  function polarToCartesian(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function renderWeekly(data) {
    if (!weeklySection || !weeklyStatsRoot) return;
    weeklyStatsRoot.innerHTML = '';
    if (!data.weeklyArray.length) {
      weeklySection.hidden = true;
      return;
    }
    weeklySection.hidden = false;

    data.weeklyArray.forEach((week) => {
      const card = document.createElement('article');
      card.className = 'period-card';

      const title = document.createElement('h3');
      title.textContent = `Week ${week.isoWeek} • ${week.isoYear}`;
      card.appendChild(title);

      const range = document.createElement('div');
      range.className = 'period-range';
      range.textContent = formatWeekRange(week, data.lastActiveDate);
      card.appendChild(range);

      card.appendChild(periodMetric('Focus', formatDuration(week.workMs)));
      card.appendChild(periodMetric('Avg / day', formatDuration(week.activeDays ? week.workMs / week.activeDays : 0)));
      card.appendChild(periodMetric('Sessions', String(week.sessionCount)));
      card.appendChild(periodMetric('Goal hits', week.activeDays ? percent(week.goalHits / week.activeDays) : '—'));

      const top = pickTopTag(week.tagDurations);
      const tagRow = document.createElement('div');
      tagRow.className = 'period-tag';
      if (top) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = colorForTag(top.tag, top.tag || 'untagged');
        tagRow.appendChild(swatch);
        const label = document.createElement('span');
        label.textContent = `${formatTagLabel(top.tag)} • ${formatDuration(top.ms)}`;
        tagRow.appendChild(label);
      } else {
        const label = document.createElement('span');
        label.textContent = 'No tags logged';
        tagRow.appendChild(label);
      }
      card.appendChild(tagRow);

      weeklyStatsRoot.appendChild(card);
    });
  }

  function renderMonthly(data) {
    if (!monthlySection || !monthlyStatsRoot) return;
    monthlyStatsRoot.innerHTML = '';
    if (!data.monthlyArray.length) {
      monthlySection.hidden = true;
      return;
    }
    monthlySection.hidden = false;

    data.monthlyArray.forEach((month) => {
      const card = document.createElement('article');
      card.className = 'period-card';

      const title = document.createElement('h3');
      title.textContent = month.label;
      card.appendChild(title);

      const range = document.createElement('div');
      range.className = 'period-range';
      range.textContent = formatRangeShort(month.startMs, month.endMs);
      card.appendChild(range);

      card.appendChild(periodMetric('Focus', formatDuration(month.workMs)));
      card.appendChild(periodMetric('Avg / day', formatDuration(month.activeDays ? month.workMs / month.activeDays : 0)));
      card.appendChild(periodMetric('Sessions', String(month.sessionCount)));

      const top = pickTopTag(month.tagDurations);
      const tagRow = document.createElement('div');
      tagRow.className = 'period-tag';
      if (top) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = colorForTag(top.tag, top.tag || 'untagged');
        tagRow.appendChild(swatch);
        const label = document.createElement('span');
        label.textContent = `${formatTagLabel(top.tag)} • ${formatDuration(top.ms)}`;
        tagRow.appendChild(label);
      } else {
        const label = document.createElement('span');
        label.textContent = 'No tags logged';
        tagRow.appendChild(label);
      }
      card.appendChild(tagRow);

      monthlyStatsRoot.appendChild(card);
    });
  }

  function periodMetric(label, value) {
    const row = document.createElement('div');
    row.className = 'period-metric';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    const valueSpan = document.createElement('span');
    valueSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
  }

  function renderTagStats(data) {
    if (!tagSection || !tagStatsRoot) return;
    tagStatsRoot.innerHTML = '';
    tagSection.hidden = false;

    if (!data.tagTotalsArray.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.textContent = 'No tagged sessions yet.';
      tagStatsRoot.appendChild(placeholder);
      return;
    }

    data.tagTotalsArray.slice(0, 12).forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'stat-item';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = entry.color;
      item.appendChild(swatch);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = entry.display;
      item.appendChild(label);
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatDuration(entry.ms);
      item.appendChild(value);
      const share = document.createElement('span');
      share.className = 'share';
      share.textContent = percent(entry.share);
      item.appendChild(share);
      tagStatsRoot.appendChild(item);
    });
  }

  function renderBreakStats(data) {
    if (!breakSection || !breakStatsRoot) return;
    breakStatsRoot.innerHTML = '';
    breakSection.hidden = false;

    const summary = document.createElement('div');
    summary.className = 'stat-summary';
    summary.textContent = `Breaks between sessions: ${formatDuration(data.totals.breakMs)} (${formatDuration(data.totals.taggedBreakMs)} tagged)`;
    breakStatsRoot.appendChild(summary);

    if (!data.breakTagTotalsArray.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'placeholder';
      placeholder.textContent = 'No tagged breaks logged yet.';
      breakStatsRoot.appendChild(placeholder);
      return;
    }

    data.breakTagTotalsArray.slice(0, 12).forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'stat-item';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = entry.color;
      item.appendChild(swatch);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = entry.display;
      item.appendChild(label);
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = formatDuration(entry.ms);
      item.appendChild(value);
      const share = document.createElement('span');
      share.className = 'share';
      share.textContent = percent(entry.share);
      item.appendChild(share);
      breakStatsRoot.appendChild(item);
    });
  }

  function getTagEntries(map, totalMs) {
    const entries = [];
    map.forEach((ms, tag) => {
      if (ms <= 0) return;
      entries.push({
        tag,
        display: formatTagLabel(tag),
        ms,
        color: colorForTag(tag, tag || 'untagged'),
        share: totalMs > 0 ? ms / totalMs : 0
      });
    });
    entries.sort((a, b) => b.ms - a.ms);
    return entries;
  }

  function getBreakEntries(map, totalMs) {
    const entries = [];
    map.forEach((ms, tag) => {
      if (ms <= 0) return;
      entries.push({
        tag,
        display: formatTagLabel(tag),
        ms,
        color: colorForBreakTag(tag),
        share: totalMs > 0 ? ms / totalMs : 0
      });
    });
    entries.sort((a, b) => b.ms - a.ms);
    return entries;
  }

  function pickTopTag(map) {
    let bestTag = null;
    let bestMs = 0;
    map.forEach((ms, tag) => {
      if (ms > bestMs) {
        bestMs = ms;
        bestTag = tag;
      }
    });
    return bestMs > 0 ? { tag: bestTag, ms: bestMs } : null;
  }

  function formatDuration(ms) {
    if (!ms || ms <= 0) return '0h 0m';
    const totalMinutes = Math.round(ms / msPerMinute);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  function percent(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return '0%';
    const value = ratio * 100;
    return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
  }

  function formatTime(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function formatDate(date) {
    return date ? date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  function formatDateRange(start, end) {
    if (!start || !end) return '';
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${start.toLocaleDateString([], opts)} → ${end.toLocaleDateString([], opts)}`;
  }

  function ymdFromMs(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatRangeShort(startMs, endMs) {
    const start = new Date(startMs);
    const end = new Date(endMs);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString([], opts)} → ${end.toLocaleDateString([], opts)}`;
  }

  function formatWeekRange(week, lastActive) {
    const start = new Date(week.startMs);
    const endCandidate = new Date(week.endMs);
    const end = lastActive && lastActive.getTime() < week.endMs ? lastActive : endCandidate;
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString([], opts)} → ${end.toLocaleDateString([], opts)}`;
  }

  function formatTagLabel(tag) {
    if (tag == null || (typeof tag === 'string' && tag.trim() === '')) return 'Untitled';
    return String(tag);
  }

  function normalizeDisplayTag(tag) {
    if (typeof tag !== 'string') return null;
    const trimmed = tag.trim();
    return trimmed === '' ? null : trimmed;
  }

  function colorForTag(tag, fallbackKey) {
    return TagColor.colorForTag(tag, fallbackKey, accentMeta, state.tagColors);
  }

  function colorForBreakTag() {
    return breakSwatchColor;
  }

  function startOfDayMs(timestamp) {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function startOfWeekMs(dayStartMs) {
    const d = new Date(dayStartMs);
    const day = d.getDay(); // 0 (Sun) .. 6 (Sat)
    const diff = day === 0 ? -6 : 1 - day; // Monday as start
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function monthKeyFromDay(dayStart) {
    const d = new Date(dayStart);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / msPerDay + 1) / 7);
    return { week, year: d.getUTCFullYear() };
  }

  function plural(count, singular) {
    return count === 1 ? singular : `${singular}s`;
  }

})();
