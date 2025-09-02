
(() => {
  'use strict';
  const STORE_KEY = 'ot.v3.state';
  const msPerMinute = 60*1000, msPerHour = 60*msPerMinute, msPerDay = 24*msPerHour, tau = Math.PI*2;
  const state = JSON.parse(localStorage.getItem(STORE_KEY) || '{"sessions":[], "goalMinutes":240, "theme":"light"}');

  // Apply theme consistently with main app
  document.documentElement.classList.toggle('dark', state.theme === 'dark');

  const dayStartOf = (d)=> new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  function segmentsForDay(dayStart, nowMs=Date.now()) {
    const dayEnd = dayStart + msPerDay, segs=[];
    state.sessions.forEach((sess)=>{
      const s=sess.start, e=(sess.end==null)? nowMs : sess.end;
      if (e<=dayStart || s>=dayEnd) return;
      const a=Math.max(s,dayStart), b=Math.min(e,dayEnd);
      if (b>a) segs.push({ startMs:a, endMs:b });
    });
    segs.sort((a,b)=>a.startMs-b.startMs);
    return segs;
  }
  function minuteRanges(dayStart, segs){
    const r = segs.map(seg=>[
      Math.floor((seg.startMs-dayStart)/msPerMinute),
      Math.ceil((seg.endMs-dayStart)/msPerMinute)
    ]).sort((a,b)=>a[0]-b[0]);
    const out=[]; for (const x of r){ if (!out.length || x[0]>out[out.length-1][1]) out.push(x.slice()); else out[out.length-1][1]=Math.max(out[out.length-1][1], x[1]); }
    return out;
  }
  const fmtHM = (mins)=>`${Math.floor(mins/60)}h ${Math.round(mins%60)}m`;

  function drawCake(canvas, mranges){
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 120, cssH = canvas.clientHeight || 120;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    const w=canvas.width,h=canvas.height,cx=w/2,cy=h/2,R=Math.min(w,h)*0.48;

    ctx.clearRect(0,0,w,h);
    // base disk (no circle stroke)
    ctx.save(); ctx.translate(cx,cy);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ring-bg').trim();
    ctx.beginPath(); ctx.arc(0,0,R,0,tau); ctx.fill();

    // green work ranges
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    for (const [m0,m1] of mranges){
      const a0=(m0/1440)*tau - Math.PI/2, a1=(m1/1440)*tau - Math.PI/2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R,a0,a1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const weeksEl = document.getElementById('weeks');
  const today = new Date();
  const days=[];
  for (let i=0;i<28;i++){
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate()-i);
    const ds = dayStartOf(d);
    const segs = segmentsForDay(ds);
    const mr = minuteRanges(ds, segs);
    const secs = segs.reduce((acc,s)=>acc+(s.endMs-s.startMs)/1000,0);
    days.push({ date:d, mranges:mr, totalMin: secs/60 });
  }
  function weekLabel(d){
    const onejan = new Date(d.getFullYear(),0,1), dayms=86400000;
    const week = Math.ceil((((d - onejan) / dayms) + onejan.getDay()+1)/7);
    return `${d.getFullYear()} — Week ${week}`;
  }
  const groups={}; for (const day of days) (groups[weekLabel(day.date)] ||= []).push(day);

  for (const [lbl, group] of Object.entries(groups)){
    const sec = document.createElement('section'); sec.className='week';
    const h2 = document.createElement('h2'); h2.textContent = lbl; sec.appendChild(h2);
    const grid = document.createElement('div'); grid.className='grid'; sec.appendChild(grid);
    for (const item of group){
      const card = document.createElement('div'); card.className='daycell';
      const c = document.createElement('canvas'); c.width=120; c.height=120;
      drawCake(c, item.mranges);
      const label = document.createElement('div'); label.className='label';
      const dateStr = item.date.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric'});
      label.textContent = `${dateStr} • ${fmtHM(item.totalMin)}`;
      card.appendChild(c); card.appendChild(label); grid.appendChild(card);
    }
    weeksEl.appendChild(sec);
  }
})();

