(() => {
  'use strict';

  const DateUtils = window.DateUtils;
  const MIN_SESSION_MS = 15000;

  function computeStreak(state, nowMs = Date.now(), minMs = MIN_SESSION_MS) {
    const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
    const ignoredDays = Array.isArray(state?.ignoredDays) ? state.ignoredDays : [];
    const ignoredNums = new Set();
    for (const key of ignoredDays) {
      const d = DateUtils.parseDayKey(key);
      if (!d) continue;
      ignoredNums.add(DateUtils.dayNumber(d));
    }

    const intervalsByDay = new Map();
    for (const sess of sessions) {
      if (!sess || typeof sess.start !== 'number') continue;
      const start = Number(sess.start);
      if (Number.isNaN(start)) continue;
      const rawEnd = sess.end == null ? nowMs : Number(sess.end);
      if (!Number.isFinite(rawEnd) || rawEnd <= start) continue;

      const startDay = DateUtils.startOfDay(start);
      const endDay = DateUtils.startOfDay(rawEnd);
      for (let day = new Date(startDay); day <= endDay; day = DateUtils.addDays(day, 1)) {
        const dayStart = day.getTime();
        const dayEnd = DateUtils.addDays(day, 1).getTime();
        const overlapStart = Math.max(start, dayStart);
        const overlapEnd = Math.min(rawEnd, dayEnd);
        if (overlapEnd <= overlapStart) continue;
        let list = intervalsByDay.get(dayStart);
        if (!list) {
          list = [];
          intervalsByDay.set(dayStart, list);
        }
        list.push([overlapStart, overlapEnd]);
      }
    }

    const qualifying = [];
    intervalsByDay.forEach((intervals, dayStart) => {
      const total = mergedTotal(intervals);
      if (total < minMs) return;
      const dayNum = DateUtils.dayNumber(dayStart);
      if (ignoredNums.has(dayNum)) return;
      qualifying.push({ dayNum, dayStart });
    });

    if (!qualifying.length) {
      return { current: 0, best: 0, lastDay: null };
    }

    qualifying.sort((a, b) => a.dayNum - b.dayNum);
    const dayNums = qualifying.map(item => item.dayNum);
    const dayNumSet = new Set(dayNums);

    let best = 0;
    let run = 0;
    let prev = null;
    for (const dayNum of dayNums) {
      if (prev != null && dayNum - prev === 1) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > best) best = run;
      prev = dayNum;
    }

    const todayNum = DateUtils.dayNumber(nowMs);
    let current = 0;
    if (!ignoredNums.has(todayNum)) {
      if (dayNumSet.has(todayNum)) {
        current = countBackwards(dayNumSet, todayNum);
      } else if (dayNumSet.has(todayNum - 1)) {
        current = countBackwards(dayNumSet, todayNum - 1);
      }
    }

    const lastDay = DateUtils.dayKey(qualifying[qualifying.length - 1].dayStart);
    return { current, best, lastDay };
  }

  function mergedTotal(intervals) {
    if (!Array.isArray(intervals) || !intervals.length) return 0;
    intervals.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let curStart = intervals[0][0];
    let curEnd = intervals[0][1];
    for (let i = 1; i < intervals.length; i++) {
      const [start, end] = intervals[i];
      if (start <= curEnd) {
        curEnd = Math.max(curEnd, end);
      } else {
        total += curEnd - curStart;
        curStart = start;
        curEnd = end;
      }
    }
    total += curEnd - curStart;
    return total;
  }

  function countBackwards(daySet, startDay) {
    let count = 0;
    for (let d = startDay; daySet.has(d); d -= 1) {
      count += 1;
    }
    return count;
  }

  window.Streak = {
    MIN_SESSION_MS,
    computeStreak
  };
})();
