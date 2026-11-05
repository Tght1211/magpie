// Read-only planning. Percentages belong to one account; never sum plans.
// A future refill and the 80% card threshold are scenario inputs, not vendor promises.
const quotaPlannerModel = (() => {
  const hour = 3600000, day = 24 * hour;
  const time = v => v ? Date.parse(v) : NaN;
  const number = v => typeof v === 'number' && Number.isFinite(v);
  const share = v => Math.max(0, Math.min(100, v));
  function newCycle(a, b) {
    const before = time(a.resetsAt), after = time(b.resetsAt);
    if (!Number.isFinite(before) && !Number.isFinite(after)) return b.left > a.left + 5;
    if (!Number.isFinite(before) || !Number.isFinite(after) || before <= time(b.at)) return true;
    const moved = after - before, elapsed = time(b.at) - time(a.at), slack = 300000;
    const rolling = moved > 0 && Math.abs(moved - elapsed) <= slack;
    return !rolling && Math.abs(moved) <= slack && b.left > a.left + 5 || moved > elapsed + slack || moved < -slack;
  }
  function accounts(quotas, history, now = Date.now()) {
    return quotas.filter(q => q.provider === 'codex' || q.provider === 'claude' || q.provider?.endsWith('/codex') || q.provider?.endsWith('/claude')).map((q, index) => {
      const w = (q.windows || []).find(w => w.trayKind === '7d' || /^(7 days|weekly|week|7d)$/i.test(w.name));
      const reset = time(w?.resetsAt), read = time(q.asOf || q.readAt);
      const valid = w && !w.text && !w.unlimited && w.balance == null && number(w.used);
      const left = valid ? share(100 - w.used) : null;
      const known = left !== null && !q.error && Number.isFinite(read) && read <= now + 60000 && now - read <= 2 * hour && reset > now;
      const cards = (q.resets?.each || []).map(c => ({ at: time(c.until), window: c.window }));
      const dates = cards.filter(c => (!c.window || c.window === 'weekly') && c.at > now).map(c => c.at);
      const until = time(q.resets?.until);
      if (!dates.length && q.resets?.count > 0 && until > now) cards.push({at:until,window:'weekly'});
      const expiry = dates.length ? Math.min(...dates) : q.resets?.count > 0 && until > now ? until : NaN;
      const hist = (history || []).find(h => h.provider === q.provider && h.user?.toLowerCase() === q.user?.toLowerCase());
      const points = (hist?.lines?.find(l => l.name === w?.name)?.points || [])
        .filter(p => number(p.left) && p.left >= 0 && p.left <= 100 && Number.isFinite(time(p.at)) && time(p.at) <= now)
        .slice().sort((a, b) => time(a.at) - time(b.at));
      const last = points.at(-1);
      if (valid && Number.isFinite(read) && read <= now && (!last || read > time(last.at))) points.push({ at: new Date(read).toISOString(), left, resetsAt: w.resetsAt });
      const blocked = !!q.held || !!w?.heldBy;
      return { id: JSON.stringify([q.provider, q.user?.toLowerCase()]), index, user: q.user, alias: q.alias, holds: w?.holds, holdsWhy: w?.holdsWhy, provider: q.provider,
        plan: q.plan, left, reset, read, known, blocked, expiry, cards, count: q.resets?.count ?? null,
        points, error: !!q.error, heldBy: w?.heldBy || '', now };
    });
  }
  function windows(a, goal = 'eligible') {
    if (!a.known) return [];
    const cardAt = a.expiry - hour;
    const out = [];
    const add = (kind, start, end, initial, future) => {
      if (!(end > start)) return;
      const target = kind === 'card' && goal === 'eligible' ? 80 : 0;
      out.push({ kind, start, end, initial, target, future, hours: (end - start) / hour,
        need: Math.max(0, initial - target), rate: Math.max(0, initial - target) / ((end - start) / hour) });
    };
    // If a card is already in its last hour, show the expiry itself as the deadline.
    const cardEnd = Math.max(a.now + 1, cardAt > a.now ? cardAt : a.expiry);
    if (a.expiry > a.now && a.expiry <= a.reset) add('card', a.now, cardEnd, a.left, false);
    else {
      add('reset', a.now, a.reset, a.left, false);
      // Only the next cycle is modelled. A later card stays in the expiry calendar.
      if (a.expiry > a.reset && a.expiry <= a.reset + 7 * day) add('card', a.reset, Math.max(a.reset + 1, cardEnd), 100, true);
    }
    return out;
  }
  function observed(a) {
    let pts = [];
    for (const p of a.points) {
      if (pts.length && newCycle(pts.at(-1), p)) pts = [];
      pts.push(p);
    }
    const last = pts.at(-1);
    pts = pts.filter(p => last && time(p.at) >= time(last.at) - 24 * hour);
    if (pts.length < 2 || a.error || time(last.at) < a.now - 2 * hour || time(last.resetsAt) <= a.now) return { rate: null, hours: 0, points: pts };
    const hours = (time(last.at) - time(pts[0].at)) / hour;
    return { rate: hours > 0 ? Math.max(0, pts[0].left - last.left) / hours : null, hours, points: pts };
  }
  function ranked(accounts) {
    return accounts.filter(a => a.known && !a.blocked && a.left > 0)
      .sort((a, b) => windows(a)[0].end - windows(b)[0].end || a.id.localeCompare(b.id));
  }
  function cache(s) {
    const prompt = (s.input || 0) + (s.cache_read || 0) + (s.cache_write || 0);
    const known = prompt - (s.cache_unknown || 0);
    return { prompt, known, rate: known > 0 ? Math.max(0, Math.min(1, (s.cache_read || 0) / known)) : null };
  }

  // A trimmed, pooled ratio: dollar/token totals and percentage declines
  // always refer to the very same non-overlapping account intervals.
  function calibrate(a, data) {
    let samples = (data?.samples || []).filter(p => number(p.used) && p.used >= 5 && p.used <= 100 && number(p.cost) && p.cost > 0 && p.tokens > 0 && p.calls > 0 && p.unpriced === 0 && time(p.to) > a.now - 48 * hour && time(p.to) <= a.read && time(p.from) < time(p.to));
    samples = samples.slice().sort((a,b) => a.cost/a.used-b.cost/b.used);
    if (samples.length >= 5) samples = samples.slice(1,-1);
    const used = samples.reduce((v,p)=>v+p.used,0), cost = samples.reduce((v,p)=>v+p.cost,0), tokens = samples.reduce((v,p)=>v+p.tokens,0);
    if (used >= 5) return { full:cost*100/used, tokens:tokens * 100 / used, samples:samples.length, used, since:Math.min(...samples.map(p=>time(p.from))), through:Math.max(...samples.map(p=>time(p.to))), basis:'paired' };
    const h=a.holds;
    if (h?.priced && number(h.cost) && h.cost>0 && h.tokens>0 && h.used>=5 && Math.abs(h.used-(100-a.left))<.01 && time(h.since)<a.read) return {full:h.cost,tokens:h.tokens,samples:1,used:h.used,since:time(h.since),through:a.read,basis:'cycle'};
    return null;
  }
  function enrich(accounts, data = [], settings = {}) {
    const ids=accounts.map(a=>a.id).sort();
    return accounts.map(a=> {
      const d=data.find(d=>d.provider===a.provider && d.user?.toLowerCase()===a.user?.toLowerCase());
      const on=a.provider==='codex' && (settings.codexAutoReset || []).includes(a.user?.toLowerCase());
      const auto=!!on && settings.codexAutoResetOnly?.[a.user?.toLowerCase()]!=='week';
      return {...a, colorIndex:ids.indexOf(a.id), estimate:calibrate(a,d), hourly:d?.hourly || [], auto,
        lead:(settings.codexResetLead>0?settings.codexResetLead:30)*60000};
    });
  }
  function deadline(a, reset=a.reset, cards=a.cards, now=a.now) {
    const expiry=cards.filter(c=>(!c.window || c.window==='weekly') && c.at>now).sort((a,b)=>a.at-b.at)[0]?.at;
    return a.auto && expiry && !(reset < expiry) ? Math.min(reset,Math.max(now,expiry-a.lead)) : reset;
  }
  // This is a workload scenario, not a reproduction of every gateway policy:
  // one active stream, reselect at 30-minute session boundaries, same demand.
  // Reset-card use is conditional and moves the next reset seven days ahead.
  function simulateSingle(accounts, policy='harvest', rate=0, hours=72) {
    const now=accounts[0]?.now || Date.now(), end=now+hours*hour;
    const aa=accounts.filter(a=>a.known && a.estimate).map(a=>({...a,balance:a.estimate.full*a.left/100, reset:a.reset,cards:a.cards.filter(c=>(!c.window || c.window==='weekly') && c.at>now).map(c=>({...c})), used:0}));
    let spent=0,waste=0,unserved=0,tokenUse=0,active=null,turn=0;
    const points=[],events=[];
    const snap=at=>points.push({at,values:aa.map(a=>a.balance),total:aa.reduce((v,a)=>v+a.balance,0)});
    const order=at=>{
      const ready=aa.filter(a=>!a.blocked && a.balance>1e-8);
      if (policy==='rotate' || policy==='weight') {const n=ready.length;return n?[...ready.slice(turn%n),...ready.slice(0,turn%n)]:[];}
      if (policy==='usage') return ready.sort((a,b)=>b.balance/b.estimate.full-a.balance/a.estimate.full);
      if (policy==='pace') return ready.sort((a,b)=>(b.balance/b.estimate.full)/Math.max(.01,(deadline(b,b.reset,b.cards,at)-at)/hour)-(a.balance/a.estimate.full)/Math.max(.01,(deadline(a,a.reset,a.cards,at)-at)/hour));
      if (policy==='harvest' || policy==='') return ready.sort((a,b)=>deadline(a,a.reset,a.cards,at)-deadline(b,b.reset,b.cards,at) || a.index-b.index);
      return ready; // order/drain; unsupported policies are not compared
    };
    snap(now);
    for(let at=now;at<end;) {
      // A short-window hold's release isn't predicted here; held accounts
      // remain unavailable. Their weekly balance is still part of inventory.
      const boundary=Math.min(end,now+(turn+1)*.5*hour);
      if (!active || active.balance<=0) active=order(at)[0];
      let next=boundary;
      for(const a of aa) {
        if(a.reset>at)next=Math.min(next,a.reset);
        for(const c of a.cards)if(a.auto) {const t=Math.max(now,c.at-a.lead); if(t>at)next=Math.min(next,t);}
      }
      // The first iteration may start inside a card's review margin.
      for(const a of aa) {
        const card=a.auto && a.cards.find(c=>c.at>at && c.at-a.lead<=at);
        if(card && a.reset>=card.at && a.balance/a.estimate.full<=.8+1e-9) {
          const gain=a.estimate.full-a.balance;waste+=a.balance;a.balance=a.estimate.full;a.reset=at+7*day;
          a.cards.splice(a.cards.indexOf(card),1);events.push({at,kind:'card',id:a.id,gain});snap(at);
        }
      }
      if(!(next>at))next=Math.min(end,at+.5*hour);
      let demand=Math.max(0,rate)*(next-at)/hour;
      while(demand>1e-8) {
        if(!active || active.blocked || active.balance<=1e-8)active=order(at)[0];
        if(!active)break;
        const take=Math.min(demand,active.balance);active.balance-=take;active.used+=take;spent+=take;tokenUse+=take*active.estimate.tokens/active.estimate.full;demand-=take;
      }
      unserved+=demand;at=next;snap(at);
      for(const a of aa)if(a.reset<=at) {const gain=a.estimate.full-a.balance;waste+=a.balance;a.balance=a.estimate.full;a.reset=at+7*day;events.push({at,kind:'reset',id:a.id,gain});snap(at);}
      if(at>=boundary){turn++;if(policy!=='drain')active=null;}
    }
    return {accounts:aa,points,events,spent,waste,unserved,tokens:tokenUse,remaining:points.at(-1)?.total || 0,rate,hours};
  }
  function simulate(accounts,policy='harvest',rate=0,hours=72) {
    const groups=new Map();for(const a of accounts){const k=a.provider || '';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a);}
    if(groups.size<=1)return simulateSingle(accounts,policy,rate,hours);
    const weights=[...groups.values()].map(as=>as.reduce((n,a)=>n+a.hourly.reduce((v,p)=>v+(p.unpriced===0?p.cost:0),0),0));
    const total=weights.reduce((v,w)=>v+w,0);
    const runs=[...groups.values()].map((as,i)=>simulateSingle(as,policy,total>0?rate*weights[i]/total:0,hours));
    const aa=accounts.filter(a=>a.known&&a.estimate), times=[...new Set(runs.flatMap(r=>r.points.map(p=>p.at)))].sort((a,b)=>a-b);
    const points=times.flatMap(at=>[false,true].map(after=>{const values=aa.map(a=>{const r=runs.find(r=>r.accounts.some(v=>v.id===a.id));const exact=r.points.filter(p=>p.at===at);const p=exact.length?(after?exact.at(-1):exact[0]):r.points.filter(p=>p.at<at).at(-1)||r.points[0];return p.values[r.accounts.findIndex(v=>v.id===a.id)];});return {at,values,total:values.reduce((v,w)=>v+w,0)};}));
    const sum=k=>runs.reduce((v,r)=>v+r[k],0);
    return {accounts:aa,points,events:runs.flatMap(r=>r.events).sort((a,b)=>a.at-b.at),spent:sum('spent'),waste:sum('waste'),unserved:sum('unserved'),tokens:sum('tokens'),remaining:sum('remaining'),rate,hours};
  }
  function pool(accounts, policy='harvest', demand=null) {
    const aa=accounts.filter(a=>a.known && a.estimate), now=accounts[0]?.now || Date.now();
    const total=aa.reduce((v,a)=>v+a.estimate.full*a.left/100,0), full=aa.reduce((v,a)=>v+a.estimate.full,0);
    const deadlines=aa.filter(a=>!a.blocked && a.left>0).map(a=>({at:deadline(a),amount:a.estimate.full*a.left/100})).sort((a,b)=>a.at-b.at);
    let amount=0,required=0;
    for(const d of deadlines){amount+=d.amount;required=Math.max(required,amount/Math.max(.5,(d.at-now)/hour));}
    const hourly=[];
    // Use only matching complete hours. Unknown prices never become zero spend.
    for(let i=0;i<24;i++){
      const rows=aa.map(a=>a.hourly[i]);
      if(rows.some(p=>!p || p.complete !== true || p.unpriced>0 || !number(p.cost)))continue;
      const from=time(rows[0]?.from),to=time(rows[0]?.to);
      if(!Number.isFinite(from) || rows.some(p=>time(p.from)!==from || time(p.to)!==to))continue;
      hourly.push({at:to,cost:rows.reduce((v,p)=>v+p.cost,0),tokens:rows.reduce((v,p)=>v+p.tokens,0)});
    }
    const observed=hourly.length?hourly.reduce((v,p)=>v+p.cost,0)/hourly.length:null;
    const rate=number(demand)?Math.max(0,demand):observed;
    const forecast=simulate(aa,policy,rate ?? 0);
    return {accounts:aa,total,full,required,observed,hourly,forecast,rate,coverage:aa.length,count:accounts.length,now};
  }
  return { hour, time, share, accounts, windows, observed, ranked, cache, newCycle, calibrate, enrich, deadline, simulate, pool };
})();
if (typeof module !== 'undefined') module.exports = quotaPlannerModel;
