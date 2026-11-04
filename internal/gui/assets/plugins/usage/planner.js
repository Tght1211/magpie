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
    leave() { controller.leave(); },
  });
  ctx.onDispose(() => controller?.dispose());
}
function quotaPlannerController(main) {
  const M = quotaPlannerModel, box = main.querySelector('#qpBody'), statusBox = main.querySelector('#qpStatus');
  const state = { tab: 'plan', selected: '', stage: 0, goal: 'eligible', pace: null, key: '', accounts: [], usage: null, errors: [], loaded: false };
  let generation = 0, pending = false, timer;
  const shown = () => !main.hidden && !document.hidden;
  const draw = () => {
    if (!shown()) return;
    const top = main.scrollTop;
    main.querySelector('#qpTabs').innerHTML = [['plan', 'Quota planner'], ['trend', 'Consumption curve'], ['keys', 'Key benefits']].map(([id, label]) => `<button class="opt ${state.tab === id ? 'on' : ''}" data-tab="${id}" aria-pressed="${state.tab === id}">${quotaPlannerView.esc(t(label))}</button>`).join('');
    statusBox.textContent = state.errors.length ? t('Some planning data could not be read. Refresh to try again.') : state.loaded ? t('Planning preview · updates every minute while visible') : t('Loading…');
    box.innerHTML = state.loaded ? quotaPlannerView.render(state) : '';
    main.scrollTop = top;
  };
  const leave = () => { generation++; pending = false; clearTimeout(timer); };
  async function load(asked = false) {
    if (!shown() || pending) return;
    pending = true;
    clearTimeout(timer);
    const seq = ++generation;
    main.querySelector('#qpReload').disabled = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const results = await Promise.allSettled([api('usage/quotas' + (asked ? '?asked=1' : '')), api('usage/quotas/history?days=30'), api('usage?period=30d&tz=' + encodeURIComponent(zone))]);
    if (seq !== generation || !shown()) return;
    pending = false;
    main.querySelector('#qpReload').disabled = false;
    const get = (i, array) => results[i].status === 'fulfilled' && (array ? Array.isArray(results[i].value) : typeof results[i].value?.calls === 'number') ? results[i].value : null;
    const quotas = get(0, true), hist = get(1, true), usage = get(2, false);
    state.errors = [quotas === null && 'quota', hist === null && 'history', usage === null && 'usage'].filter(Boolean);
    state.accounts = quotas ? M.accounts(quotas, hist || []) : [];
    window.noteAccounts?.(quotas || []);
    state.usage = usage;
    state.loaded = true;
    if (!state.accounts.some(a => a.id === state.selected)) { state.selected = M.ranked(state.accounts)[0]?.id || state.accounts[0]?.id || ''; state.stage = 0; state.pace = null; }
    draw();
    timer = setTimeout(() => load(), 60000);
  }
  function click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'qpReload') { leave(); load(true); return; }
    if (b.dataset.tab) state.tab = b.dataset.tab;
    if (b.dataset.account !== undefined) { state.selected = state.accounts[Number(b.dataset.account)]?.id || ''; state.stage = 0; state.pace = null; }
    if (b.dataset.stage !== undefined) { state.stage = Number(b.dataset.stage); state.pace = null; }
    if (b.dataset.goal) state.goal = b.dataset.goal;
    if (b.dataset.key !== undefined) state.key = b.dataset.key === 'all' ? '' : state.usage?.callerKeys?.[Number(b.dataset.key)]?.id || '';
    if (b.dataset.pace !== undefined) state.pace = null;
    draw();
  }
  function input(e) {
    if (e.target.id !== 'qpPace') return;
    state.pace = Number(e.target.value);
    // Keep the slider (and keyboard/pointer focus) in place while its chart changes.
    quotaPlannerView.updateForecast(box, state);
  }
  function visible() { if (shown()) load(); else leave(); }
  const obs = new MutationObserver(visible);
  obs.observe(main, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', visible);
  main.addEventListener('click', click);
  main.addEventListener('input', input);
  return { draw, load, leave, dispose() { leave(); obs.disconnect(); document.removeEventListener('visibilitychange', visible); main.removeEventListener('click', click); main.removeEventListener('input', input); } };
}
