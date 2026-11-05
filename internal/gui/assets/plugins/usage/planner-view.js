// Chart-led views; all API text is escaped, and all dates use the reader's zone.
const quotaPlannerView = (() => {
  const M = quotaPlannerModel;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (k, args) => esc(t(k, args));
  const n = v => Number.isFinite(v) ? new Intl.NumberFormat(document.documentElement.lang || 'en', { maximumFractionDigits: 1 }).format(v) : '—';
  const stamp = v => Number.isFinite(v) ? esc(new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(v)) : '—';
  const color = a => `var(--c${(a.colorIndex ?? a.index) % 7 + 1})`;
  const name = a => esc(a?.user || a?.alias || t('Unknown'));
  const money = v => Number.isFinite(v) ? esc(ledMoney(v)) : '—';
  const dot = a => `<i class="v-dot" style="background:${color(a)}"></i>`;
  const panel = (label, body, note = '') => `<section class="v-panel"><div class="v-panel-head"><h2>${tr(label)}</h2></div>${body}${note ? `<p class="v-caption">${tr(note)}</p>` : ''}</section>`;
  const svg = (label, body, height = 270, cls = '') => `<svg class="v-svg ${cls}" role="img" aria-label="${tr(label)}" viewBox="0 0 1000 ${height}">${body}</svg>`;
  const empty = key => `<p class="v-empty">${tr(key)}</p>`;
  const metric = (label, value, sub) => `<div><small>${tr(label)}</small><b>${value}</b><span>${sub || ''}</span></div>`;
  function ring(a) {
    return `<svg class="v-ring" width="62" height="62" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="32" cy="32" r="26" fill="none" stroke="${color(a)}" stroke-width="5" stroke-dasharray="${(a.left ?? 0) * 1.634} 164" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle">${n(a.left)}${a.left === null ? '' : '%'}</text></svg>`;
  }
  function accountCards(s) {
    return `<div class="v-account-grid">${s.accounts.map(a => `<button class="v-account ${a.id === s.selected ? 'selected' : ''}" data-account="${a.index}" aria-pressed="${a.id === s.selected}">${ring(a)}<span class="v-account-info"><b>${name(a)} <small class="plan">${esc(a.plan)}</small></b><span>${tr('Estimated full week')} · ${money(a.estimate?.full)}</span><em>${tr(a.known ? a.blocked ? 'Held by another limit' : 'Weekly remaining' : 'Reading needs verification')} · ${stamp(a.read)}</em><small>${tr('Natural reset')} · ${stamp(a.reset)}</small></span></button>`).join('')}</div>`;
  }
  function selected(s) {
    const a = s.accounts.find(a => a.id === s.selected) || s.accounts[0];
    if (!a) return {};
    const ws = M.windows(a, s.goal), w = ws[Math.min(s.stage, ws.length - 1)], obs = M.observed(a);
    const pace = s.pace ?? (obs.rate === null ? 0 : Math.round(obs.rate * 10) / 10);
    return { a, w, ws, obs, pace };
  }
  function windowTabs(s) {
    const { ws = [] } = selected(s);
    return `<div class="segs qp-window-tabs">${ws.map((w, i) => `<button class="opt ${i === Math.min(s.stage, ws.length - 1) ? 'on' : ''}" data-stage="${i}">${tr(w.kind === 'reset' ? 'Before natural reset' : w.future ? 'After reset, before card expiry' : 'Before card expiry')}</button>`).join('')}</div>`;
  }
  function assumptions() {
    return `<details class="v-details"><summary>${tr('Planning assumptions and data scope')}</summary><p>${tr('Deadlines guide this preview; it is not an optimal scheduler. Existing routing and session affinity still decide actual accounts.')}</p><p>${tr('Scenario only: a card can be used at 80% remaining or below; review it one hour before expiry. Using it may move the next weekly reset. No card is spent here.')}</p><p>${tr('Future refills assume 100%. Refresh after the boundary to confirm the vendor reading. Percentages of different plans are never added.')}</p></details>`;
  }
  function timeline(s) {
    const now = Date.now(), all = s.accounts.flatMap(a => M.windows(a, s.goal));
    if (!all.length) return empty('No verified future window yet. Refresh the allowance reading.');
    const end = Math.max(...all.map(w => w.end)) + M.hour;
    const x = at => 155 + Math.max(0, Math.min(1, (at - now) / (end - now))) * 810;
    const height = 65 + s.accounts.length * 76;
    let b = '';
    for (let i = 0; i <= 4; i++) {
      const at = now + (end - now) * i / 4;
      b += `<line x1="${x(at)}" x2="${x(at)}" y1="34" y2="${height - 20}" class="v-grid"/><text x="${x(at)}" y="22" text-anchor="${i === 4 ? 'end' : i === 0 ? 'start' : 'middle'}">${stamp(at)}</text>`;
    }
    for (const a of s.accounts) {
      const y = 65 + a.index * 76, ws = M.windows(a, s.goal);
      b += `<text x="12" y="${y}" class="v-axis-name"><title>${name(a)}</title>${esc(a.user?.length>22?a.user.slice(0,20)+'…':a.user)}</text><text x="12" y="${y + 20}">${n(a.left)}% · ${esc(a.plan)}</text><rect x="155" y="${y - 13}" width="810" height="24" rx="5" fill="var(--line-2)"/>`;
      if (!ws.length) b += `<text x="165" y="${y + 4}">${tr('Reading needs verification')}</text>`;
      for (const w of ws) {
        b += `<rect x="${x(w.start)}" y="${y - 13}" width="${Math.max(1, x(w.end) - x(w.start))}" height="24" rx="5" fill="${color(a)}" opacity="${w.future ? '.3' : a.left > 0 && !a.blocked ? '.65' : '.12'}"><title>${tr(w.future ? 'Assumed future window' : 'Current allowance window')} · ${stamp(w.start)} → ${stamp(w.end)}</title></rect>`;
        b += w.kind === 'reset' ? `<circle cx="${x(w.end)}" cy="${y - 1}" r="6" fill="var(--card)" stroke="${color(a)}" stroke-width="2"/>` : `<path d="M${x(w.end)} ${y - 8}l7 7-7 7-7-7Z" fill="var(--amber)"/>`;
      }
      if (a.expiry <= end) b += `<line x1="${x(a.expiry)}" x2="${x(a.expiry)}" y1="${y - 20}" y2="${y + 18}" stroke="var(--red)"/>`;
      b += `<text x="155" y="${y + 34}">${tr(a.blocked ? 'Held by another limit' : a.left === 0 ? 'Waiting for a refill' : 'Inspect this account before its next deadline')}</text>`;
    }
    return `<div class="v-scroll">${svg('Account deadline timeline', b, height, 'v-timeline')}</div><div class="v-legend"><span><i class="v-reset-mark"></i>${tr('Natural reset')}</span><span><i class="v-card-mark"></i>${tr('Card review')}</span><span>${tr('Vertical line: expiry · pale bar: assumed refill')}</span></div>`;
  }
  function budget(s) {
    const { a, w } = selected(s);
    if (!w) return empty('No verified future window yet. Refresh the allowance reading.');
    return `${windowTabs(s)}<div class="v-budget-title"><b>${n(w.need)}<small>${tr('percentage points')}</small></b><span>${name(a)} · ${tr('Target consumption')}</span></div><div class="v-meter"><i style="width:${w.need}%;background:${color(a)}"></i><i style="width:${Math.min(w.initial, w.target)}%;background:var(--line)"></i></div><div class="v-budget-axis"><span>${tr('Starting remaining')} ${n(w.initial)}%</span><span>${tr('Target remaining')} ${w.target}%</span></div><div class="v-budget-meta"><span>${stamp(w.start)} → ${stamp(w.end)}</span><b>${n(w.rate)} ${tr('pp / hour')}</b></div>${w.future ? `<p class="v-caption">${tr('Assumed future window')}</p>` : ''}`;
  }
  function calendar(s) {
    const days = new Map(); let unknown = 0;
    for (const a of s.accounts) {
      const cards = a.cards.filter(c => c.at > Date.now());
      if (!cards.length && a.expiry > Date.now()) cards.push({ at: a.expiry });
      unknown += Math.max(0, (a.count || 0) - cards.length);
      for (const c of cards) {
        const d = new Date(c.at).toLocaleDateString(document.documentElement.lang || 'en');
        if (!days.has(d)) days.set(d, []);
        days.get(d).push({ a, at: c.at });
      }
    }
    return `<div class="v-calendar">${[...days].sort((a, b) => a[1][0].at - b[1][0].at).map(([d, cs]) => `<div class="v-calendar-day"><div><b>${esc(d)}</b><small>${cs.length}</small></div>${cs.sort((a, b) => a.at - b.at).map(c => `<span>${dot(c.a)}<b>${name(c.a)}</b><time>${stamp(c.at)}</time></span>`).join('')}</div>`).join('')}</div>${!days.size ? empty('No dated reset cards reported.') : ''}${unknown ? `<p class="v-caption">${tr('{n} cards without a verified future expiry', { n: unknown })}</p>` : ''}`;
  }
  function plan(s) {
    const first = M.ranked(s.accounts)[0];
    return `<div class="v-action"><div class="v-action-main"><small class="v-kicker">${tr('Suggested attention now')}</small><h2>${first ? `${name(first)} · ${tr('Earliest usable deadline')}` : tr('Waiting for a verified available account')}</h2><p>${tr('A guide for new work, not a command to switch active sessions.')}</p></div></div>${accountCards(s)}${panel('Account deadline timeline', timeline(s))}<div class="v-two-col">${panel('Allowance to use before the deadline', budget(s))}${panel('Reset card expiry calendar', calendar(s))}</div>${assumptions()}`;
  }
  function consumption(s) {
    const { a, w, obs, pace } = selected(s);
    if (!w) return empty('No verified future window yet. Refresh the allowance reading.');
    // A future cycle starts its own plot: never connect old balances to a synthetic refill.
    const pts = w.future ? [] : obs.points;
    const start = pts.length ? Math.min(M.time(pts[0].at), w.start) : w.start;
    const x = at => 55 + (at - start) / Math.max(1, w.end - start) * 910, y = left => 225 - M.share(left) * 1.8;
    let b = '';
    for (const v of [0, 20, 40, 60, 80, 100]) b += `<line x1="55" x2="965" y1="${y(v)}" y2="${y(v)}" class="v-grid"/><text x="43" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    if (pts.length) b += `<polyline points="${pts.map(p => `${x(M.time(p.at))},${y(p.left)}`).join(' ')}" fill="none" stroke="${color(a)}" stroke-width="2.5"/>`;
    const finish = Math.max(0, w.initial - pace * w.hours), emptyAt = pace > 0 ? Math.min(w.end, w.start + w.initial / pace * M.hour) : w.end;
    b += `<polyline points="${x(w.start)},${y(w.initial)} ${x(emptyAt)},${y(finish)} ${x(w.end)},${y(finish)}" fill="none" stroke="${color(a)}" stroke-width="2.5" stroke-dasharray="7 5"/><line x1="${x(w.start)}" y1="${y(w.initial)}" x2="${x(w.end)}" y2="${y(Math.min(w.initial, w.target))}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="2 5"/>`;
    for (let i = 0; i <= 3; i++) { const at = start + (w.end - start) * i / 3; b += `<text x="${x(at)}" y="250" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${stamp(at)}</text>`; }
    return svg('Consumption curve', b, 275, 'v-consumption');
  }
  function result(s) {
    const { w, pace } = selected(s);
    if (!w) return '';
    const left = Math.max(0, w.initial - pace * w.hours), met = left <= w.target;
    return `<div class="v-forecast-result ${met ? 'good' : 'warn'}"><span class="v-result-icon">${met ? '✓' : '!'}</span><div><b>${tr('Projected remaining')} ${n(left)}%</b><p>${tr(met ? 'This scenario meets the target.' : 'This scenario leaves allowance above the target.')}</p></div></div>`;
  }
  function historyCards(s) {
    return `<div class="v-spark-grid">${s.accounts.map(a => {
      const ps = a.points, start = M.time(ps[0]?.at), end = M.time(ps.at(-1)?.at);
      let d = '';
      ps.forEach((p, i) => { d += `${i === 0 || M.newCycle(ps[i - 1], p) ? 'M' : 'L'}${10 + (M.time(p.at) - start) / Math.max(1, end - start) * 280} ${75 - p.left * .6} `; });
      return `<button class="v-spark-card ${a.id === s.selected ? 'selected' : ''}" data-account="${a.index}"><header>${dot(a)}${name(a)}<b>${n(a.left)}%</b></header><svg viewBox="0 0 300 85" role="img" aria-label="${tr('Recorded remaining allowance')}"><path d="${d}" fill="none" stroke="${color(a)}" stroke-width="2"/></svg><small>${ps.length ? `${stamp(start)} → ${stamp(end)}` : tr('No history samples yet.')}</small></button>`;
    }).join('')}</div>`;
  }
  function trend(s) {
    const { a, w, obs, pace } = selected(s);
    return `${accountCards(s)}${windowTabs(s)}<div class="v-metrics">${metric('Weekly remaining', `${n(a.left)}%`, stamp(a.read))}${metric('Observed pace', n(obs.rate), tr('pp / hour'))}${metric('Required pace', n(w?.rate), tr('pp / hour'))}</div>${panel('Consumption curve', `${w ? `<div class="v-forecast-toolbar"><div class="v-legend"><span><i class="v-line"></i>${tr('Recorded samples')}</span><span><i class="v-line dash"></i>${tr('Scenario')}</span><span><i class="v-line target"></i>${tr('Target pace')}</span></div>${w.kind === 'card' ? `<div class="segs"><button class="opt ${s.goal === 'eligible' ? 'on' : ''}" data-goal="eligible">${tr('Reach card threshold')}</button><button class="opt ${s.goal === 'all' ? 'on' : ''}" data-goal="all">${tr('Use remaining allowance')}</button></div>` : ''}</div>` : ''}<div class="v-scroll" id="qpForecast">${consumption(s)}</div>${w ? `<p class="v-caption">${w.future ? tr('Waiting {n} hours is omitted; the plot starts at the assumed refill.', { n: n((w.start - a.now) / M.hour) }) : tr('Forecast begins with the latest reading; actual use since that reading may differ.')}</p><div class="v-pace-controls"><label for="qpPace">${tr('Scenario pace')}<input id="qpPace" type="range" min="0" max="${Math.max(12, Math.ceil(w.rate * 2), Math.ceil(pace))}" step="0.1" value="${pace}"><output id="qpPaceValue">${n(pace)}</output><span>${tr('pp / hour')}</span></label><button class="text" data-pace="observed" ${obs.rate === null ? 'disabled' : ''}>${tr('Use observed pace')}</button></div><div id="qpForecastResult">${result(s)}</div>` : ''}`)}${panel('Recorded remaining allowance', historyCards(s))}${assumptions()}`;
  }
  function daily(u) {
    const pts = u.series || [], max = Math.max(1, ...pts.map(p => p.calls || 0)), step = 900 / Math.max(1, pts.length);
    let b = `<line x1="50" x2="960" y1="220" y2="220" class="v-grid"/>`;
    pts.forEach((p, i) => {
      const x = 55 + i * step, good = Math.max(0, (p.calls || 0) - (p.errors || 0)), bad = p.errors || 0;
      b += `<rect x="${x}" y="${220 - good / max * 170}" width="${Math.max(1, step - 4)}" height="${good / max * 170}" rx="2" fill="var(--c2)"><title>${stamp(M.time(p.time))} · ${n(p.calls)} ${tr('Requests')}</title></rect><rect x="${x}" y="${220 - (good + bad) / max * 170}" width="${Math.max(1, step - 4)}" height="${bad / max * 170}" fill="var(--amber)"/>`;
      if (i % Math.max(1, Math.ceil(pts.length / 5)) === 0) b += `<text x="${x}" y="244">${esc(p.label)}</text>`;
    });
    b += `<text x="50" y="30">${n(max)} ${tr('Requests')}</text>`;
    return `<div class="v-scroll">${svg('Pool request history', b, 270, 'v-daily')}</div>`;
  }
  function keys(s) {
    const u = s.usage;
    if (!u) return empty('Usage data could not be read.');
    const groups = u.callerKeys || [], picked = groups.find(k => k.id === s.key), val = picked || u, c = M.cache(val);
    const pct = c.rate === null ? '—' : c.rate > 0 && c.rate < .001 ? '&lt;0.1%' : `${n(c.rate * 100)}%`;
    const selectedName = picked ? esc(picked.name || picked.callerKeyName || picked.id) : tr('All gateway keys');
    const bars = `<div class="v-rank-bars">${groups.map((k, i) => {
      const share = u.calls > 0 ? (k.calls || 0) / u.calls : 0;
      return `<button class="v-rank-row ${picked === k ? 'selected' : ''}" data-key="${i}" aria-pressed="${picked === k}"><span>${esc(k.name || k.callerKeyName || k.id)}</span><span class="v-rank-track"><i style="width:${share * 100}%"></i></span><b>${n(k.calls)}</b><small>${share > 0 && share < .001 ? '&lt;0.1' : n(share * 100)}%</small></button>`;
    }).join('')}</div>`;
    const donut = `<div class="v-donut"><svg viewBox="0 0 190 180" role="img" aria-label="${tr('Cached input share')}"><circle cx="95" cy="86" r="58" fill="none" stroke="var(--line)" stroke-width="14"/><circle cx="95" cy="86" r="58" fill="none" stroke="var(--c1)" stroke-width="14" stroke-dasharray="${(c.rate || 0) * 364.4} 365" transform="rotate(-90 95 86)"/><text x="95" y="88" text-anchor="middle" class="v-donut-value">${pct}</text><text x="95" y="108" text-anchor="middle">${tr('Cached input share')}</text></svg></div><div class="v-cache-rows"><span>${tr('Cache read tokens')}<b>${n(val.cache_read)}</b></span><span>${tr('Output tokens')}<b>${n(val.output)}</b></span><span>${tr('Unknown cache requests')}<b>${n(val.cache_unknown_calls || 0)}</b></span></div>`;
    return `<div class="v-view-tools"><button class="text" data-key="all">${tr('All gateway keys')}</button><b>${selectedName}</b><span>${tr('Last 30 days · gateway calls')}</span></div><div class="v-metrics">${metric('Requests', n(val.calls), selectedName)}${metric('Cached input share', pct, tr('Known prompt tokens only'))}${metric('Output tokens', n(val.output), tr('Measured usage'))}</div><div class="v-key-grid">${panel('Pool request history', daily(u), 'Pool-wide history; selecting a key changes the metrics and cache chart only.')}${panel('Cache reuse', donut, 'Cache read / known input tokens, including cache writes. This is not a request hit rate.')}</div><div class="v-key-grid">${panel('Requests by gateway key', bars || empty('No gateway key breakdown yet.'))}${panel('Account pool benefit', `<div class="v-benefit-flow"><div><span class="v-flow-icon">1</span><b>${tr('Fixed single account')}</b><small>${tr('Not calculated')}</small></div><span class="v-flow-arrow">→</span><div class="observed"><span class="v-flow-icon">N</span><b>${tr('Current account pool')}</b><small>${tr('Measured usage')}</small></div><span class="v-flow-arrow">→</span><div><span class="v-flow-icon">N</span><b>${tr('Optimized account pool')}</b><small>${tr('Not calculated')}</small></div></div>`, 'Capacity gains and scheduling gains require separate counterfactuals. Unsubmitted demand and avoided waste cannot be inferred from these records.')}</div>`;
  }
  function render(s) {
    if (s.tab === 'mechanism') return quotaPlannerDemo.render(s.demo || quotaPlannerDemo.initial());
    if (s.tab === 'keys') return keys(s);
    if (!s.accounts.length) return empty(s.errors.includes('quota') ? 'Allowance data could not be read.' : 'No subscription accounts are available to plan.');
    return poolOverview(s) + (s.tab === 'trend' ? trend(s) : plan(s));
  }
  function updateForecast(box, s) {
    const chart = box.querySelector('#qpForecast'), out = box.querySelector('#qpPaceValue'), res = box.querySelector('#qpForecastResult');
    if (chart) chart.innerHTML = consumption(s);
    if (out) out.textContent = n(s.pace);
    if (res) res.innerHTML = result(s);
  }

  const policies=[['harvest','Quota harvest'],['','Smart'],['order','In order'],['drain','Until used up'],['rotate','In turn'],['usage','Least used first'],['pace','Use before expiry'],['weight','By weight'],['free','Free first'],['fast','Speed first']];
  const scenarioPolicies=new Set(['order','drain','rotate','usage','pace']);
  const optimization=s=>s.demand===null?s.optimization:s.scenarioOptimization;
  function poolChart(p) {
    if(!p.coverage || p.rate===null || !p.forecast?.points?.length) return empty('Not enough matched quota and priced usage samples.');
    const future=p.forecast.points, now=p.now, start=now-24*M.hour, end=future.at(-1).at;
    const x=at=>65+(at-start)/(end-start)*900;
    // Past allowance samples are revalued at today's calibration; gaps and
    // reset boundaries stay broken instead of implying unobserved balances.
    const past=[];
    for(let at=start;at<=now;at+=M.hour) {
      const values=p.accounts.map(a=>{const pt=a.points.filter(q=>M.time(q.at)<=at).at(-1);return pt && at-M.time(pt.at)<=2*M.hour && M.time(pt.resetsAt)>at ? pt.left*a.estimate.full/100 : null;});
      past.push({at,values,total:values.some(v=>v===null)?null:values.reduce((v,w)=>v+w,0)});
    }
    const max=Math.max(1,p.full,...future.map(v=>v.total)), y=v=>265-v/max*210;
    let b='';
    for(let i=0;i<=4;i++){const v=max*i/4;b+=`<line x1="65" x2="965" y1="${y(v)}" y2="${y(v)}" class="v-grid"/><text x="54" y="${y(v)+4}" text-anchor="end">${money(v)}</text>`;}
    const draw=(pts,forecast)=>{
      let runs=[],run=[];for(const pt of pts){if(pt.total===null){if(run.length)runs.push(run);run=[];}else run.push(pt);}if(run.length)runs.push(run);
      return runs.map(run=>p.accounts.map((a,i)=>{
        const low=pt=>pt.values.slice(0,i).reduce((v,w)=>v+w,0),high=pt=>low(pt)+pt.values[i];
        const d=run.map((pt,j)=>`${j?'L':'M'}${x(pt.at)},${y(high(pt))}`).join(' ')+run.slice().reverse().map(pt=>`L${x(pt.at)},${y(low(pt))}`).join(' ')+'Z';
        return `<path class="v-pool-area" d="${d}" fill="${color(a)}" opacity="${forecast?'.28':'.65'}"><title>${name(a)} · ${tr(forecast?'Forecast':'Estimated remaining')}</title></path>`;
      }).join('')).join('');
    };
    b+=draw(past,false)+draw(future,true);
    b+=`<polyline points="${future.map(pt=>`${x(pt.at)},${y(pt.total)}`).join(' ')}" fill="none" stroke="var(--fg-2)" stroke-width="2" stroke-dasharray="6 4"/>`;
    b+=`<line x1="${x(now)}" x2="${x(now)}" y1="35" y2="265" stroke="var(--muted)" stroke-dasharray="3 4"/><text x="${x(now)+5}" y="28">${tr('Now')}</text>`;
    for(const e of p.forecast.events) b+=`<circle cx="${x(e.at)}" cy="275" r="4" fill="${e.kind==='card'?'var(--amber)':'var(--fg-2)'}"><title>${stamp(e.at)} · ${name(p.accounts.find(a=>a.id===e.id))} · ${tr(e.kind==='card'?'Conditional card refill':'Natural reset')} +${money(e.gain)}</title></circle>`;
    for(let i=0;i<=4;i++){const at=start+(end-start)*i/4;b+=`<text x="${x(at)}" y="302" text-anchor="${i===0?'start':i===4?'end':'middle'}">${stamp(at)}</text>`;}
    return `<div class="v-scroll">${svg('Pool allowance forecast',b,325,'v-pool-chart')}</div><div class="v-legend">${p.accounts.map(a=>`<span>${dot(a)}${name(a)}</span>`).join('')}</div>`;
  }
  function poolRate(p) {
    if(!p.hourly.length)return empty('Not enough matched quota and priced usage samples.');
    const max=Math.max(.01,p.required,...p.hourly.map(v=>v.cost)), x=i=>65+i*900/24, y=v=>185-v/max*140;
    let b=`<line x1="65" x2="965" y1="${y(p.required)}" y2="${y(p.required)}" stroke="var(--amber)" stroke-dasharray="5 4"/><text x="965" y="25" text-anchor="end">${tr('Recommended pace')} ${money(p.required)} / h</text>`;
    p.hourly.forEach((v,i)=>b+=`<rect x="${x(i)}" y="${y(v.cost)}" width="24" height="${185-y(v.cost)}" fill="var(--c1)" opacity=".7"><title>${stamp(v.at)} · ${money(v.cost)} · ${n(v.tokens)} tokens</title></rect>`);
    for(let i=0;i<=2;i++){const v=max*i/2;b+=`<text x="54" y="${y(v)+4}" text-anchor="end">${money(v)}</text>`;}
    b+=`<text x="65" y="210">${stamp(p.hourly[0].at-M.hour)}</text><text x="965" y="210" text-anchor="end">${stamp(p.hourly.at(-1).at)}</text>`;
    return `<div class="v-scroll">${svg('Recorded consumption per hour',b,235,'v-pool-chart')}</div>`;
  }
  function comparison(s,p,compact=false) {
    if(!p.coverage || p.rate===null) return empty('Not enough matched quota and priced usage samples.');
    const rows=compact?policies.filter(([id])=>id===s.policy):policies;
    if(!rows.length)return empty('This policy needs model, latency or weight data; no reliable forecast yet.');
    return `<div class="v-scroll"><table class="v-pool-table"><thead><tr>${['Routing','Projected use · 72 h','Remaining after 72 h','Unused at refills','Average tokens / s'].map(k=>`<th>${tr(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(([id,label])=>{
      const opt=optimization(s), f=id==='harvest'?(opt?.demandKnown?opt.result:null):scenarioPolicies.has(id)?M.simulate(p.accounts,id,p.rate):null;
      const title=compact?tr(label):`<button class="text" data-policy="${id}" aria-pressed="${id===s.policy}">${tr(label)}</button>`;
      return `<tr ${id===s.policy?'class="selected"':''}><td>${title}</td>${f?.points?.length?`<td>${money(f.spent)}</td><td>${money(f.remaining)}</td><td>${money(f.waste)}</td><td>${n(f.tokens/(72*3600))}</td>`:`<td colspan="4">${tr(id==='harvest'?'Not enough matched quota and priced usage samples.':'This policy needs model, latency or weight data; no reliable forecast yet.')}</td>`}</tr>`;
    }).join('')}</tbody></table></div><p class="v-caption">${tr('Same demand for every scenario; 30-minute sessions. Token rate is an average usage pace, not model generation speed. Model limits, cache changes and parallel sessions can change results.')}</p>`;
  }

  function poolOverview(s) {
    const opt=optimization(s), scope=s.optimization?.input?.accounts;
    const accounts=scope?scope.map(v=>{const a=s.accounts.find(a=>a.id===v.id);return a?{...a,estimate:{...a.estimate,full:v.full,tokens:v.tokens}}:null;}).filter(Boolean):s.accounts;
    const p=M.pool(accounts,s.policy,s.demand);
    if(scope)p.count=s.optimization.total;
    if(s.policy==='harvest') {
      p.forecast=opt?.demandKnown&&opt.result?.points?.length?opt.result:{points:[],events:[]};
      if(opt?.demandKnown)p.rate=opt.input.demand;
    } else if(!scenarioPolicies.has(s.policy))p.forecast={points:[],events:[]};
    const next=p.forecast.events?.[0],ready=p.coverage>0;
    return `<div class="v-metrics">${metric('Estimated pool remaining',ready?money(p.total):'—',tr('{n} of {total} accounts calibrated',{n:p.coverage,total:p.count}))}${metric('Estimated full week',ready?money(p.full):'—',tr('API-equivalent allowance'))}${metric('Recommended pace',ready?money(p.required)+' / h':'—',tr('Current allowance deadlines'))}</div>${panel('Pool allowance forecast',`<div class="v-view-tools"><label>${tr('Scenario demand · USD / h')} <input id="qpDemand" type="number" min="0" step="0.1" placeholder="${n(p.observed)}" value="${s.demand??''}"></label><span>${tr('Past 24 hours → next 72 hours')}</span></div>${poolChart(p)}${next?`<p class="v-caption">${tr('Next refill')} · ${stamp(next.at)} · ${name(s.accounts.find(a=>a.id===next.id))} · ${tr(next.kind==='card'?'Conditional card refill':'Natural reset')} +${money(next.gain)}</p>`:''}`, 'Each color is one account. Past balances use the current calibration; pale areas are forecasts. Unused cards are excluded from the current balance.')}${panel('Recorded consumption per hour',poolRate(p),'Actual gateway usage at API list prices; unknown prices are excluded and missing hours stay unknown.')}${panel('Routing scenario comparison',comparison(s,p),'These are comparable scenarios, not guaranteed savings or a globally optimal schedule.')}${panel('Calibration details',`<div class="v-scroll"><table class="v-pool-table"><thead><tr>${['Account','Estimated full week','Calibration window','Matched decline','Samples','Auto-use before expiry'].map(k=>`<th>${tr(k)}</th>`).join('')}</tr></thead><tbody>${s.accounts.map(a=>`<tr><td>${dot(a)}${name(a)}</td><td>${money(a.estimate?.full)}</td><td>${a.estimate?stamp(a.estimate.since)+' → '+stamp(a.estimate.through):'—'}</td><td>${n(a.estimate?.used)} pp</td><td>${n(a.estimate?.samples)}</td><td>${tr(a.auto?'Enabled':'Off')}</td></tr>`).join('')}</tbody></table></div>`,'Estimates depend on model and cache mix. Use outside magpie can understate capacity. Missing accounts are not zero. Currency follows Settings; this is not a cash balance.')}`;
  }
  function routingPreview(accounts,policy,optimization=null) {const s={accounts,policy,demand:null,optimization};const p=M.pool(accounts,policy);return comparison(s,p,true);}
  function demoResult(d) {
    const accounts=d.input.accounts.map((a,i)=>({id:a.id,user:a.id,index:i,colorIndex:i,estimate:{full:a.full},points:[]}));
    const p={accounts,forecast:d.result,now:d.input.now,full:d.input.accounts.reduce((v,a)=>v+a.full,0),coverage:accounts.length,rate:d.input.demand};
    return panel('Pool allowance forecast',poolChart(p))+`<div class="v-metrics">${metric('Projected use · 72 h',money(d.result.spent))}${metric('Remaining after 72 h',money(d.result.remaining))}${metric('Unused at refills',money(d.result.waste))}</div>`;
  }
  return { render, esc, updateForecast, routingPreview, demoResult };

})();
