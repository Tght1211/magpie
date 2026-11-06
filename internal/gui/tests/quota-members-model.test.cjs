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

test('health preserves measured supply and separates aggregate from member capacity',()=>{
 const plan={input:{now,accounts:[account('a'),account('b',{group:'claude'})],demands:{codex:2,claude:1}},total:2,coverage:2,demandKnown:true};
 const data={usage:{complete:true,from:now-48*h,to:now,rows:[{at:now-h,key:'',model:'codex/m',cost:48,tokens:100}]},members:[]};
 const out=K.health(data,plan,now);
 assert.equal(out.modelAware,false);assert.equal(out.demand,72);assert(Math.abs(out.supply-200/7)<1e-6);
 assert.deepEqual(out.work.map(d=>d.eligible),[['a'],['b']]);
 assert.equal(K.health(data,{...plan,demandKnown:false},now).work,null);
 assert.equal(K.health(data,{...plan,demandKnown:false},now).supply,out.supply);
 const partial=K.health(data,{...plan,total:3},now);
 assert.equal(partial.supply,out.supply);assert.equal(partial.demand,out.demand);assert.equal(partial.partial,true);assert.equal(partial.complete,false);assert.equal(partial.modelAware,false);
 assert.equal(K.health(data,plan,now+121000).work,null);
 assert.equal(K.health(data,{...plan,input:{...plan.input,demands:{codex:2}}},now).work,null);
 data.usage.rows[0].unpriced=1;assert.equal(K.health(data,plan,now).work,null);data.usage.rows[0].unpriced=0;
 data.members=[{id:'k',eligible:{'codex/m':['a']}}];data.usage.rows[0].key='k';
 const member=K.health(data,plan,now);assert.equal(member.modelAware,true);assert.equal(member.demand,48);assert.deepEqual(member.work[0].eligible,['a']);
 data.usage.rows=[];assert.equal(K.health(data,plan,now).demand,0);
});

test('new unused Keys and uncalibrated accounts preserve only the measured scope',()=>{
 const plan={input:{now,accounts:[account('a')],demands:{codex:2}},total:4,coverage:1,demandKnown:true};
 const data={usage:{complete:true,from:now-48*h,to:now,rows:[{at:now-h,key:'k',account:'a',model:'codex/m',cost:48,tokens:100}]},members:[{id:'k',eligible:{'codex/m':['a']}},{id:'new',restricted:true}]};
 const out=K.health(data,plan,now);assert.equal(out.demand,48);assert(Math.abs(out.supply-100/7)<1e-9);assert.equal(out.modelAware,false);assert(out.partial);
 data.usage.rows.push({at:now-h,key:'new',account:'unmatched',model:'codex/m',unpriced:1});
 assert.equal(K.health(data,plan,now).demand,48,'unknown costs outside the calibrated scope cannot erase its independently priced demand');
 data.usage.rows[1].account='a';assert.equal(K.health(data,plan,now).demand,null);
 data.usage.rows[1].account='';assert.equal(K.health(data,plan,now).demand,null);
 assert.equal(K.health(data,plan,now+121000).supply,null);
 assert.equal(K.health(data,{...plan,input:{...plan.input,accounts:[]}},now).supply,null);
});

test('health timeline reports compatible shortages despite positive aggregate balance',()=>{
 const p=K.project({now,accounts:[account('a',{left:0,reset:now+2*h}),account('b')]},[{rate:10,model:'codex/a',eligible:['a']}],1,false);
 assert(p.points[0].total>0);
 const o=K.outlook(p,now,now+24*h);
 assert.equal(o.first,now);assert.equal(o.recovery,now+2*h);
 assert.deepEqual(o.spans.map(v=>[v.from-now,v.to-now,v.available]),[[0,2*h,false],[2*h,12*h,true],[12*h,24*h,false]]);
 const clipped=K.outlook(p,now+h/2,now+3*h);
 assert.deepEqual(clipped.spans.map(v=>[v.from-now,v.to-now,v.available]),[[h/2,2*h,false],[2*h,3*h,true]]);
 assert.equal(K.outlook(p,now-h,now+h),null);assert.equal(K.outlook(p,now,now+25*h),null);assert.equal(K.outlook(null,now,now+h),null);
});
test('health runway searches beyond the displayed day and preserves finite horizons',()=>{
 const p=K.project({now,accounts:[account('a')]},[{rate:2,model:'codex/a',eligible:['a']}],3,false);
 const o=K.outlook(p,now,now+24*h);assert.equal(o.first,now+50*h);assert.equal(o.end,now+72*h);assert.equal(o.spans.length,1);assert(o.spans[0].available);
 const idle=K.outlook(K.project({now,accounts:[account('a')]},[],1,true),now,now+24*h);assert.equal(idle.first,null);assert.equal(idle.recovery,null);
});
test('card effect preserves earlier shortages and lower bounds instead of invented savings',()=>{
 const a={first:now+10*h,end:now+30*h},b={first:now+20*h,end:now+30*h},none={first:null,end:now+30*h};
 assert.deepEqual(K.shortageShift(a,b,now),{hours:10,bounded:false});assert.deepEqual(K.shortageShift(b,a,now),{hours:-10,bounded:false});
 assert.deepEqual(K.shortageShift(a,none,now),{hours:20,bounded:true});assert.deepEqual(K.shortageShift(none,a,now),{hours:-20,bounded:true});
 assert.equal(K.shortageShift(none,none,now),null);assert.equal(K.shortageShift(null,b,now),null);assert.equal(K.shortageShift(a,{...b,end:now+31*h},now),null);
});

test('health projections conserve full coverage and fair shortage allocations',()=>{
 const accounts=Array.from({length:16},(_,i)=>account('a'+i,{full:200,left:60,reset:now+(10+i)*h}));
 const demands=Array.from({length:64},(_,i)=>({rate:.2,model:'codex/m'+i,eligible:accounts.map(a=>a.id)}));
 const run=K.project({now,accounts},demands,1,false);
 assert.equal(run.first,null);for(const n of run.served)assert(Math.abs(n-4.8)<1e-6);
 assert(Number.isFinite(run.remaining)&&run.remaining>=0&&run.remaining<=3200);
 const scarce=K.project({now,accounts:[account('a',{full:10}),account('b',{full:10})]},[{rate:15,model:'codex/a',eligible:['a']},{rate:15,model:'codex/b',eligible:['a','b']}],1/24,false);
 assert.equal(scarce.first.at,now);assert(Math.abs(scarce.served[0]-10)<1e-5);assert(Math.abs(scarce.served[1]-10)<1e-5);assert(scarce.remaining<1e-6);
});
