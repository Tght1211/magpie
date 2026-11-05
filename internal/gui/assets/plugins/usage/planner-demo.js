// The explanation and the production planner call the same pure solver.
const quotaPlannerDemo = (() => {
  const hour=3600000, esc=v=>quotaPlannerView.esc(v), tr=k=>esc(t(k));
  function initial() {
    const now=Date.now();
    return {input:{now,hours:72,demand:3,demands:{codex:2,claude:1},accounts:[
      {id:'alpha@example.test',group:'codex',full:100,left:78,tokens:1000000,reset:now+140*hour,periodHours:168,auto:true,leadMinutes:30,blocked:false,cards:[{id:'a',expiry:now+36*hour}]},
      {id:'beta@example.test',group:'codex',full:60,left:35,tokens:600000,reset:now+10*hour,periodHours:168,auto:true,leadMinutes:30,blocked:false,cards:[{id:'b',expiry:now+40*hour}]},
      {id:'gamma@example.test',group:'claude',full:80,left:44,tokens:800000,reset:now+5*hour,periodHours:168,auto:false,leadMinutes:30,blocked:false,cards:[]}
    ]},runtime:{busy:false,session:false,timeout:false},result:null,busy:false,error:false,dirty:false};
  }
  function render(d) {
    const input=(key,value,index,min=0)=>`<input type="number" min="${min}" step="1" data-demo-field="${key}" data-demo-account="${index}" value="${value}" ${d.busy?'disabled':''}>`;
    const controls=d.input.accounts.map((a,i)=>`<tr><td>${esc(a.id)}<small>${esc(a.group)}</small></td><td>${input('full',a.full,i,1)}</td><td>${input('left',a.left,i)}</td><td>${input('reset',(a.reset-d.input.now)/hour,i,.1)}</td><td>${input('periodHours',a.periodHours,i,1)}</td><td>${a.cards.length}${a.cards.map((c,j)=>`<label class="v-card-expiry">${tr('Card expires in hours')} <input type="number" min="0.1" step="0.5" data-demo-field="expiry" data-demo-card="${j}" data-demo-account="${i}" value="${(c.expiry-d.input.now)/hour}" ${d.busy?'disabled':''}></label>`).join('')}<button class="text" data-demo="card" data-demo-account="${i}" ${d.busy||a.group!=='codex'?'disabled':''}>${tr('Add reset card')}</button><button class="text" data-demo="refill" data-demo-account="${i}" ${d.busy?'disabled':''}>${tr('Simulate official reset')}</button></td></tr>`).join('');
    const r=d.result;
    return `<section class="v-panel"><div class="v-panel-head"><h2>${tr('How quota harvest works')}</h2></div><p class="v-caption">${tr('This sandbox uses fictional accounts and the same solver. It never changes live accounts, routing or reset cards.')}</p><div class="v-benefit-flow"><div><b>${tr('Measure')}</b><small>${tr('Matched decline')}</small></div><span>→</span><div><b>${tr('Build events')}</b><small>${tr('Natural reset')} / ${tr('Card review')}</small></div><span>→</span><div><b>${tr('Optimize')}</b><small>${tr('Minimum-cost flow')}</small></div><span>→</span><div><b>${tr('Replan')}</b><small>${tr('New readings')}</small></div></div><div class="v-scroll"><table class="v-pool-table"><thead><tr>${['Account','Full week · USD','Remaining %','Reset in hours','Cycle hours','Reset cards'].map(k=>`<th>${tr(k)}</th>`).join('')}</tr></thead><tbody>${controls}</tbody></table></div><div class="v-view-tools"><label>Codex · USD/h ${input('codex',d.input.demands.codex,'demand')}</label><label>Claude · USD/h ${input('claude',d.input.demands.claude,'demand')}</label><button class="text" data-demo="solve" ${d.busy?'disabled':''}>${tr(d.busy?'Computing…':'Recalculate')}</button><button class="text" data-demo="restore">${tr('Restore example')}</button></div><p role="status" class="v-caption">${tr(d.error?'Invalid scenario; check the inputs.':d.dirty?'Inputs changed; recalculate to update the forecast.':r?.status==='bounded-feasible'?'Feasible within the computation budget':'Discrete optimization completed')}</p></section>${r&&!d.dirty?quotaPlannerView.demoResult(d)+dispatch(d):''}<section class="v-panel"><h2>${tr('The mathematical model')}</h2><p class="v-caption">${tr('Each account is an inventory. A natural reset replaces its remaining inventory with a full allowance. A used card does the same and moves the next natural reset by one cycle.')}</p><p class="v-formula">Bᵢ(t + Δt) = max(0, Bᵢ(t) − xᵢ(t))<br>Bᵢ(reset⁺) = Cᵢ · card ⇒ next reset = t + Tᵢ<br>Σᵢ∈group xᵢ(t) ≤ demand(group, t)</p><p class="v-caption">${tr('The solver maximizes served demand first, then reduces allowance and cards lost at deadlines. Time-expanded minimum-cost flow allocates inventory; discrete search chooses card use. Results are optimal only within the stated time grid and card candidates.')}</p><p class="v-caption">${tr('Every new reading rebuilds the future plan. Added cards create new optional refills; an observed official reset replaces the starting balance. Claude has only natural refills. Historical measurements are never rewritten.')}</p><p class="v-caption">${tr('Planning uses one-hour demand slots plus exact event times, a 72-hour horizon, up to eight card decisions and a 400 ms search budget. Existing conversations retain affinity; short-window limits and changing workloads can reduce realized throughput.')}</p><p class="v-caption">${tr('Cards are reviewed before expiry, only with auto-use enabled and at most 80% remaining. A natural reset before card expiry is preserved. An unused card is an opportunity, not current balance.')}</p></section>`;
  }
  function dispatch(d) {
    const budgets=new Map();for(const x of d.result.allocations||[])if(x.from<d.input.now+hour)budgets.set(x.id,(budgets.get(x.id)||0)+x.amount);
    const eligible=d.input.accounts.filter(a=>a.group==='codex'&&!a.blocked&&a.left>0).sort((a,b)=>(budgets.get(b.id)||0)-(budgets.get(a.id)||0));
    const target=eligible[0], current=d.input.accounts[1];
    let candidates=[...eligible];
    if(d.runtime.session&&candidates.includes(current))candidates=[current,...candidates.filter(a=>a!==current)];
    if(d.runtime.busy)candidates=candidates.filter(a=>a!==target);
    if(d.runtime.timeout)candidates=candidates.slice(1);
    const choice=candidates[0];
    return `<section class="v-panel"><h2>${tr('Final request choice')}</h2><p class="v-caption">${tr('Illustrative Codex dispatch: the quota target is advisory. Busy accounts yield to compatible accounts; a timeout follows configured fallbacks. Claude demand remains separate.')}</p><div class="v-view-tools">${[['busy','Simulate full concurrency'],['session','Keep this session'],['timeout','Simulate timeout']].map(([key,label])=>`<label><input type="checkbox" data-demo-runtime="${key}" ${d.runtime[key]?'checked':''}> ${tr(label)}</label>`).join('')}</div><div class="v-benefit-flow"><div><small>${tr('Quota target')}</small><b data-demo-target>${esc(target?.id||'—')}</b></div><span>→</span><div><small>${tr('Final request choice')}</small><b data-demo-choice>${choice?esc(choice.id):tr('No compatible account available')}</b></div></div><p class="v-caption">${tr('Affinity keeps the current account unless it cannot serve. Capacity and failures can override the quota target. Model changes use configured compatible fallbacks only.')}</p></section>`;
  }
  function field(d,e) {
    const key=e.dataset.demoField,index=e.dataset.demoAccount,v=Number(e.value);
    if(!Number.isFinite(v))return;
    if(index==='demand')d.input.demands[key]=v;
    else if(key==='expiry'&&d.input.accounts[index]?.cards[e.dataset.demoCard])d.input.accounts[index].cards[e.dataset.demoCard].expiry=d.input.now+v*hour;
    else if(d.input.accounts[index])d.input.accounts[index][key]=key==='reset'?d.input.now+v*hour:v;
    d.dirty=true;
  }
  function action(d,kind,index) {
    const a=d.input.accounts[index];
    if(kind==='card'&&a?.group==='codex')a.cards.push({id:'demo-'+a.cards.length,expiry:d.input.now+12*hour});
    if(kind==='refill'&&a){a.left=100;a.reset=d.input.now+a.periodHours*hour;}
    d.dirty=true;
  }
  return {initial,render,field,action};
})();
