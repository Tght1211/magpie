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
    return quotas.filter(q => q.provider === 'codex' || q.provider?.endsWith('/codex')).map((q, index) => {
      const w = (q.windows || []).find(w => w.trayKind === '7d' || /^(7 days|weekly|week|7d)$/i.test(w.name));
      const reset = time(w?.resetsAt), read = time(q.asOf || q.readAt);
      const valid = w && !w.text && !w.unlimited && w.balance == null && number(w.used);
      const left = valid ? share(100 - w.used) : null;
      const known = left !== null && !q.error && Number.isFinite(read) && read <= now + 60000 && now - read <= 2 * hour && reset > now;
      const cards = (q.resets?.each || []).map(c => ({ at: time(c.until), window: c.window }));
      const dates = cards.filter(c => (!c.window || c.window === 'weekly') && c.at > now).map(c => c.at);
      const until = time(q.resets?.until);
      const expiry = dates.length ? Math.min(...dates) : q.resets?.count > 0 && until > now ? until : NaN;
      const hist = (history || []).find(h => h.provider === q.provider && h.user === q.user);
      const points = (hist?.lines?.find(l => l.name === w?.name)?.points || [])
        .filter(p => number(p.left) && p.left >= 0 && p.left <= 100 && Number.isFinite(time(p.at)) && time(p.at) <= now)
        .slice().sort((a, b) => time(a.at) - time(b.at));
      const last = points.at(-1);
      if (valid && Number.isFinite(read) && read <= now && (!last || read > time(last.at))) points.push({ at: new Date(read).toISOString(), left, resetsAt: w.resetsAt });
      const blocked = !!q.held || !!w?.heldBy;
      return { id: JSON.stringify([q.provider, q.user]), index, user: q.alias || q.user, provider: q.provider,
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
  return { hour, time, share, accounts, windows, observed, ranked, cache, newCycle };
})();
if (typeof module !== 'undefined') module.exports = quotaPlannerModel;
