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
  const policies=[['harvest','Quota harvest'],['','Smart'],['order','In order'],['drain','Until used up'],['rotate','In turn'],['usage','Least used first'],['pace','Use before expiry'],['weight','By weight'],['free','Free first'],['fast','Speed first']];
  const scenarioPolicies=new Set(['order','drain','rotate','usage','pace']);
  const optimization=s=>s.demand===null?s.optimization:s.scenarioOptimization;
  function comparison(s,p,compact=false) {
    const opt=optimization(s),input=opt?.input,accounts=opt?.demandKnown?M.scenarioAccounts(s.accounts,input):null;
    if(!accounts||!Number.isFinite(input.demand))return empty('Not enough matched quota and priced usage samples.');
    const rows=compact?policies.filter(([id])=>id===s.policy):policies;
    if(!rows.length)return empty('This policy needs model, latency or weight data; no reliable forecast yet.');
    return `<div class="v-scroll"><table class="v-pool-table"><thead><tr>${['Routing','Projected use · 72 h','Remaining after 72 h','Unused at refills','Average tokens / s'].map(k=>`<th>${tr(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(([id,label])=>{
      const f=id==='harvest'?opt.result:scenarioPolicies.has(id)?M.simulate(accounts,id,input.demand,input.hours,input.demands):null;
      const title=compact?tr(label):`<button class="text" data-policy="${id}" aria-pressed="${id===s.policy}">${tr(label)}</button>`;
      return `<tr ${id===s.policy?'class="selected"':''}><td>${title}${id==='harvest'&&f?.status==='bounded-feasible'?`<small class="v-caption">${tr('Bounded search · not a guaranteed optimum')}</small>`:''}</td>${f?.points?.length?`<td>${money(f.spent)}</td><td>${money(f.remaining)}</td><td>${money(f.waste)}</td><td>${n(f.tokens/(input.hours*3600))}</td>`:`<td colspan="4">${tr(id==='harvest'?'Not enough matched quota and priced usage samples.':'This policy needs model, latency or weight data; no reliable forecast yet.')}</td>`}</tr>`;
    }).join('')}</tbody></table></div><p class="v-caption">${tr('Same calibrated accounts and demand. Quota harvest uses bounded optimization; other policies use a simplified 30-minute-session simulation. These estimates are not a guaranteed ranking. Token rate is average consumption, not generation speed.')}</p>`;
  }

  const liveFormat = (value, kind) => kind === 'ratio' ? n(value) + '×' : money(value) + (kind === 'rate' ? ' / h' : '');
  const liveNumber = (key, value, kind = 'money') => `<span data-qp-number="${key}" data-qp-value="${Number.isFinite(value) ? value : ''}" data-qp-kind="${kind}">${Number.isFinite(value) ? liveFormat(value, kind) : '—'}</span>`;
  function pacePanel(p, s) {
    const v = M.pace(p), tokenRate=v.actual===null?null:(p.hourly.at(-1)?.tokens??0)/3600, next = p.forecast.events?.find(e => e.at > Date.now());
    const words = {fast:'Using faster than target',slow:'Using slower than target',steady:'On pace',unknown:'Pace needs fresh data'};
    const advice = {fast:'Slow down to stretch the current allowance.',slow:'There is room to use more before the next deadline.',steady:'Consumption is close to the recommended pace.',unknown:'A complete recent hour is needed for this comparison.'};
    return `<section class="v-panel v-live-pace" data-pace-state="${v.status}" data-pace-until="${v.at+90000}"><div class="v-panel-head"><h2>${tr('Consumption pace')}</h2><span class="v-pace-badge">${tr(words[v.status])}</span></div>
      <div class="v-pace-summary"><div><small>${tr('Measured · last 60 minutes')}</small><b>${liveNumber('pace-actual',v.actual,'rate')}</b></div><span class="v-pace-versus">/</span><div><small>${tr('Recommended pace')}</small><b>${liveNumber('pace-target',v.target,'rate')}</b></div><strong>${liveNumber('pace-ratio',v.ratio,'ratio')}</strong></div>
      <div class="v-pace-gauge" role="img" aria-label="${tr(words[v.status])}"><span></span><span></span><span></span>${v.ratio !== null ? `<i style="left:${Math.min(98,Math.max(2,v.ratio*50))}%"></i>` : ''}</div>
      <div class="v-pace-labels"><span>${tr('Slower')}</span><span>${tr('Target band · ±20%')}</span><span>${tr('Faster pace')}</span></div>
      <p class="v-pace-advice">${tr(advice[v.status])}${v.delta !== null ? ` <b>${tr(v.delta > 0 ? '{amount} / h above target' : '{amount} / h below target',{amount:ledMoney(Math.abs(v.delta))})}</b>` : ''}</p>
      <div class="v-pace-footer"><span>${tr('Average tokens / s')} <b>${n(tokenRate)}</b></span><span>${tr('Current balance runway · excludes refills')} <b>${v.runway === null ? '—' : tr('{hours} h',{hours:n(v.runway)})}</b></span>${next ? `<span>${tr(next.kind==='rescue'?'Emergency card refill':next.kind==='card'?'Conditional card refill':'Next refill')} <b data-qp-countdown="${next.at}"></b></span>` : ''}</div>
      <p class="v-caption">${tr('Completed requests only. Live pace is independent of the scenario demand below.')} ${v.at?`<span data-qp-age="${v.at}"></span>`:''}</p></section>`;
  }
  function routingPreview(accounts,policy,optimization=null) {const s={accounts,policy,demand:null,optimization};const p=M.pool(accounts,policy);return comparison(s,p,true);}
  return {esc,tr,n,stamp,color,name,money,dot,panel,svg,empty,metric,pacePanel,liveNumber,comparison,optimization,routingPreview,liveFormat};
})();
