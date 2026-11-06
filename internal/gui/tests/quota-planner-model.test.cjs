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
test('live pace uses the last complete hour, independent of forecast demand',()=>{
 const p={hourly:[{at:now-hour,cost:999},{at:now,cost:40}],required:20,total:100,coverage:2,count:2,rate:500};
 assert.equal(M.pace(p,now).status,'fast');assert.equal(M.pace(p,now).ratio,2);assert.equal(M.pace(p,now).runway,2.5);
 p.hourly[1].cost=16;assert.equal(M.pace(p,now).status,'steady');
 p.hourly[1].cost=24;assert.equal(M.pace(p,now).status,'steady');
 p.hourly[1].cost=0;assert.equal(M.pace(p,now).status,'slow');assert.equal(M.pace(p,now).runway,null);
 assert.equal(M.pace(p,now+91000).status,'unknown');p.count=3;assert.equal(M.pace(p,now).actual,null);
 p.count=2;p.required=0;assert.equal(M.pace(p,now).ratio,null);
});

test('policy comparisons share solver inventory, flags and provider demand',()=>{
 const a={id:'a',provider:'codex',index:0,now,known:true,left:100,reset:now+100*hour,estimate:{full:999,tokens:999},hourly:[],cards:[],auto:false};
 const b={...a,id:'b',provider:'claude',index:1};
 const input={now,hours:2,demand:15,demands:{codex:10,claude:5},accounts:[{id:'a',group:'codex',left:50,full:100,tokens:1000,reset:now+20*hour,auto:true,leadMinutes:30,cards:[{expiry:now+10*hour}]},{id:'b',group:'claude',left:100,full:100,tokens:2000,reset:now+30*hour,auto:false,leadMinutes:30,cards:[]}]};
 const scoped=M.scenarioAccounts([a,b,{...a,id:'uncalibrated'}],input);
 assert.equal(scoped.length,2);assert.equal(scoped[0].left,50);assert.equal(scoped[0].estimate.full,100);assert.equal(scoped[0].auto,true);assert.equal(scoped[0].lead,1800000);assert.equal(scoped[0].cards[0].at,now+10*hour);
 const run=M.simulate(scoped,'pace',input.demand,input.hours,input.demands);
 assert.equal(run.spent,30);assert.equal(run.tokens,400);assert.equal(run.remaining,120);
 assert.equal(a.estimate.full,999);assert.equal(a.auto,false);
 assert.equal(M.scenarioAccounts([a],input),null);assert.equal(M.scenarioAccounts([a,b],null),null);
});
test('routing preview excludes extra UI inventory outside the measured planning scope',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const V=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/plugins/usage/planner-view.js'),'utf8')+'\nquotaPlannerView',{quotaPlannerModel:M,t:k=>k,ledMoney:v=>v.toFixed(2),document:{documentElement:{lang:'en'}},Intl});
 const a={id:'a',provider:'codex',index:0,now,known:true,left:50,reset:now+100*hour,estimate:{full:100,tokens:1000},hourly:[],cards:[],auto:false};
 const input={now,hours:72,demand:1,demands:{codex:1},accounts:[{id:'a',group:'codex',left:50,full:100,tokens:1000,reset:a.reset,periodHours:168,auto:false,leadMinutes:30,cards:[]}]};
 a.hourly=[{from:at(-1),to:at(0),cost:1,tokens:10,unpriced:0,complete:true}];
 const opt={input,demandKnown:true};
 const baseline=V.routingPreview([a],'pace',opt);
 assert.equal(V.routingPreview([a,{...a,id:'extra',estimate:{full:10000,tokens:100000}}],'pace',opt),baseline,'UI-only inventory must not change the policy comparison');
 assert(baseline.includes('50.00'),'the scoped remaining inventory can serve 50, not zero');
});
