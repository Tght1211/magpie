// The Usage planner reads authenticated measurements; only explicit member binding writes settings.
function quotaPlannerPage(ctx) {
  let controller;
  ctx.slots.add('page', {
    key: 'quota-planner', title: 'Quota planner',
    html: '<div class="qp"><div id="qpHeader"></div><div class="tabs" id="qpTabs" role="tablist"></div><p id="qpStatus" class="v-caption" role="status" hidden></p><div id="qpBody" role="tabpanel"></div></div>',
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
  const state = { explorer: {scale:'week',start:Date.now()-86400000,rescue:true,data:null,busy:false}, tab: 'plan', composition:'accounts', forecastMode:'recommended', healthLoad:100, unit:null, members:null, admission:{left:100,cards:0}, auto:true, policy: 'harvest', demand: null, optimization: null, scenarioOptimization: null, accounts: [], errors: [], loaded: false };
  const headerTools=main.querySelector('#qpHeader'),headerHost=document.querySelector('body > header.top');
  if(headerHost){headerTools.className='qp qp-header-tools';headerHost.append(headerTools);}
  let timelineGeneration=0, expiredPace=false, resizeFrame, healthFrame, drag=null;
  let generation = 0, pending = false, timer, paceTimer, clockTimer, numberFrame, deferredDraw = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const shown = () => !main.hidden && !document.hidden;
  const draw = (preserveInput = false) => {
    if (!shown()) return;
    if (drag) { deferredDraw=true; return; }
    const restoreChartFocus=box.contains(document.activeElement)&&document.activeElement.matches('[data-qp-explore]');
    if (preserveInput && box.contains(document.activeElement) && document.activeElement.matches('input')) { deferredDraw = true; return; }
    deferredDraw = false;
    const advanced=box.querySelector('.qp-health-advanced'),admission=box.querySelector('.qp-health-admission');
    if(advanced)state.healthAdvanced=advanced.open;if(admission)state.healthAdmission=admission.open;
    const previous = new Map([...box.querySelectorAll('[data-qp-number]')].filter(e => e.dataset.qpValue !== '').map(e => [e.dataset.qpNumber, Number(e.dataset.qpCurrent ?? e.dataset.qpValue)]));
    cancelAnimationFrame(numberFrame);
    const top = main.scrollTop;
    state.loading=pending;
    headerTools.hidden=false;headerTools.innerHTML=quotaDashboard.settingsBar(state);
    main.querySelector('#qpTabs').innerHTML = [['plan', 'Quota planner'], ['health', 'Pool health']].map(([id, label]) => `<button class="${state.tab === id ? 'on' : ''}" role="tab" tabindex="${state.tab===id?0:-1}" aria-controls="qpBody" data-tab="${id}" aria-selected="${state.tab === id}" aria-pressed="${state.tab === id}">${quotaPlannerView.esc(t(label))}</button>`).join('');
    statusBox.textContent = state.errors.length ? t('Some planning data could not be read. Refresh to try again.') : state.loaded ? t(state.auto?'Live usage every 15 seconds · allowance and plan every minute':'Automatic refresh paused') + (state.updated?' · '+new Date(state.updated).toLocaleTimeString(): '') : t('Loading…');
    box.innerHTML = state.loaded ? quotaDashboard.render(state) : '<p class="v-empty">'+quotaPlannerView.tr('Loading…')+'</p>';
    const reload=main.querySelector('#qpReload');if(reload)reload.disabled=pending;
    statusBox.hidden=!state.errors.length;
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
          el.innerHTML = quotaDashboard.liveFormat(value, el.dataset.qpKind);
        }
        if (part < 1) numberFrame = requestAnimationFrame(animate);
      };
      numberFrame = requestAnimationFrame(animate);
    }
  };
  function tick() {
    if (!shown()) return;
    const refresh=box.querySelector('#qpRefreshStatus'),progress=box.querySelector('#qpRefreshProgress');
    if(refresh)refresh.textContent=(state.auto?t('Usage every 15 seconds'):t('Automatic refresh paused'))+' · '+(state.updated?new Date(state.updated).toLocaleTimeString()+' · '+t('{seconds} s ago',{seconds:Math.max(0,Math.floor((Date.now()-state.updated)/1000))}):t('Loading…'));
    if(progress)progress.style.transform='scaleX('+(state.auto&&state.updated?Math.min(1,Math.max(0,(Date.now()-state.updated)/15000)):0)+')';
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
    if (!shown() || !state.auto) return;
    const seq = generation;
    try {
      const data = await api('usage/quota-pool');
      if (seq !== generation || !shown()) return;
      if (!Array.isArray(data)) throw Error('Invalid pool readings');
      state.accounts = state.accounts.map(a => ({...a, hourly:data.find(d => d.provider === a.provider && d.user?.toLowerCase() === a.user?.toLowerCase())?.hourly || []}));
      state.paceError = false; expiredPace=false; state.updated=Date.now();
    } catch { if (seq !== generation || !shown()) return; state.paceError = true; state.accounts = state.accounts.map(a => ({...a,hourly:[]})); }
    draw(true);
    if(state.auto)paceTimer = setTimeout(refreshPace,15000);
  }
  const leave = () => { headerTools.hidden=true;drag=null;generation++; timelineGeneration++; scenarioGeneration++; pending = false; clearTimeout(timer); clearTimeout(paceTimer); clearInterval(clockTimer); cancelAnimationFrame(numberFrame); cancelAnimationFrame(healthFrame); };
  async function load(asked = false) {
    if (!shown() || pending) return;
    pending = true;
    clearTimeout(timer);
    clearTimeout(paceTimer);
    const seq = ++generation;
    if(main.querySelector('#qpReload'))main.querySelector('#qpReload').disabled=true;
    const results = await Promise.allSettled([api('usage/quotas' + (asked ? '?asked=1&all=1' : '')), api('usage/quotas/history?days=all'), api('usage/quota-pool'), api('usage/quota-plan'), api('usage/quota-members')]);
    if (seq !== generation || !shown()) return;
    pending = false;
    if(main.querySelector('#qpReload'))main.querySelector('#qpReload').disabled=false;
    const get = i => results[i].status === 'fulfilled' && Array.isArray(results[i].value) ? results[i].value : null;
    const quotas = get(0), hist = get(1);
    state.errors = [quotas === null && 'quota', hist === null && 'history'].filter(Boolean);
    const poolData = get(2);
    if (poolData === null) state.errors.push('pool');
    state.accounts = quotas ? M.enrich(M.accounts(quotas, hist || []), poolData || [], window.state?.settings || (typeof window.poolPlannerSettings === 'function' ? window.poolPlannerSettings() : {})) : [];
    window.noteAccounts?.(quotas || []);
    state.optimization = results[3]?.status === 'fulfilled' && Array.isArray(results[3].value?.input?.accounts) ? results[3].value : null;
    if(!state.optimization)state.errors.push('plan');
    state.members=results[4]?.status==='fulfilled'&&Array.isArray(results[4].value?.members)&&Array.isArray(results[4].value?.accounts)&&Array.isArray(results[4].value?.usage?.rows)?results[4].value:null;
    if(!state.members)state.errors.push('members');
    state.updated=Date.now(); state.loaded = true; expiredPace=false;loadTimeline();
    if(state.demand!==null) solveScenario();
    draw(true);
    startClock();
    if(state.auto)paceTimer = setTimeout(refreshPace,15000);
    if(state.auto)timer = setTimeout(() => load(), 60000);
  }
  async function loadTimeline() {
    const seq=++timelineGeneration, ex=state.explorer, r=quotaExplorer.range(ex);ex.busy=true;ex.error=false;
    try {const data=await api('usage/quota-plan?history=1&from='+Math.round(r.from)+'&to='+Math.round(r.to));if(seq!==timelineGeneration||!shown())return;
      if(!Array.isArray(data.bins))throw Error('Invalid timeline');ex.data=data;ex.earliest=data.earliest||ex.earliest;
    }catch{if(seq!==timelineGeneration||!shown())return;ex.error=true;}
    if(seq===timelineGeneration){ex.busy=false;draw(true);}
  }
  function moveTimeline(start,scale=state.explorer.scale) {
    const ex=state.explorer;ex.scale=scale;state.inspectAt=null;state.pinned=false;const span=quotaExplorer.range(ex).span;
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
    try { const result=await api('usage/quota-plan/demo',input);if(seq===scenarioGeneration){state.scenarioOptimization={input,result,demandKnown:true,coverage:state.optimization.coverage,total:state.optimization.total};draw();} } catch { if(seq===scenarioGeneration)draw(); }
  }
  function click(e) {
    const track=e.target.closest('.qp-health-track');
    if(track&&state.healthData){const rect=track.getBoundingClientRect();quotaDashboard.inspectHealth(box,state,state.healthData.from+(e.clientX-rect.left)/rect.width*86400000);return;}
    const b = e.target.closest('button');
    if (!b) return;
    if(b.dataset.healthEvent){quotaDashboard.inspectHealth(box,state,Number(b.dataset.healthEvent));return;}
    if(b.hasAttribute('data-health-load-reset')){cancelAnimationFrame(healthFrame);state.healthLoad=100;draw();return;}
    if(b.dataset.qpUnit){state.unit=b.dataset.qpUnit;draw();return;}
    if(b.hasAttribute('data-qp-theme')){const dark=document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'light':'dark';draw();return;}
    if(b.dataset.forecastMode){state.forecastMode=b.dataset.forecastMode;state.demand=null;draw();return;}
    if(b.hasAttribute('data-qp-scale-menu')){openProtoMenu(b,quotaExplorer.scales.map(v=>({v:v.id,name:v.key})),state.explorer.scale,v=>moveTimeline(state.explorer.start,v),'Date window');return;}
    if(b.dataset.qpEvent){state.inspectAt=Number(b.dataset.qpEvent);state.pinned=true;draw();return;}
    if(b.hasAttribute('data-admission-price')){openProtoMenu(b,[20,100,200].map(v=>({v:String(v),name:'$'+v+' '+t('per month'),literalName:true})),String(state.admission.price||20),v=>{state.admission.price=Number(v);draw();},'Plan monthly price label · USD');return;}
    if(b.dataset.qpScale){moveTimeline(state.explorer.start,b.dataset.qpScale);return;}
    if(b.dataset.qpMove){const r=quotaExplorer.range(state.explorer);moveTimeline(b.dataset.qpMove==='now'?Date.now()-r.span/7:r.from+Number(b.dataset.qpMove)*r.span*.75);return;}
    if(b.dataset.qpRescue){state.explorer.rescue=!state.explorer.rescue;draw();return;}
    if(b.dataset.qpComposition){state.composition=b.dataset.qpComposition;draw();return;}
    if(b.dataset.bindMember){bindMember(b,b.dataset.bindMember);return;}
    if(b.hasAttribute('data-bind-unbound')){
      const options=state.members.members.filter(m=>!m.account).map(m=>({v:m.id,name:m.name||m.id,literalName:true}));
      if(options.length)openProtoMenu(b,options,null,id=>bindMember(b,id),'Pool member');return;
    }
    if(b.hasAttribute('data-admission-model')){const models=[...new Set(quotaMembers.workload(state.members,Date.now())?.map(d=>d.model)||[])];openProtoMenu(b,models.map(m=>({v:m,name:m,literalName:true})),state.admission.model||models[0],v=>{state.admission.model=v;state.admission.support=[v];draw();},'Model');return;}
    if (b.id === 'qpReload') { leave(); load(true); return; }
    if (b.dataset.policy !== undefined) state.policy = b.dataset.policy;
    if (b.dataset.tab) {state.tab=b.dataset.tab;}
    draw();
  }
  function bindMember(anchor,id) {
    const member=state.members?.members.find(m=>m.id===id);if(!member)return;
    const options=[{v:'',name:t('Unbound'),literalName:true},...state.members.accounts.map(a=>({v:a.ref,name:a.user,literalName:true}))];
    openProtoMenu(anchor,options,member.ref,async ref=>{try{await api('usage/quota-members',{key:member.id,account:ref});leave();await load();}catch{statusBox.hidden=false;statusBox.textContent=t('Binding could not be saved. The account may already belong to another member.');}},'Contributed account');
  }
  function input(e) {
    if(e.target.id==='qpNavigator'){state.explorer.start=Number(e.target.value);state.inspectAt=null;state.explorer.data=null;quotaDashboard.updateChart(box,state);return;}
    if(e.target.id==='qpHealthTime'){quotaDashboard.inspectHealth(box,state,state.healthData.from+Number(e.target.value)*60000);return;}
    if(e.target.id==='qpHealthLoad'){state.healthLoad=Number(e.target.value);cancelAnimationFrame(healthFrame);healthFrame=requestAnimationFrame(()=>{if(shown()&&state.tab==='health')quotaDashboard.updateHealth(box,state);});return;}
    if (e.target.id === 'qpDemand') return;

  }
  function change(e) {
    if(e.target.id==='qpAuto'){state.auto=e.target.checked;clearTimeout(timer);clearTimeout(paceTimer);if(state.auto)load();draw();return;}
    if(e.target.id==='qpCards'){state.explorer.rescue=e.target.checked;draw();return;}
    if(e.target.id==='qpHealthCards'){state.healthCards=e.target.checked;draw();return;}
    if(e.target.id==='qpHealthLoad'){cancelAnimationFrame(healthFrame);state.healthLoad=Number(e.target.value);draw();return;}
    if(e.target.dataset.admissionSupport){state.admission.support=[...box.querySelectorAll('[data-admission-support]:checked')].map(e=>e.dataset.admissionSupport);draw();return;}
    if(e.target.id==='qpNavigator'){loadTimeline();draw();return;}
    if(e.target.id==='qpDate'){const date=new Date(e.target.value+'T00:00:00');if(Number.isFinite(+date))moveTimeline(+date);return;}
    if(e.target.id==='qpDemand') { state.demand=e.target.value===''?null:Math.max(0,Number(e.target.value));solveScenario();draw(); }
    if(e.target.dataset.admission){const value=Number(e.target.value);state.admission[e.target.dataset.admission]=e.target.value===''?null:Math.max(0,Math.min(1000000,value));draw();}
  }
  function visible() { if (shown()) load(); else leave(); }
  function resized(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>draw(true));}
  window.addEventListener('resize',resized);
  function pointerDown(e){const chart=e.target.closest('[data-qp-explore]');if(!chart||e.button!==0)return;drag={x:e.clientX,y:e.clientY,start:state.explorer.start,width:chart.clientWidth,chart};chart.setPointerCapture(e.pointerId);}
  function pointerMove(e){if(drag||state.pinned||state.tab!=='plan'||!e.target.closest('[data-qp-explore]'))return;const at=quotaDashboard.timeAt(state,e);if(at!==null)quotaDashboard.inspect(box,state,at,true);}
  function pointerOut(e){if(state.pinned||drag||!e.target.closest('[data-qp-explore]')||e.relatedTarget?.closest?.('[data-qp-explore]'))return;quotaDashboard.inspect(box,state,state.optimization?.input?.now||Date.now(),false);state.inspectAt=null;box.querySelector('#qpScrub')?.setAttribute('opacity','0');}
  function pointerUp(e){if(!drag)return;const d=drag;drag=null;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy))moveTimeline(d.start-dx/d.width*quotaExplorer.range(state.explorer).span);else {state.pinned=!state.pinned;const at=quotaDashboard.timeAt(state,e);if(at!==null)quotaDashboard.inspect(box,state,at,true);if(deferredDraw)draw(true);}}
  function pointerCancel(){drag=null;if(deferredDraw)draw(true);}
  function keydown(e){
    if(e.target.matches('#qpTabs [data-tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();const ids=['plan','health'],i=ids.indexOf(state.tab),j=e.key==='Home'?0:e.key==='End'?ids.length-1:(i+(e.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
      state.tab=ids[j];draw();main.querySelector('#qpTabs [data-tab='+state.tab+']').focus();return;
    }
    if(!e.target.matches('[data-qp-explore]'))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const r=quotaExplorer.range(state.explorer),at=(state.inspectAt??Date.now())+(e.key==='ArrowRight'?1:-1)*r.span/28;state.pinned=true;quotaDashboard.inspect(box,state,at,true);}}
  main.addEventListener('pointermove',pointerMove);main.addEventListener('pointerout',pointerOut);
  main.addEventListener('pointercancel',pointerCancel);main.addEventListener('pointerdown',pointerDown);main.addEventListener('pointerup',pointerUp);main.addEventListener('keydown',keydown);
  const obs = new MutationObserver(visible);
  obs.observe(main, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', visible);
  function blur() { if (deferredDraw) queueMicrotask(() => draw(true)); }
  main.addEventListener('focusout', blur);
  if(headerHost)headerTools.addEventListener('click',click);
  main.addEventListener('click', click);
  main.addEventListener('input', input);
  main.addEventListener('change', change);
  return { draw, load, leave, dispose() { headerTools.removeEventListener('click',click);headerTools.remove();main.removeEventListener('pointermove',pointerMove);main.removeEventListener('pointerout',pointerOut);window.removeEventListener('resize',resized);cancelAnimationFrame(resizeFrame);main.removeEventListener('pointercancel',pointerCancel);main.removeEventListener('pointerdown',pointerDown);main.removeEventListener('pointerup',pointerUp);main.removeEventListener('keydown',keydown);scenarioGeneration++; leave(); obs.disconnect(); document.removeEventListener('visibilitychange', visible); main.removeEventListener('focusout', blur); main.removeEventListener('click', click); main.removeEventListener('input', input);main.removeEventListener('change',change); } };
}
