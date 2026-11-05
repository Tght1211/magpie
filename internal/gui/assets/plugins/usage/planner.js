// The Usage plugin's planning page. It only reads existing authenticated APIs.
function quotaPlannerPage(ctx) {
  let controller;
  ctx.slots.add('page', {
    key: 'quota-planner', title: 'Quota planner',
    html: '<div class="qp"><div class="qp-tools"><div class="segs" id="qpTabs"></div><span class="grow"></span><button class="text" id="qpReload" data-t>Refresh</button></div><p id="qpStatus" class="v-caption" role="status"></p><div id="qpBody"></div></div>',
    mount(main) { controller?.dispose(); controller = quotaPlannerController(main); },
    open() { return controller.load(); },
    refresh() { return controller.load(); },
    reload() { return controller.load(true); },
    relang() { controller.draw(); },
    costs() { controller.draw(); },
    leave() { controller.leave(); },
  });
  ctx.onDispose(() => controller?.dispose());
}
function quotaPlannerController(main) {
  const M = quotaPlannerModel, box = main.querySelector('#qpBody'), statusBox = main.querySelector('#qpStatus');
  const state = { explorer: {scale:'week',start:Date.now()-86400000,rescue:true,data:null,busy:false}, tab: 'plan', policy: 'harvest', demand: null, optimization: null, scenarioOptimization: null, demo: null, selected: '', stage: 0, goal: 'eligible', pace: null, key: '', accounts: [], usage: null, errors: [], loaded: false };
  let timelineGeneration=0, expiredPace=false, resizeFrame, drag=null;
  let generation = 0, pending = false, timer, paceTimer, clockTimer, numberFrame, deferredDraw = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const shown = () => !main.hidden && !document.hidden;
  const draw = (preserveInput = false) => {
    if (!shown()) return;
    if (drag) { deferredDraw=true; return; }
    const restoreChartFocus=box.contains(document.activeElement)&&document.activeElement.matches('[data-qp-explore]');
    if (preserveInput && box.contains(document.activeElement) && document.activeElement.matches('input')) { deferredDraw = true; return; }
    deferredDraw = false;
    const previous = new Map([...box.querySelectorAll('[data-qp-number]')].filter(e => e.dataset.qpValue !== '').map(e => [e.dataset.qpNumber, Number(e.dataset.qpCurrent ?? e.dataset.qpValue)]));
    cancelAnimationFrame(numberFrame);
    const top = main.scrollTop;
    main.querySelector('#qpTabs').innerHTML = [['plan', 'Quota planner'], ['trend', 'Consumption curve'], ['keys', 'Key benefits'], ['mechanism', 'How quota harvest works']].map(([id, label]) => `<button class="opt ${state.tab === id ? 'on' : ''}" data-tab="${id}" aria-pressed="${state.tab === id}">${quotaPlannerView.esc(t(label))}</button>`).join('');
    statusBox.textContent = state.errors.length ? t('Some planning data could not be read. Refresh to try again.') : state.loaded ? t('Live usage every 15 seconds · allowance and plan every minute') : t('Loading…');
    box.innerHTML = state.loaded ? quotaPlannerView.render(state) : '';
    main.scrollTop = top;
    if(restoreChartFocus)box.querySelector('[data-qp-explore]')?.focus({preventScroll:true});
    tick();
    const changes = [...box.querySelectorAll('[data-qp-number]')].filter(e => previous.has(e.dataset.qpNumber) && e.dataset.qpValue !== '' && Number(e.dataset.qpValue) !== previous.get(e.dataset.qpNumber));
    if (!motion.matches && changes.length) {
      const start = performance.now();
      const animate = at => {
        if (!shown()) return;
        const part = Math.min(1, (at - start) / 650), eased = 1 - (1 - part) ** 3;
        for (const el of changes) {
          const from = previous.get(el.dataset.qpNumber), value = from + (Number(el.dataset.qpValue) - from) * eased;
          el.dataset.qpCurrent = value;
          el.innerHTML = quotaPlannerView.liveFormat(value, el.dataset.qpKind);
        }
        if (part < 1) numberFrame = requestAnimationFrame(animate);
      };
      numberFrame = requestAnimationFrame(animate);
    }
  };
  function tick() {
    if (!shown()) return;
    const pace=box.querySelector('[data-pace-until]');
    if(pace && Date.now()>Number(pace.dataset.paceUntil) && !expiredPace){expiredPace=true;draw(true);return;}
    for(const el of box.querySelectorAll('[data-qp-age]'))el.textContent=t('{seconds} s ago',{seconds:Math.max(0,Math.floor((Date.now()-Number(el.dataset.qpAge))/1000))});
    for (const el of box.querySelectorAll('[data-qp-countdown]')) {
      const seconds = Math.max(0, Math.ceil((Number(el.dataset.qpCountdown) - Date.now()) / 1000));
      el.textContent = seconds === 0 ? t('Awaiting confirmation') : [Math.floor(seconds / 3600),Math.floor(seconds / 60) % 60,seconds % 60].map(v => String(v).padStart(2,'0')).join(':');
    }
  }
  function startClock() { clearInterval(clockTimer); clockTimer = setInterval(tick,1000); }
  async function refreshPace() {
    if (!shown()) return;
    const seq = generation;
    try {
      const data = await api('usage/quota-pool');
      if (seq !== generation || !shown()) return;
      if (!Array.isArray(data)) throw Error('Invalid pool readings');
      state.accounts = state.accounts.map(a => ({...a, hourly:data.find(d => d.provider === a.provider && d.user?.toLowerCase() === a.user?.toLowerCase())?.hourly || []}));
      state.paceError = false; expiredPace=false;
    } catch { if (seq !== generation || !shown()) return; state.paceError = true; state.accounts = state.accounts.map(a => ({...a,hourly:[]})); }
    draw(true);
    paceTimer = setTimeout(refreshPace,15000);
  }
  const leave = () => { drag=null;generation++; timelineGeneration++; scenarioGeneration++; demoGeneration++; pending = false; clearTimeout(timer); clearTimeout(paceTimer); clearInterval(clockTimer); cancelAnimationFrame(numberFrame); };
  async function load(asked = false) {
    if (!shown() || pending) return;
    pending = true;
    clearTimeout(timer);
    clearTimeout(paceTimer);
    const seq = ++generation;
    main.querySelector('#qpReload').disabled = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const results = await Promise.allSettled([api('usage/quotas' + (asked ? '?asked=1' : '')), api('usage/quotas/history?days=all'), api('usage?period=30d&tz=' + encodeURIComponent(zone)), api('usage/quota-pool'), api('usage/quota-plan')]);
    if (seq !== generation || !shown()) return;
    pending = false;
    main.querySelector('#qpReload').disabled = false;
    const get = (i, array) => results[i].status === 'fulfilled' && (array ? Array.isArray(results[i].value) : typeof results[i].value?.calls === 'number') ? results[i].value : null;
    const quotas = get(0, true), hist = get(1, true), usage = get(2, false);
    state.errors = [quotas === null && 'quota', hist === null && 'history', usage === null && 'usage'].filter(Boolean);
    const poolData = get(3, true);
    if (poolData === null) state.errors.push('pool');
    state.accounts = quotas ? M.enrich(M.accounts(quotas, hist || []), poolData || [], window.state?.settings || (typeof window.poolPlannerSettings === 'function' ? window.poolPlannerSettings() : {})) : [];
    window.noteAccounts?.(quotas || []);
    state.usage = usage;
    state.optimization = results[4]?.status === 'fulfilled' && Array.isArray(results[4].value?.input?.accounts) ? results[4].value : null;
    state.loaded = true; expiredPace=false;loadTimeline();
    if (!state.accounts.some(a => a.id === state.selected)) { state.selected = M.ranked(state.accounts)[0]?.id || state.accounts[0]?.id || ''; state.stage = 0; state.pace = null; }
    if(state.demand!==null) solveScenario();
    draw(true);
    startClock();
    paceTimer = setTimeout(refreshPace,15000);
    timer = setTimeout(() => load(), 60000);
  }
  async function loadTimeline() {
    const seq=++timelineGeneration, ex=state.explorer, r=quotaExplorer.range(ex);ex.busy=true;ex.error=false;
    try {const data=await api('usage/quota-plan?history=1&from='+Math.round(r.from)+'&to='+Math.round(r.to));if(seq!==timelineGeneration||!shown())return;
      if(!Array.isArray(data.bins))throw Error('Invalid timeline');ex.data=data;ex.earliest=data.earliest||ex.earliest;
    }catch{if(seq!==timelineGeneration||!shown())return;ex.error=true;}
    if(seq===timelineGeneration){ex.busy=false;draw(true);}
  }
  function moveTimeline(start,scale=state.explorer.scale) {
    const ex=state.explorer;ex.scale=scale;const span=quotaExplorer.range(ex).span;
    ex.start=Math.max(ex.earliest||1,Math.min(start,Date.now()+9*365*86400000-span));
    ex.data=null;loadTimeline();draw();
  }
  let scenarioGeneration=0;
  async function solveScenario() {
    const seq=++scenarioGeneration;
    state.scenarioOptimization=null;
    const original=state.optimization?.input;
    if(state.demand===null || !original?.accounts?.length)return;
    const input=structuredClone(original), groups=[...new Set(input.accounts.map(a=>a.group||''))];
    const total=Object.values(input.demands||{}).reduce((a,b)=>a+b,0);
    if(total<=0&&groups.length!==1)return;
    input.demand=state.demand;
    input.demands=Object.fromEntries(groups.map(g=>[g,total>0?state.demand*(input.demands[g]||0)/total:state.demand]));
    try { const result=await api('usage/quota-plan/demo',input);if(seq===scenarioGeneration){state.scenarioOptimization={input,result,demandKnown:true};draw();} } catch { if(seq===scenarioGeneration)draw(); }
  }
  let demoGeneration=0;
  async function solveDemo() {
    const d=state.demo||(state.demo=quotaPlannerDemo.initial()), seq=++demoGeneration;
    d.busy=true; d.error=false; draw();
    try {const result=await api('usage/quota-plan/demo',d.input);if(seq!==demoGeneration)return;d.result=result;d.dirty=false;} catch {if(seq===demoGeneration)d.error=true;}
    if(seq===demoGeneration){d.busy=false;draw();}
  }
  function click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if(b.dataset.qpScale){moveTimeline(state.explorer.start,b.dataset.qpScale);return;}
    if(b.dataset.qpMove){const r=quotaExplorer.range(state.explorer);moveTimeline(b.dataset.qpMove==='now'?Date.now()-r.span/7:r.from+Number(b.dataset.qpMove)*r.span*.75);return;}
    if(b.dataset.qpRescue){state.explorer.rescue=!state.explorer.rescue;draw();return;}
    if (b.dataset.demo) { if(b.dataset.demo==='restore')state.demo=quotaPlannerDemo.initial();else quotaPlannerDemo.action(state.demo,b.dataset.demo,b.dataset.demoAccount);solveDemo();return;}
    if (b.id === 'qpReload') { leave(); load(true); return; }
    if (b.dataset.policy !== undefined) state.policy = b.dataset.policy;
    if (b.dataset.tab) {state.tab = b.dataset.tab; if(state.tab==='mechanism'&&!state.demo){state.demo=quotaPlannerDemo.initial();solveDemo();}}
    if (b.dataset.account !== undefined) { state.selected = state.accounts[Number(b.dataset.account)]?.id || ''; state.stage = 0; state.pace = null; }
    if (b.dataset.stage !== undefined) { state.stage = Number(b.dataset.stage); state.pace = null; }
    if (b.dataset.goal) state.goal = b.dataset.goal;
    if (b.dataset.key !== undefined) state.key = b.dataset.key === 'all' ? '' : state.usage?.callerKeys?.[Number(b.dataset.key)]?.id || '';
    if (b.dataset.pace !== undefined) state.pace = null;
    draw();
  }
  function input(e) {
    if (e.target.dataset.demoField) { if(!state.demo.busy){quotaPlannerDemo.field(state.demo,e.target);demoGeneration++;} return; }
    if(e.target.dataset.demoRuntime){state.demo.runtime[e.target.dataset.demoRuntime]=e.target.checked;draw();return;}
    if (e.target.id === 'qpDemand') return;
    if (e.target.id !== 'qpPace') return;
    state.pace = Number(e.target.value);
    // Keep the slider (and keyboard/pointer focus) in place while its chart changes.
    quotaPlannerView.updateForecast(box, state);
  }
  function change(e) {
    if(e.target.id==='qpDate'){const date=new Date(e.target.value+'T00:00:00');if(Number.isFinite(+date))moveTimeline(+date);return;}
    if(e.target.id==='qpDemand') { state.demand=e.target.value===''?null:Math.max(0,Number(e.target.value));solveScenario();draw(); }
    if(e.target.dataset.demoField)draw();
  }
  function visible() { if (shown()) load(); else leave(); }
  function resized(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>draw(true));}
  window.addEventListener('resize',resized);
  function pointerDown(e){const chart=e.target.closest('[data-qp-explore]');if(!chart||e.button!==0)return;drag={x:e.clientX,y:e.clientY,start:state.explorer.start,width:chart.clientWidth,chart};chart.setPointerCapture(e.pointerId);}
  function pointerUp(e){if(!drag)return;const d=drag;drag=null;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy))moveTimeline(d.start-dx/d.width*quotaExplorer.range(state.explorer).span);else if(deferredDraw)draw(true);}
  function pointerCancel(){drag=null;if(deferredDraw)draw(true);}
  function keydown(e){if(!e.target.matches('[data-qp-explore]'))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();moveTimeline(state.explorer.start+(e.key==='ArrowRight'?1:-1)*quotaExplorer.range(state.explorer).span*.25);}}
  main.addEventListener('pointercancel',pointerCancel);main.addEventListener('pointerdown',pointerDown);main.addEventListener('pointerup',pointerUp);main.addEventListener('keydown',keydown);
  const obs = new MutationObserver(visible);
  obs.observe(main, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', visible);
  function blur() { if (deferredDraw) queueMicrotask(() => draw(true)); }
  main.addEventListener('focusout', blur);
  main.addEventListener('click', click);
  main.addEventListener('input', input);
  main.addEventListener('change', change);
  return { draw, load, leave, dispose() { window.removeEventListener('resize',resized);cancelAnimationFrame(resizeFrame);main.removeEventListener('pointercancel',pointerCancel);main.removeEventListener('pointerdown',pointerDown);main.removeEventListener('pointerup',pointerUp);main.removeEventListener('keydown',keydown);demoGeneration++; scenarioGeneration++; leave(); obs.disconnect(); document.removeEventListener('visibilitychange', visible); main.removeEventListener('focusout', blur); main.removeEventListener('click', click); main.removeEventListener('input', input);main.removeEventListener('change',change); } };
}
