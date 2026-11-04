const assert = require('node:assert/strict');
const { test } = require('node:test');
const M = require('../assets/plugins/usage/planner-model.js');
const now = Date.UTC(2026, 10, 5), hour = M.hour, at = h => new Date(now + h * hour).toISOString();
const quota = (user, used, reset, expiry) => ({ provider: 'codex', user, plan: 'pro', readAt: at(0), windows: [{name:'7 days', used, resetsAt:at(reset)}], resets: {count:1, each:[{until:at(expiry)}]} });
test('deadlines preserve a natural reset before an expiring card', () => {
  const a = M.accounts([quota('a',13,160,55), quota('b',100,40,55), quota('c',45,20,600)], [], now);
  assert.deepEqual(M.ranked(a).map(a=>a.user), ['c','a']);
  const b = M.windows(a[1]);
  assert.equal(b.length,2); assert.equal(b[1].start, now+40*hour);
  assert.equal(b[1].end,now+54*hour); assert.equal(b[1].initial,100); assert.equal(b[1].need,20);
  assert.equal(M.windows(a[0])[0].need,7); assert.equal(M.windows(a[2])[0].need,55);
  assert.equal(M.windows(a[1],'all')[1].need,100);
  const fresh = M.accounts([quota('a',13,160,55),quota('b',0,208,55),quota('c',0,188,600)].map(q=>({...q,readAt:at(41)})),[],now+41*hour);
  assert.deepEqual(M.ranked(fresh).map(a=>a.user),['a','b','c']);
});
test('unknown, expired and held balances never become available by assumption', () => {
 const qs = [quota('missing',0,20,55),quota('expired',0,-1,55),quota('failed',0,20,55),quota('held',0,20,55),quota('text',0,20,55)];
 delete qs[0].windows[0].used; qs[2].error='unavailable'; qs[3].windows[0].heldBy='5 hours'; qs[4].windows[0].text=true;
 const a=M.accounts(qs,[],now); assert.equal(M.ranked(a).length,0);
 assert.equal(a[0].left,null); assert.deepEqual(M.windows(a[1]),[]); assert.equal(a[4].left,null);
});
test('small clock corrections preserve history while real refills split it', () => {
 const p={at:at(-2),left:80,resetsAt:at(20)}, q={at:at(-1),left:75,resetsAt:new Date(now+20*hour+60000).toISOString()};
 assert.equal(M.newCycle(p,q),false);
 assert.equal(M.newCycle(q,{...q,at:at(0),left:100}),true);
 const [a]=M.accounts([quota('a',30,20,55)],[{provider:'codex',user:'a',lines:[{name:'7 days',points:[p,q]}]}],now);
 assert.equal(M.observed(a).rate,5);
});
test('cache share excludes unknown prompt tokens and missing data stays unknown',()=>{
 assert.equal(M.cache({input:100,cache_read:300,cache_write:100,cache_unknown:100}).rate,.75);
 assert.equal(M.cache({input:100,cache_unknown:100}).rate,null);
});
