(() => {
  'use strict';

  const MS_PER_DAY = 86400000;

  const pad2 = (n) => String(n).padStart(2, '0');

  function startOfDay(input) {
    const d = input instanceof Date ? new Date(input) : new Date(input);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function dayKey(input) {
    const d = startOfDay(input);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseDayKey(key) {
    if (typeof key !== 'string') return null;
    const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function addDays(input, days) {
    const d = startOfDay(input);
    d.setDate(d.getDate() + days);
    return d;
  }

  function boundsForDay(input) {
    const start = startOfDay(input);
    const end = addDays(start, 1);
    return { start: start.getTime(), end: end.getTime() };
  }

  function dayNumber(input) {
    const d = startOfDay(input);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
  }

  function daysBetween(a, b) {
    return dayNumber(b) - dayNumber(a);
  }

  function startOfWeek(input) {
    const d = startOfDay(input);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  window.DateUtils = {
    MS_PER_DAY,
    startOfDay,
    dayKey,
    parseDayKey,
    addDays,
    boundsForDay,
    dayNumber,
    daysBetween,
    startOfWeek,
  };
})();
