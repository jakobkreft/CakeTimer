
(() => {
  'use strict';

  // ---------- Constants & utils ----------
  const msPerSecond = 1000;
  const msPerMinute = 60 * msPerSecond;
  const msPerHour   = 60 * msPerMinute;
  const msPerDay    = 24 * msPerHour;

  const MIN_SESSION_MS   = 15000;
  const DELETE_THRESH_MS = 5000;
  const DRAG_PX          = 6;
  const DRAG_MIN_MS      = 1000;

  const EARLY_BIRD_MS    = (7 * msPerHour) + (30 * msPerMinute); // 07:30
  const SOLID_HOUR_MS    = 60 * msPerMinute;
  const DEEP_WORK_MS     = 180 * msPerMinute;

  const tau = Math.PI * 2;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const pad = (n, w=2) => String(n).padStart(w, '0');

  const fmtHM = (minsFloat) => {
    const total = Math.max(0, minsFloat);
    const h = Math.floor(total / 60);
    const m = Math.floor((total - h * 60) + 1e-6);
    return `${h}h ${m}m`;
  };
  const fmtHMS = (ms) => {
    const s = Math.max(0, Math.floor(ms/1000));
    const hh = Math.floor(s/3600), mm = Math.floor((s%3600)/60), ss = s%60;
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  };
  const fmtClockS = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const fmtTime   = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const todayBounds = (d=new Date()) => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { start, end: start + msPerDay };
  };

  // ---------- Storage ----------
  const STORE_KEY = 'ot.v3.state';

  function defaultState(){
  return {
    version: 4,
    sessions: [],
    breakLogs: [],
    goalMinutes: 240,
    theme: 'light',
    streak: { current: 0, best: 0, lastDay: null },
    badges: [],
    todos: []                    // [{id,text,done,created,completedAt?}]
  };
}

  function loadState(){
    let base = defaultState();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const s = JSON.parse(raw);
      base.sessions    = Array.isArray(s.sessions) ? s.sessions : [];
      base.goalMinutes = typeof s.goalMinutes==='number' ? s.goalMinutes : base.goalMinutes;
      base.theme       = (s.theme==='dark'?'dark':'light');
      base.breakLogs   = Array.isArray(s.breakLogs)? s.breakLogs : [];
      for (const b of base.breakLogs) { if (typeof b.tagTs !== 'number') b.tagTs = Math.round((b.start + b.end) / 2); }
      base.streak      = s.streak && typeof s.streak==='object' ? s.streak : base.streak;
      base.badges      = Array.isArray(s.badges) ? s.badges : [];
      base.todos       = Array.isArray(s.todos) ? s.todos : [];
      base.version     = 4;
    } catch {}
    return base;
  }
  function saveState(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }catch{} }

  // ---------- State & elements ----------
  const state = loadState();
  const rootEl = document.documentElement;
  function applyTheme(){ rootEl.classList.toggle('dark', state.theme === 'dark'); }
  applyTheme();

  const dial = document.getElementById('dial');
  const ctx = dial.getContext('2d');

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
  const welcomeEl  = document.getElementById('welcome');
  const badgesRow  = document.getElementById('badgesRow');
  const tagsWorkUL = document.getElementById('tagsWork');
  const tagsBreakUL= document.getElementById('tagsBreak');

  const addTodoBtn = document.getElementById('addTodo');
  const todosUL    = document.getElementById('todosList');



  const tip = document.createElement('div'); tip.className = 'tooltip'; tip.style.display='none'; document.body.appendChild(tip);

  // ---------- First-open-of-day streak handling ----------
  (function handleDailyStreak(){
    const today = ymd(new Date());
    const last  = state.streak.lastDay;
    if (last !== today){
      if (last) {
        const lastDate = new Date(last);
        const diff = Math.round((todayBounds().start - todayBounds(lastDate).start)/msPerDay);
        state.streak.current = (diff === 1) ? (state.streak.current||0) + 1 : 1;
      } else {
        state.streak.current = 1;
      }
      state.streak.best = Math.max(state.streak.best||0, state.streak.current);
      state.streak.lastDay = today;
      saveState();
      welcomeEl.hidden = false;
      setTimeout(()=>{ welcomeEl.hidden = true; }, 3000);
    }
    updateStreakUI();
  })();

  function updateStreakUI(){
    streakLine.textContent = `STREAK: ${state.streak.current||0} • BEST: ${state.streak.best||0}`;
  }

  // ---------- Session helpers ----------
  function isRunning(){ const last = state.sessions[state.sessions.length-1]; return !!(last && last.end==null); }

  function startSession(){
    if (isRunning()) return;
    state.sessions.push({ start: Date.now(), end: null });
    assignDefaultSessionNamesForToday();
    realignBreakLogsForToday();
    saveState(); announce('Started'); requestDraw(); updateTagsPanel();
  }

  function stopSession(){
    if (!isRunning()) return;
    const last = state.sessions[state.sessions.length-1];
    const now = Date.now();
    if (now - last.start < MIN_SESSION_MS) {
      state.sessions.pop();
    } else {
      last.end = now;
    }
    realignBreakLogsForToday();
    saveState(); announce('Stopped'); requestDraw(); updateTagsPanel();
  }

  function clearToday(){
    const { start, end } = todayBounds(new Date());
    if (isRunning()) stopSession();
    const next=[];
    for (const sess of state.sessions){
      const s=sess.start, e=sess.end ?? Date.now();
      if (e<=start || s>=end) next.push(sess);
      else {
        if (s<start) next.push({ start:s, end:start, tag:sess.tag });
        if (e>end)   next.push({ start:end, end:e, tag:sess.tag });
      }
    }
    state.sessions = next;
    state.breakLogs = state.breakLogs.filter(b => b.end <= start || b.start >= end);
    removeAllBadgesForDay(ymd(new Date(start)));
    saveState(); announce('Cleared today'); requestDraw(); updateTagsPanel();
  }

  function setGoal(mins){ state.goalMinutes = clamp(Math.round(mins),0,24*60); saveState(); requestDraw(); }
  function toggleTheme(){ state.theme = (state.theme==='dark') ? 'light' : 'dark'; applyTheme(); saveState(); }

  // Graceful stop on close
  let _closingHandled = false;
  function stopIfClosing(){
    if (_closingHandled) return;
    _closingHandled = true;
    if (isRunning()){
      const last = state.sessions[state.sessions.length-1];
      const now = Date.now();
      if (now - last.start < MIN_SESSION_MS) state.sessions.pop();
      else last.end = now;
    }
    saveState();
  }
  window.addEventListener('pagehide', stopIfClosing, { capture: true });
  window.addEventListener('beforeunload', stopIfClosing, { capture: true });
  document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState!=='visible') saveState(); });

  const statusEl = document.getElementById('status');
  function announce(msg){ statusEl.textContent = msg; }

  // ---------- Geometry ----------
  function resizeCanvasToDisplaySize(canvas){
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; return true; }
    return false;
  }
  const tau2 = Math.PI * 2;
  function angleFromPoint(x,y,cx,cy){ let a=Math.atan2(y-cy, x-cx); a -= (-Math.PI/2); return (a%tau2 + tau2)%tau2; }
  function angleFromTime(ms, dayStart){ const seconds = (ms - dayStart)/1000; return (seconds/86400)*tau2; }
  function timeFromAngle(theta, dayStart){ const seconds = theta/tau2*86400; return dayStart + Math.round(seconds)*1000; }

  // ---------- Preview sessions while dragging ----------
  let drag = null; // { segIndex, edge, dayStart, sessionIndex, origStart, origEnd, curStart, curEnd }
  function getSessionsForCalc(){
    if (!drag) return state.sessions;
    const arr = state.sessions.slice();
    arr[drag.sessionIndex] = { start: drag.curStart, end: drag.curEnd, tag: state.sessions[drag.sessionIndex].tag };
    return arr;
  }

  // ---------- Build today's raw segments ----------
  function segmentsForDay(dayStart, nowMs=Date.now(), sessions = state.sessions){
    const dayEnd = dayStart + msPerDay;
    const segs = [];
    sessions.forEach((sess, i)=>{
      const s = sess.start, e = (sess.end==null) ? nowMs : sess.end;
      if (e<=dayStart || s>=dayEnd) return;
      const a = Math.max(s, dayStart), b = Math.min(e, dayEnd);
      if (b>a) segs.push({ startMs:a, endMs:b, sessionIndex:i, tag:sess.tag||null });
    });
    segs.sort((a,b)=>a.startMs-b.startMs);
    return segs;
  }
  function gapsForDay(dayStart, segs){
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;
    const clampEnd = Math.min(nowMs, dayEnd);
    const gaps=[];
    let cursor = dayStart;
    for (const seg of segs){
      if (seg.startMs > cursor) gaps.push({ startMs: cursor, endMs: Math.min(seg.startMs, clampEnd) });
      cursor = Math.max(cursor, seg.endMs);
      if (cursor >= clampEnd) break;
    }
    if (cursor < clampEnd) gaps.push({ startMs: cursor, endMs: clampEnd });
    return gaps;
  }

  // ---------- Default session names (today) ----------
  function assignDefaultSessionNamesForToday(){
    const { start: dayStart } = todayBounds(new Date());
    const todaySessions = state.sessions
      .map((s,i)=>({ s, i }))
      .filter(x => (x.s.end ?? Date.now()) > dayStart && x.s.start < dayStart + msPerDay)
      .sort((a,b)=> (Math.max(a.s.start, dayStart) - Math.max(b.s.start, dayStart)));

    const re = /^Session\s+(\d+)\b/i;
    let usedMax = 0; const usedNums = new Set();
    todaySessions.forEach(({s})=>{
      if (typeof s.tag === 'string'){
        const m = s.tag.match(re);
        if (m){ const n = parseInt(m[1],10); if (!isNaN(n)){ usedNums.add(n); usedMax = Math.max(usedMax, n); } }
      }
    });

    let changed = false, nextNum = usedMax;
    for (const {s, i} of todaySessions){
      if (!s.tag || s.tag.trim()===''){
        let candidate = nextNum + 1; while (usedNums.has(candidate)) candidate++;
        nextNum = candidate; usedNums.add(candidate);
        state.sessions[i].tag = `Session ${candidate}`;
        changed = true;
      }
    }
    if (changed) saveState();
  }

  // ---------- Break logs realignment ----------
  function realignBreakLogsForToday(){
    const { start: dayStart } = todayBounds(new Date());
    const segs = segmentsForDay(dayStart, Date.now(), state.sessions);
    const gaps = gapsForDay(dayStart, segs);

    let changed = false;
    for (let i = state.breakLogs.length - 1; i >= 0; i--){
      const b = state.breakLogs[i];
      if (typeof b.tagTs !== 'number') b.tagTs = Math.round((b.start + b.end)/2);
      if (b.tagTs < dayStart || b.tagTs > Math.min(Date.now(), dayStart + msPerDay)) continue;

      const gap = gaps.find(g => b.tagTs >= g.startMs && b.tagTs <= g.endMs);
      if (gap){
        if (b.start !== gap.startMs || b.end !== gap.endMs){
          b.start = gap.startMs; b.end = gap.endMs; changed = true;
        }
      } else {
        state.breakLogs.splice(i,1);
        changed = true;
      }
    }
    if (changed) saveState();
  }

  // ---------- Union minutes for cake ----------
  const minuteRangesForDay = (dayStart, segs) => {
    const ranges = segs.map(seg=>[
      clamp(Math.floor((seg.startMs - dayStart)/msPerMinute), 0, 1440),
      clamp(Math.ceil ((seg.endMs   - dayStart)/msPerMinute), 0, 1440)
    ]).sort((a,b)=>a[0]-b[0]);
    const merged=[];
    for (const r of ranges){
      if (!merged.length || r[0] > merged[merged.length-1][1]) merged.push(r.slice());
      else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], r[1]);
    }
    return merged;
  };

  function preciseWorkedSeconds(dayStart){
    const dayEnd = dayStart + msPerDay;
    let total=0; const nowMs=Date.now();
    for (const sess of state.sessions){
      const s=sess.start, e=sess.end==null? nowMs : sess.end;
      const a=Math.max(s, dayStart), b=Math.min(e, dayEnd);
      if (b>a) total += (b-a)/1000;
    }
    return total;
  }

  // ---------- Hover + click/drag intent ----------
  let hover = { segIndex:-1, theta:0, nearEdge:null };
  let dragCandidate = null;
  let clickPending = false;
  let downXY = {x:0,y:0};
  let hoverDial = false;

  function findHover(x,y){
    const w=dial.width,h=dial.height,cx=w/2,cy=h/2,R=Math.min(w,h)*0.45;
    const theta = angleFromPoint(x,y,cx,cy);
    const { start: dayStart } = todayBounds(new Date());
    const segs = segmentsForDay(dayStart, Date.now(), getSessionsForCalc());
    const threshold = 8 / R;
    let segIndex=-1, nearEdge=null;
    for (let i=0;i<segs.length;i++){
      const a0 = angleFromTime(segs[i].startMs, dayStart);
      const a1 = angleFromTime(segs[i].endMs, dayStart);
      if (theta >= a0 && theta <= a1){
        segIndex = i;
        const ds=Math.abs(theta-a0), de=Math.abs(theta-a1);
        if (Math.min(ds,de) < threshold) nearEdge = (ds<de)? 'start':'end';
        break;
      }
    }
    hover = { segIndex, theta, nearEdge };
    updateCursor();
    return { segIndex, theta, nearEdge, segs, R, cx, cy, dayStart };
  }
  function updateCursor(){
    dial.classList.remove('edge-resize','segment-hover','dragging');
    if (drag) dial.classList.add('dragging');
    else if (hover.segIndex>=0 && hover.nearEdge) dial.classList.add('edge-resize');
    else if (hover.segIndex>=0) dial.classList.add('segment-hover');
  }

  function cappedEdgeTime(segIndex, edge, desiredTime, dayStart){
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;
    const segs = segmentsForDay(dayStart, nowMs, getSessionsForCalc());
    const seg = segs[segIndex];
    if (!seg) return desiredTime;
    let minT, maxT;
    if (edge === 'start'){
      minT = dayStart;
      if (segIndex>0) minT = Math.max(minT, segs[segIndex-1].endMs);
      maxT = Math.min(seg.endMs, nowMs);
      return clamp(desiredTime, minT, maxT);
    } else {
      minT = seg.startMs;
      maxT = Math.min(dayEnd, nowMs);
      if (segIndex < segs.length-1) maxT = Math.min(maxT, segs[segIndex+1].startMs);
      return clamp(desiredTime, minT, maxT);
    }
  }

  function deleteTodaysSlice(sessionIndex, dayStart){
    const dayEnd = dayStart + msPerDay;
    const sess = state.sessions[sessionIndex]; if (!sess) return;
    const nowMs = Date.now();
    const s=sess.start, e=sess.end==null ? nowMs : sess.end;
    if (e<=dayStart || s>=dayEnd) return;
    if (s>=dayStart && e<=dayEnd){ state.sessions.splice(sessionIndex,1); return; }
    if (s<dayStart && e<=dayEnd){ sess.end = dayStart; return; }
    if (s>=dayStart && e>dayEnd){ sess.start = dayEnd; return; }
    if (s<dayStart && e>dayEnd){ sess.end = dayStart; state.sessions.push({ start: dayEnd, end: e, tag: sess.tag }); return; }
  }

  function updateDragPreview(thetaNew){
    const desired = timeFromAngle(thetaNew, drag.dayStart);
    const capped = cappedEdgeTime(drag.segIndex, drag.edge, desired, drag.dayStart);
    if (drag.edge === 'start'){
      const maxStart = (drag.curEnd ?? Date.now()) - DRAG_MIN_MS;
      drag.curStart = clamp(capped, drag.dayStart, maxStart);
    } else {
      const minEnd = (drag.curStart + DRAG_MIN_MS);
      const nowMs = Date.now();
      const dayEnd = drag.dayStart + msPerDay;
      drag.curEnd = clamp(capped, minEnd, Math.min(dayEnd, nowMs));
    }
    requestDraw();
  }

  // ---------- UI bindings ----------
  themeBtn.addEventListener('click', toggleTheme);
  goalMinus.addEventListener('click', ()=> setGoal(state.goalMinutes - 30));
  goalPlus.addEventListener('click',  ()=> setGoal(state.goalMinutes + 30));

  // Both Start/Stop buttons behave the same
  function toggleTimer(){ isRunning()? stopSession(): startSession(); }
  toggleBtn.addEventListener('click', toggleTimer);
  topToggleBtn.addEventListener('click', toggleTimer);

  resetBtn.addEventListener('click',  ()=> { if (confirm('Clear ONLY today?')) clearToday(); });

  window.addEventListener('keydown', (e)=>{
    const key = e.key.toLowerCase();
    if (key===' '){ e.preventDefault(); toggleTimer(); }
    else if (key==='arrowup') setGoal(state.goalMinutes + 30);
    else if (key==='arrowdown') setGoal(state.goalMinutes - 30);
    else if (key==='r') location.href='review.html';
    else if (key==='t') attemptTagAtHover();
  });

  dial.addEventListener('pointerenter', ()=>{ hoverDial = true; requestDraw(); });
  dial.addEventListener('pointerleave', ()=>{
    hoverDial = false;
    tip.style.display='none'; hover={segIndex:-1,theta:0,nearEdge:null}; updateCursor();
    dragCandidate = null; clickPending = false;
    requestDraw();
  });

  // Pointer interactions: drag edges OR click to toggle (inside cake)
  dial.addEventListener('pointermove', (e)=>{
    const rect = dial.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (dial.width / rect.width);
    const y = (e.clientY - rect.top) * (dial.height / rect.height);
    const res = findHover(x,y);

    const dayStart = res.dayStart;
    const nowMs = Date.now();

    // Tooltip
    if (!drag){
      if (res.segIndex >= 0){
        const seg = res.segs[res.segIndex];
        const durMs = Math.max(0, seg.endMs - seg.startMs);
        const sTime = new Date(seg.startMs), eTime = new Date(seg.endMs);
        const tagStr = (seg.tag && seg.tag.trim()) ? seg.tag : '(Session)';
        tip.style.display='block'; tip.style.left=`${e.clientX}px`; tip.style.top=`${e.clientY}px`;
        const mins = Math.floor(durMs/60000), secs = Math.floor((durMs%60000)/1000);
        tip.innerHTML = `<b>SESSION</b><br>${fmtTime(sTime)} → ${fmtTime(eTime)}<br>${Math.floor(mins/60)}h ${mins%60}m ${secs}s<br>TAG: ${escapeHtml(tagStr)}<br><small>Press <b>T</b> to rename • Drag edge to adjust</small>`;
      } else {
        const t = timeFromAngle(res.theta, dayStart);
        if (t >= dayStart && t <= Math.min(nowMs, dayStart+msPerDay)){
          const gaps = gapsForDay(dayStart, res.segs);
          const gap = gaps.find(g => t>=g.startMs && t<=g.endMs);
          if (gap){
            const sTime = new Date(gap.startMs), eTime = new Date(gap.endMs);
            const existing = findBreakLogCovering(gap.startMs, gap.endMs, t);
            const tag = existing?.tag ? `TAG: ${escapeHtml(existing.tag)}<br>` : '';
            tip.style.display='block'; tip.style.left=`${e.clientX}px`; tip.style.top=`${e.clientY}px`;
            const durMs = gap.endMs-gap.startMs;
            const mins = Math.floor(durMs/60000), secs=Math.floor((durMs%60000)/1000);
            tip.innerHTML = `<b>BREAK</b><br>${fmtTime(sTime)} → ${fmtTime(eTime)}<br>${Math.floor(mins/60)}h ${mins%60}m ${secs}s<br>${tag}<small>Press <b>T</b> to tag</small>`;
          } else tip.style.display='none';
        } else {
          tip.style.display='none';
        }
      }
    }

    if (dragCandidate){
      const dx = x - downXY.x, dy = y - downXY.y;
      if (Math.hypot(dx,dy) >= DRAG_PX){
        const seg = res.segs[dragCandidate.segIndex];
        const sessIdx = seg.sessionIndex;
        drag = {
          segIndex: dragCandidate.segIndex,
          edge: dragCandidate.edge,
          dayStart: res.dayStart,
          sessionIndex: sessIdx,
          origStart: state.sessions[sessIdx].start,
          origEnd  : state.sessions[sessIdx].end,
          curStart : state.sessions[sessIdx].start,
          curEnd   : state.sessions[sessIdx].end ?? Date.now(),
        };
        dial.setPointerCapture(e.pointerId);
        clickPending = false;
      }
    }
    if (drag) {
      tip.style.display = 'none';
      updateDragPreview(res.theta);
    }
  });

  dial.addEventListener('pointerdown', (e)=>{
    const rect = dial.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (dial.width / rect.width);
    const y = (e.clientY - rect.top) * (dial.height / rect.height);
    const { segIndex, nearEdge } = findHover(x,y);
    downXY = {x,y};
    tip.style.display='none';
    clickPending = true;
    dragCandidate = (segIndex>=0 && nearEdge) ? { segIndex, edge: nearEdge } : null;
  });

  dial.addEventListener('pointerup', (e)=>{
    if (drag){
      const sessionsFinal = getSessionsForCalc();
      const segsFinal = segmentsForDay(drag.dayStart, Date.now(), sessionsFinal);
      const segBySession = segsFinal.find(s => s.sessionIndex === drag.sessionIndex);
      if (!segBySession || (segBySession.endMs - segBySession.startMs) <= DELETE_THRESH_MS){
        deleteTodaysSlice(drag.sessionIndex, drag.dayStart);
        saveState();
      } else {
        state.sessions[drag.sessionIndex].start = drag.curStart;
        state.sessions[drag.sessionIndex].end   = drag.curEnd;
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
    if (clickPending){
      const rect = dial.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (dial.width / rect.width);
      const y = (e.clientY - rect.top) * (dial.height / rect.height);
      const w=dial.width,h=dial.height,cx=w/2,cy=h/2,R=Math.min(w,h)*0.45;
      if (Math.hypot(x - cx, y - cy) <= R) toggleTimer();
    }
    clickPending = false;
  });

  // Tagging logic (press T)
  function attemptTagAtHover(){
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const segs = segmentsForDay(dayStart, nowMs, getSessionsForCalc());

    if (hover.segIndex >= 0){
      const seg = segs[hover.segIndex];
      const sessIdx = seg.sessionIndex;
      const current = (state.sessions[sessIdx].tag && state.sessions[sessIdx].tag.trim())
        ? state.sessions[sessIdx].tag
        : state.sessions[sessIdx].tag ?? '';
      const input = prompt('Tag this work session (text):', current);
      if (input !== null){
        state.sessions[sessIdx].tag = input.trim() || undefined;
        if (!state.sessions[sessIdx].tag) assignDefaultSessionNamesForToday();
        saveState(); updateTagsPanel(); requestDraw();
      }
    } else {
      const theta = hover.theta;
      const t = timeFromAngle(theta, dayStart);
      if (t < dayStart || t > Math.min(nowMs, dayStart+msPerDay)) return;
      const gaps = gapsForDay(dayStart, segs);
      const gap = gaps.find(g => t>=g.startMs && t<=g.endMs);
      if (!gap) return;
      const existing = findBreakLogCovering(gap.startMs, gap.endMs, t);
      const current = existing?.tag || '';
      const input = prompt('Tag this break (text):', current);
      if (input === null) return;
      const val = input.trim();
      if (existing){
        existing.tag = val || undefined;
        if (!existing.tag){
          const ix = state.breakLogs.indexOf(existing);
          if (ix>=0) state.breakLogs.splice(ix,1);
        } else {
          if (typeof existing.tagTs !== 'number') existing.tagTs = t;
          existing.start = gap.startMs; existing.end = gap.endMs;
        }
      } else if (val){
        state.breakLogs.push({ start: gap.startMs, end: gap.endMs, tag: val, tagTs: t });
      }
      saveState();
      realignBreakLogsForToday();
      updateTagsPanel(); requestDraw();
    }
  }

  function findBreakLogCovering(gapStart, gapEnd, t){
    return state.breakLogs.find(b => b.tagTs != null && b.tagTs>=gapStart && b.tagTs<=gapEnd)
        || state.breakLogs.find(b => b.start<=t && b.end>=t && b.start>=gapStart-1000 && b.end<=gapEnd+1000);
  }

  // ---------- Topbar helpers ----------
  function lastStopTimeToday(dayStart){
    const now = Date.now();
    let lastStop = dayStart;
    for (const s of state.sessions){
      if (s.end != null && s.end <= now && s.end >= dayStart && s.end <= dayStart + msPerDay){
        if (s.end > lastStop) lastStop = s.end;
      }
    }
    return lastStop;
  }

  function updateTopbarUI(dayStart, running, liveMs){
  // Current time with seconds
  nowClock.textContent = fmtClockS(new Date());

  // Mirror buttons
  const btnLabel = running ? 'STOP' : 'START';
  topToggleBtn.textContent = btnLabel;
  topToggleBtn.setAttribute('aria-pressed', running ? 'true' : 'false');
  toggleBtn.textContent = btnLabel;
  toggleBtn.setAttribute('aria-pressed', running ? 'true' : 'false');

  if (running){
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
  let pendingDraw=false;
  function requestDraw(){ if (!pendingDraw){ pendingDraw=true; requestAnimationFrame(drawDial); } }

  function drawDial(){
    pendingDraw=false;
    resizeCanvasToDisplaySize(dial);
    const w=dial.width, h=dial.height, cx=w/2, cy=h/2;
    const R = Math.min(w,h)*0.45;

    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.translate(cx,cy);

    // base disk
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ring-bg').trim();
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();

    // day progress wedge
    const { start: dayStart } = todayBounds(new Date());
    assignDefaultSessionNamesForToday();
    realignBreakLogsForToday();

    const now = Date.now();
    const nowTheta = ((now - dayStart)/msPerDay)*(Math.PI*2) - Math.PI/2;
    const progressFill = getComputedStyle(document.documentElement).getPropertyValue('--progress').trim();
    ctx.fillStyle = progressFill;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,-Math.PI/2, nowTheta, false); ctx.closePath(); ctx.fill();

    // work slices
    const segs = segmentsForDay(dayStart, now, getSessionsForCalc());
    const ranges = minuteRangesForDay(dayStart, segs);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    for (const [m0,m1] of ranges){
      const a0=(m0/1440)*(Math.PI*2) - Math.PI/2, a1=(m1/1440)*(Math.PI*2) - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,a0,a1,false); ctx.closePath(); ctx.fill();
    }

    // hour ticks (invert) on hover
    if (hoverDial) {
      ctx.save();
      ctx.rotate(-Math.PI/2);
      ctx.globalCompositeOperation = 'difference';
      ctx.strokeStyle = '#ffffff';
      const thin = Math.max(1, Math.round(R*0.006));
      ctx.lineWidth = thin;
      for (let hr=0; hr<24; hr++){
        const a=(hr/24)*(Math.PI*2);
        const r0=R*0.955, r1=R*0.985;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*r0, Math.sin(a)*r0);
        ctx.lineTo(Math.cos(a)*r1, Math.sin(a)*r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // center text (invert)
    const workedSeconds = preciseWorkedSeconds(dayStart);
    const workedMinutes = workedSeconds/60;
    const goal = state.goalMinutes, remaining = Math.max(0, goal - workedMinutes);
    const running = isRunning();
    const last = state.sessions[state.sessions.length-1];
    const liveMs = running ? (Date.now() - last.start) : 0;

    ctx.textAlign='center';
    ctx.textBaseline='alphabetic';
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 ${Math.round(w*0.06)}px ui-monospace, monospace`; ctx.fillText(`${fmtHM(workedMinutes)}`, 0, +w*0.005);
    ctx.font = `${Math.round(w*0.026)}px ui-monospace, monospace`;
    if (remaining>0){ ctx.fillText(`${fmtHM(remaining)} TO GOAL`, 0, +w*0.055); }
    else { ctx.fillText(`GOAL REACHED`, 0, +w*0.055); }
    if (running){
      ctx.font = `500 ${Math.round(w*0.03)}px ui-monospace, monospace`;
      ctx.fillText(`SESSION ${fmtHMS(liveMs)}`, 0, +w*0.11);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // UI labels + panels
    goalText.textContent = fmtHM(state.goalMinutes);
    recomputeAndSyncTodayBadges(dayStart, workedSeconds);
    renderBadgesRow();
    updateTagsPanel();

    renderTodos();

    // Topbar quickbar
    updateTopbarUI(dayStart, running, liveMs);
  }

  // drive redraws
  setInterval(requestDraw, 500);
  requestDraw();

function scheduleMidnightSave(){
  const now = Date.now();
  const { end } = todayBounds(new Date());
  const delay = Math.max(1000, end - now + 2000);
  setTimeout(()=>{
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
  function computeEligibleBadges(dayStart, workedSeconds){
    const eligible = new Set();
    const segs = segmentsForDay(dayStart);

    for (const seg of segs){
      const dur = seg.endMs - seg.startMs;
      if (dur >= SOLID_HOUR_MS) eligible.add('solid-hour');
      if (dur >= DEEP_WORK_MS)  eligible.add('deep-work');
      if (eligible.has('solid-hour') && eligible.has('deep-work')) break;
    }

    const firstToday = state.sessions
      .filter(s => s.start>=dayStart && s.start<dayStart+msPerDay)
      .sort((a,b)=>a.start-b.start)[0];
    if (firstToday && (firstToday.start - dayStart) < EARLY_BIRD_MS){
      eligible.add('early-bird');
    }

    const goalSecs = (state.goalMinutes || 0) * 60;
    if (workedSeconds >= goalSecs && goalSecs > 0) eligible.add('goal-complete');

    return eligible;
  }

  function recomputeAndSyncTodayBadges(dayStart, workedSeconds){
    const dayStr = ymd(new Date(dayStart));
    const eligible = computeEligibleBadges(dayStart, workedSeconds);

    const current = new Set(state.badges.filter(b=>b.date===dayStr).map(b=>b.id));
    let changed = false;

    // Remove revoked
    if (current.size){
      const keep = [];
      for (const b of state.badges){
        if (b.date !== dayStr) { keep.push(b); continue; }
        if (eligible.has(b.id)) keep.push(b);
        else changed = true;
      }
      if (changed) state.badges = keep;
    }
    // Add missing
    for (const id of eligible){
      if (!current.has(id)){ state.badges.push({ id, date: dayStr }); changed = true; }
    }
    if (state.badges.length > 60){ state.badges.splice(0, state.badges.length - 60); changed = true; }
    if (changed) saveState();
  }

  function removeAllBadgesForDay(dayStr){
    const orig = state.badges.length;
    state.badges = state.badges.filter(b => b.date !== dayStr);
    if (state.badges.length !== orig) saveState();
  }

  function renderBadgesRow(){
    const label = (id)=>(
      id==='solid-hour'    ? 'Solid Hour' :
      id==='early-bird'    ? 'Early Bird' :
      id==='deep-work'     ? 'Deep Work'  :
      id==='goal-complete' ? 'Goal Complete' : id
    );
    const { start } = todayBounds(new Date());
    const dayStr = ymd(new Date(start));
    const order = ['early-bird','solid-hour','deep-work','goal-complete'];

    const todaysMap = new Map();
    for (const b of state.badges) {
      if (b.date === dayStr && !todaysMap.has(b.id)) todaysMap.set(b.id, b);
    }
    const todays = Array.from(todaysMap.values())
      .sort((a,b)=> order.indexOf(a.id) - order.indexOf(b.id));

    badgesRow.innerHTML = todays.length
      ? todays.map(b=>`<span class="badge-pill">[ ${label(b.id)} ]</span>`).join('')
      : '<span class="badge-pill">[ — ]</span>';
  }

  // ---------- Tags Today panel ----------
  function updateTagsPanel(){
    const { start: dayStart } = todayBounds(new Date());
    const nowMs = Date.now();
    const dayEnd = dayStart + msPerDay;

    // Work tags
    const mapWork = new Map();
    for (const sess of state.sessions){
      const a = Math.max(sess.start, dayStart);
      const b = Math.min(sess.end ?? nowMs, dayEnd);
      const s = Math.max(0, b - a);
      if (s<=0) continue;
      const tag = (sess.tag && sess.tag.trim()) ? sess.tag : null;
      if (!tag) continue;
      mapWork.set(tag, (mapWork.get(tag)||0) + s);
    }
    renderTagList(tagsWorkUL, mapWork);

    // Break tags (using realigned logs)
    const mapBreak = new Map();
    for (const br of state.breakLogs){
      if (!br.tag) continue;
      const a = Math.max(br.start, dayStart);
      const b = Math.min(br.end, Math.min(nowMs, dayEnd));
      const s = Math.max(0, b - a);
      if (s>0) mapBreak.set(br.tag, (mapBreak.get(br.tag)||0) + s);
    }
    renderTagList(tagsBreakUL, mapBreak);
  }

  function renderTagList(ul, map){
  const items = Array.from(map.entries())
    .map(([tag, secs])=>({ tag, mins: secs/60000 }))
    .sort((a,b)=> b.mins - a.mins);

  if (!items.length){
    ul.innerHTML = `<li><span class="label">—</span><span class="time">0h 0m</span></li>`;
    return;
  }

  ul.innerHTML = items.map(it => (
    `<li>
       <span class="label" data-tag="${escapeHtml(it.tag)}" title="Click to rename">${escapeHtml(it.tag)}</span>
       <span class="time">${fmtHM(it.mins)}</span>
     </li>`
  )).join('');
}

function renameWorkTag(oldTag, newTag){
  const { start: dayStart, end } = todayBounds(new Date());
  let changed = false;

  for (const sess of state.sessions){
    const sInToday = (sess.end ?? Date.now()) > dayStart && sess.start < end;
    if (!sInToday) continue;
    if ((sess.tag || '').trim() === oldTag){
      if (newTag) {
        sess.tag = newTag;
      } else {
        // clear → default Session N naming will be re-applied
        sess.tag = undefined;
      }
      changed = true;
    }
  }
  if (changed){
    if (!newTag) assignDefaultSessionNamesForToday();
    saveState();
    updateTagsPanel();
    requestDraw();
  }
}

function renameBreakTag(oldTag, newTag){
  const { start: dayStart, end } = todayBounds(new Date());
  let changed = false;

  for (let i = state.breakLogs.length - 1; i >= 0; i--){
    const b = state.breakLogs[i];
    const inToday = (b.tagTs != null ? (b.tagTs >= dayStart && b.tagTs < end)
                                     : (b.start >= dayStart && b.start < end));
    if (!inToday) continue;

    if ((b.tag || '').trim() === oldTag){
      if (newTag) {
        b.tag = newTag;
      } else {
        // empty → remove the tagged break entry
        state.breakLogs.splice(i,1);
      }
      changed = true;
    }
  }
  if (changed){
    saveState();
    updateTagsPanel();
    requestDraw();
  }
}


  // ---------- TODOs ----------
function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function pruneOldCompletedTodos(dayStart){
  // Keep incomplete todos always.
  // Keep completed todos only if completed today.
  const before = state.todos.length;
  state.todos = state.todos.filter(t => !t.done || (t.completedAt != null && t.completedAt >= dayStart && t.completedAt < dayStart + msPerDay));
  if (state.todos.length !== before) saveState();
}

function addTodoFlow(){
  const text = (prompt('New task:') || '').trim();
  if (!text) return;
  state.todos.push({ id: uid(), text, done: false, created: Date.now() });
  saveState();
  renderTodos();
}

function toggleTodoById(id, done){
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  t.done = !!done;
  if (t.done) t.completedAt = Date.now();
  else delete t.completedAt;
  saveState();
  renderTodos();
}

function renderTodos(){
  const { start: dayStart } = todayBounds(new Date());

  const view = state.todos.filter(t =>
    !t.done || (t.completedAt != null && t.completedAt >= dayStart && t.completedAt < dayStart + msPerDay)
  );

  // Sort: incomplete first (by created), then completed (by completedAt asc)
  view.sort((a,b)=>{
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done && !b.done) return (a.created||0) - (b.created||0);
    const ac = a.completedAt || 0, bc = b.completedAt || 0;
    return ac - bc;
  });

  todosUL.innerHTML = view.map(t=>(
    `<li class="todo-item ${t.done ? 'todo-done':''}">
       <input type="checkbox" data-id="${t.id}" ${t.done ? 'checked':''} />
       <span class="todo-text" data-id="${t.id}" title="Click to rename">${escapeHtml(t.text)}</span>
     </li>`
  )).join('') || `<li class="todo-item"><span class="todo-text">—</span></li>`;
}

function deleteTodoById(id){
  const idx = state.todos.findIndex(x => x.id === id);
  if (idx >= 0){
    state.todos.splice(idx,1);
    saveState();
    renderTodos();
  }
}


// Events
if (addTodoBtn) addTodoBtn.addEventListener('click', addTodoFlow);

if (todosUL) {
  todosUL.addEventListener('click', (e)=>{
    const el = e.target;
    if (el && el.matches('input[type="checkbox"][data-id]')){
      toggleTodoById(el.getAttribute('data-id'), el.checked);
    }
    if (el && el.matches('.todo-text[data-id]')){
      const id = el.getAttribute('data-id');
      const t  = state.todos.find(x => x.id === id);
      if (!t) return;
      const input = prompt('Rename task:', t.text);
      if (input === null) return; // cancelled
      const val = input.trim();
      if (!val){
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
  tagsWorkUL.addEventListener('click', (e)=>{
    const lbl = e.target.closest('.label[data-tag]');
    if (!lbl) return;
    const oldTag = lbl.getAttribute('data-tag') || '';
    const input = prompt('Rename work tag:', oldTag);
    if (input === null) return; // cancelled
    const newTag = input.trim();
    renameWorkTag(oldTag, newTag);
  });
}

if (tagsBreakUL) {
  tagsBreakUL.addEventListener('click', (e)=>{
    const lbl = e.target.closest('.label[data-tag]');
    if (!lbl) return;
    const oldTag = lbl.getAttribute('data-tag') || '';
    const input = prompt('Rename break tag:', oldTag);
    if (input === null) return; // cancelled
    const newTag = input.trim();
    renameBreakTag(oldTag, newTag);
  });
}



  // ---------- Helpers ----------
  function escapeHtml(s){ return s ? s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) : s; }
})();

