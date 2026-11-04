// Chart-led views; all API text is escaped, and all dates use the reader's zone.
const quotaPlannerView = (() => {
  const M = quotaPlannerModel;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (k, args) => esc(t(k, args));
  const n = v => Number.isFinite(v) ? new Intl.NumberFormat(document.documentElement.lang || 'en', { maximumFractionDigits: 1 }).format(v) : '—';
  const stamp = v => Number.isFinite(v) ? esc(new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(v)) : '—';
  const color = a => `var(--c${a.index % 3 + 1})`;
  const name = a => tr('Account {n}', { n: a.index + 1 });
  const dot = a => `<i class="v-dot" style="background:${color(a)}"></i>`;
  const panel = (label, body, note = '') => `<section class="v-panel"><div class="v-panel-head"><h2>${tr(label)}</h2></div>${body}${note ? `<p class="v-caption">${tr(note)}</p>` : ''}</section>`;
  const svg = (label, body, height = 270, cls = '') => `<svg class="v-svg ${cls}" role="img" aria-label="${tr(label)}" viewBox="0 0 1000 ${height}">${body}</svg>`;
  const empty = key => `<p class="v-empty">${tr(key)}</p>`;
  const metric = (label, value, sub) => `<div><small>${tr(label)}</small><b>${value}</b><span>${sub || ''}</span></div>`;
  function ring(a) {
    return `<svg class="v-ring" width="62" height="62" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="5"/><circle cx="32" cy="32" r="26" fill="none" stroke="${color(a)}" stroke-width="5" stroke-dasharray="${(a.left ?? 0) * 1.634} 164" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle">${n(a.left)}${a.left === null ? '' : '%'}</text></svg>`;
  }
  function accountCards(s) {
    return `<div class="v-account-grid">${s.accounts.map(a => `<button class="v-account ${a.id === s.selected ? 'selected' : ''}" data-account="${a.index}" aria-pressed="${a.id === s.selected}">${ring(a)}<span class="v-account-info"><b>${name(a)} <small class="plan">${esc(a.plan)}</small></b><span>${esc(a.user)}</span><em>${tr(a.known ? a.blocked ? 'Held by another limit' : 'Weekly remaining' : 'Reading needs verification')} · ${stamp(a.read)}</em><small>${tr('Natural reset')} · ${stamp(a.reset)}</small></span></button>`).join('')}</div>`;
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
      b += `<text x="12" y="${y}" class="v-axis-name">${name(a)}</text><text x="12" y="${y + 20}">${n(a.left)}% · ${esc(a.plan)}</text><rect x="155" y="${y - 13}" width="810" height="24" rx="5" fill="var(--line-2)"/>`;
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
    if (s.tab === 'keys') return keys(s);
    if (!s.accounts.length) return empty(s.errors.includes('quota') ? 'Allowance data could not be read.' : 'No Codex accounts are available to plan.');
    return s.tab === 'trend' ? trend(s) : plan(s);
  }
  function updateForecast(box, s) {
    const chart = box.querySelector('#qpForecast'), out = box.querySelector('#qpPaceValue'), res = box.querySelector('#qpForecastResult');
    if (chart) chart.innerHTML = consumption(s);
    if (out) out.textContent = n(s.pace);
    if (res) res.innerHTML = result(s);
  }
  return { render, esc, updateForecast };
})();
