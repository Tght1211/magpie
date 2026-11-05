const {test}=require('node:test');
const assert=require('node:assert/strict');
const K=require('../assets/plugins/usage/planner-members.js');
const now=Date.UTC(2026,10,6),h=3600000;
const account=(id,extra={})=>({id,group:'codex',full:100,left:100,reset:now+168*h,periodHours:168,cards:[],...extra});
test('shared capacity is spent once; augmenting paths preserve constrained models',()=>{
 const as=[{id:'a',balance:10},{id:'b',balance:10}], ds=[{rate:1,eligible:['a','b']},{rate:1,eligible:['a']}];
 const f=K.allocate(as,ds,[10,10]);assert.equal(f.total,20);assert.deepEqual(f.served,[10,10]);assert.deepEqual(f.used,[10,10]);
 assert(K.ratio(as,[{rate:1,eligible:['a']},{rate:1,eligible:['a']}])<=5);
 assert.equal(K.allocate(as,[{eligible:['c']}],[10]).total,0);
});
test('compatible inventory is allocated jointly, not promised to every member',()=>{
 const ds=[{rate:1,eligible:['a']},{rate:1,eligible:['a']}];
 const values=K.inventory([{id:'a',balance:100}],ds);assert(Math.abs(values[0]-50)<.001);assert(values.reduce((n,v)=>n+v,0)<=100);
});
test('cards are finite, move natural reset and cannot refill Claude',()=>{
 const d=[{key:'k',rate:10,model:'codex/m',eligible:['a']}];
 const a=account('a',{left:0,reset:now+5*h,rescue:true,cards:[{expiry:now+3*h}]});
 const p=K.project({now,accounts:[a]},d,1,true),no=K.project({now,accounts:[a]},d,1,false);
 assert.equal(p.events.filter(e=>e.kind==='rescue').length,1);assert.equal(p.events.filter(e=>e.kind==='reset').length,0);assert(p.served[0]<=100.001);assert(no.events.some(e=>e.kind==='reset'));
 const claude=K.project({now,accounts:[{...a,group:'claude'}]},d,1,true);assert(!claude.events.some(e=>e.kind==='rescue'));
 assert.equal(a.left,0);assert.equal(a.cards.length,1);
});
test('natural reset before card expiry is preserved; cards do not increase sustainable ratio',()=>{
 const a=account('a',{left:0,reset:now+2*h,auto:true,leadMinutes:60,cards:[{expiry:now+4*h}]});
 const p=K.project({now,accounts:[a]},[{key:'k',rate:40,model:'codex/m',eligible:['a']}],1,true);
 assert.equal(p.events[0].kind,'reset');assert.equal(p.events[0].at,now+2*h);assert(p.events.some(e=>e.kind==='card'));
});
test('ledger conserves member transfers and does not infer unbound ownership',()=>{
 const data={members:[{id:'k1',account:'a'},{id:'k2',account:'b'},{id:'k3'}],usage:{rows:[{key:'k1',account:'b',cost:20},{key:'k2',account:'a',cost:30},{key:'k1',account:'a',cost:5},{key:'k3',account:'unknown',cost:40}]}};
 const out=K.ledger(data);assert.equal(out[0].used,25);assert.equal(out[0].net,10);assert.equal(out[1].net,-10);assert.equal(out[2].net,null);
 data.usage.rows[0].unpriced=1;assert.equal(K.ledger(data)[0].net,null);
});
test('workload requires a full priced 24h; all models of each member remain separate',()=>{
 const data={usage:{complete:true,from:now-30*24*h,rows:[{at:now-h,key:'k',model:'codex/a',cost:24,tokens:240},{at:now-2*h,key:'k',model:'codex/b',cost:48,tokens:480}]},members:[{id:'k',eligible:{'codex/a':['a'],'codex/b':['a']}}]};
 assert.deepEqual(K.workload(data,now).map(d=>d.rate),[1,2]);data.usage.rows[0].unpriced=1;assert.equal(K.workload(data,now),null);data.usage.complete=false;assert.equal(K.workload(data,now),null);
});
test('incompatible stock cannot postpone emergency refill; reset events are vertical',()=>{
 const a=account('a',{left:0,rescue:true,cards:[{expiry:now+12*h}]}),b=account('b');
 const ds=[{key:'k',model:'codex/a',rate:5,eligible:['a']}];
 const p=K.project({now,accounts:[a,b]},ds,1,true);
 assert.equal(p.events[0].kind,'rescue');assert.equal(p.events[0].at,now);
 assert.equal(p.points[0].at,p.points[1].at);assert(p.points[1].total>p.points[0].total);
 const end=K.project({now,accounts:[account('a',{reset:now+24*h})]},ds,1,false);
 assert(end.events.some(e=>e.at===now+24*h&&e.kind==='reset'));assert.equal(end.remaining,100);
});
