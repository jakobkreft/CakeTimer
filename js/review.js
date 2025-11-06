(() => {
  'use strict';

  const STORE_KEY = 'ot.v3.state';
  const msPerSecond = 1000;
  const msPerMinute = 60 * msPerSecond;
  const msPerHour = 60 * msPerMinute;
  const msPerDay = 24 * msPerHour;
  const tau = Math.PI * 2;
  const DEFAULT_ACCENT = '#16a34a';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pad = (n) => String(n).padStart(2, '0');
  const escapeHtml = (str) => (str == null ? '' : String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  function normalizeTagKey(tag) {
    if (typeof tag !== 'string') return '';
    const trimmed = tag.trim().toLowerCase();
    return trimmed;
  }

  function resolveColorInfo(color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.fillStyle = color;
      const normalized = ctx.fillStyle;
      if (!normalized) return null;
      if (normalized.startsWith('#')) {
        return hexToRgb(normalized);
      }
      const match = normalized.match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].split(',').map((part) => parseFloat(part.trim()));
        if (parts.length >= 3) {
          return { r: parts[0], g: parts[1], b: parts[2], normalized };
        }
      }
    } catch (err) {
      console.warn('Color resolution failed', err);
    }
    return null;
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r, g, b, normalized: `#${h}` };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0; let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h * 360, s, l];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0; let g1 = 0; let b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
  }

  function hslToRgbString(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function rgbToHex(r, g, b) {
    const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function resolveAccentMeta(accent) {
    const info = resolveColorInfo(accent) || hexToRgb(DEFAULT_ACCENT);
    const baseHsl = info ? rgbToHsl(info.r, info.g, info.b) : rgbToHsl(22, 163, 74);
    return { accentKey: info?.normalized || DEFAULT_ACCENT, baseHsl };
  }

  function jitterColorFromAccent(baseHsl, key) {
    const [baseH, baseS, baseL] = baseHsl;
    const hash = hashString(String(key));
    const hueShift = ((hash & 0xff) / 255 - 0.5) * 26;
    const satShift = (((hash >>> 8) & 0xff) / 255 - 0.5) * 0.25;
    const lightShift = (((hash >>> 16) & 0xff) / 255 - 0.5) * 0.24;
    const h = (baseH + hueShift + 360) % 360;
    const s = clamp(baseS + satShift, 0.2, 0.95);
    const l = clamp(baseL + lightShift, 0.2, 0.7);
    return hslToRgbString(h, s, l);
  }

  const colorCache = new Map();

  const defaultState = {
    sessions: [],
    breakLogs: [],
    goalMinutes: 240,
    theme: 'light',
    tagColors: {},
    todos: []
  };

  let state = { ...defaultState };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.sessions)) state.sessions = normalizeSessions(parsed.sessions);
      if (Array.isArray(parsed.breakLogs)) state.breakLogs = normalizeBreakLogs(parsed.breakLogs);
      if (typeof parsed.goalMinutes === 'number' && !Number.isNaN(parsed.goalMinutes)) {
        state.goalMinutes = parsed.goalMinutes;
      }
      if (typeof parsed.theme === 'string') {
        state.theme = parsed.theme === 'dark' ? 'dark' : 'light';
      }
      if (parsed.tagColors && typeof parsed.tagColors === 'object') {
        state.tagColors = {};
        for (const [rawKey, value] of Object.entries(parsed.tagColors)) {
          const key = normalizeTagKey(rawKey);
          if (!key) continue;
          if (typeof value === 'string' && value.trim()) {
            state.tagColors[key] = value.trim();
          }
        }
      }
      if (Array.isArray(parsed.todos)) state.todos = normalizeTodos(parsed.todos);
    }
  } catch (err) {
    console.error('Unable to parse saved review data', err);
  }

  document.documentElement.classList.toggle('dark', state.theme === 'dark');

  const rootStyles = getComputedStyle(document.documentElement);
  const accentColor = rootStyles.getPropertyValue('--accent').trim() || DEFAULT_ACCENT;
  const breakSwatchColor = rootStyles.getPropertyValue('--muted').trim() || '#9ca3af';
  const accentMeta = resolveAccentMeta(accentColor);

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
  const infoPanel = document.getElementById('infoPanel');
  const infoCloseBtn = infoPanel ? infoPanel.querySelector('.info-panel__close') : null;
  const infoTriggers = Array.from(document.querySelectorAll('[data-info-trigger]'));
  let infoReturnFocus = null;
  let savedBodyOverflow = null;

  function setInfoExpanded(expanded){
    infoTriggers.forEach(btn => btn.setAttribute('aria-expanded', expanded ? 'true' : 'false'));
  }

  function openInfo(trigger){
    if (!infoPanel || !infoPanel.hidden) return;
    infoReturnFocus = trigger || null;
    infoPanel.hidden = false;
    setInfoExpanded(true);
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    infoPanel.focus({ preventScroll: true });
  }

  function closeInfo(){
    if (!infoPanel || infoPanel.hidden) return;
    infoPanel.hidden = true;
    setInfoExpanded(false);
    document.body.style.overflow = savedBodyOverflow || '';
    savedBodyOverflow = null;
    if (infoReturnFocus) infoReturnFocus.focus();
    infoReturnFocus = null;
  }

  if (infoPanel){
    infoPanel.setAttribute('tabindex', '-1');
    infoPanel.addEventListener('click', (e)=>{ if (e.target === infoPanel) closeInfo(); });
  }
  if (infoCloseBtn) infoCloseBtn.addEventListener('click', closeInfo);
  infoTriggers.forEach(btn => btn.addEventListener('click', ()=> {
    if (!infoPanel) return;
    if (infoPanel.hidden) openInfo(btn);
    else closeInfo();
  }));
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && infoPanel && !infoPanel.hidden){
      e.preventDefault();
      closeInfo();
    }
  });

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
  }

  renderOverview(data);
  renderDailyTimeline(data);
  renderWeekly(data);
  renderMonthly(data);
  renderTagStats(data);
  renderBreakStats(data);

  function revealEmpty() {
    if (summarySection) summarySection.hidden = true;
    if (timelineSection) timelineSection.hidden = true;
    if (weeklySection) weeklySection.hidden = true;
    if (monthlySection) monthlySection.hidden = true;
    if (tagSection) tagSection.hidden = true;
    if (breakSection) breakSection.hidden = true;
    if (emptyState) emptyState.hidden = false;
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
      const day = buildDay(dayStart, nowMs, goalMs);
      if (!day) continue;

      dailyData.push(day);
      totalWorkMs += day.workMs;
      totalBreakMs += day.breakMs;
      totalTaggedBreakMs += day.taggedBreakMs;
      totalSessions += day.sessionCount;
      activeDays += 1;
      if (day.goalMet) goalHits += 1;
      if (!firstActiveDate) firstActiveDate = day.date;
      lastActiveDate = day.date;
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
      week.workMs += day.workMs;
      week.breakMs += day.breakMs;
      week.sessionCount += day.sessionCount;
      week.activeDays += 1;
      if (day.goalMet) week.goalHits += 1;
      mergeDurationMap(week.tagDurations, day.tagDurations);
      mergeDurationMap(week.breakTagDurations, day.breakTagDurations);
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
      month.workMs += day.workMs;
      month.breakMs += day.breakMs;
      month.sessionCount += day.sessionCount;
      month.activeDays += 1;
      mergeDurationMap(month.tagDurations, day.tagDurations);
      mergeDurationMap(month.breakTagDurations, day.breakTagDurations);
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

  function buildDay(dayStart, nowMs, goalMs) {
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
      segments.push({
        startMs: sess.start,
        endMs: sess.end,
        tag: sess.tag,
        color: colorForTag(sess.tag, sess.tag || 'untagged')
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
      result.push({ start, end, tag: normalizeDisplayTag(session.tag) });
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
    if (day.goalMet) card.classList.add('goal-met');

    const header = document.createElement('div');
    header.className = 'daily-card-header';
    const dayName = document.createElement('span');
    dayName.textContent = day.date.toLocaleDateString([], { weekday: 'short' });
    const dayDate = document.createElement('span');
    dayDate.className = 'day-date';
    dayDate.textContent = day.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    header.appendChild(dayName);
    header.appendChild(dayDate);
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
    if (valueClass){
      const classes = Array.isArray(valueClass)
        ? valueClass
        : String(valueClass).trim().split(/\s+/);
      classes.filter(Boolean).forEach((cls)=> valueSpan.classList.add(cls));
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
    const normalized = normalizeTagKey(tag ?? '');
    if (normalized && state.tagColors[normalized]) {
      return state.tagColors[normalized];
    }
    const fallback = normalizeTagKey(fallbackKey ?? '');
    const cacheKey = `${accentMeta.accentKey}|${normalized || fallback || 'untagged'}`;
    if (!colorCache.has(cacheKey)) {
      colorCache.set(cacheKey, jitterColorFromAccent(accentMeta.baseHsl, cacheKey));
    }
    return colorCache.get(cacheKey);
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
