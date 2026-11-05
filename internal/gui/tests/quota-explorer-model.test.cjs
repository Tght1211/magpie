const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../assets/plugins/usage/planner-explorer.js');
const now=Date.UTC(2026,10,5),h=E.hour;
const account=(extra={})=>({id:'a',group:'codex',full:100,left:0,reset:now+8*h,periodHours:168,rescue:true,auto:false,cards:[{id:'c',expiry:now+48*h}],...extra});
const input=as=>({now,demand:10,demands:{codex:10},accounts:as});
test('emergency refill serves before natural reset, costs a real card and shifts the reset',()=>{
 const p=E.project(input([account()]),now+10*h,true),wait=E.project(input([account()]),now+10*h,false);
 assert.equal(p.spent,100);assert.equal(wait.spent,20);assert.equal(p.events[0].kind,'rescue');assert.equal(p.events[0].next,now+168*h);assert.equal(p.events.filter(e=>e.kind==='reset').length,0);assert.equal(p.cardCount,1);
 const conservation= p.points[0].total+p.events.reduce((n,e)=>n+e.gain,0)-p.spent;assert.ok(Math.abs(conservation-p.remaining)<1e-6);
});
test('another usable account delays emergency and incompatible inventory cannot delay it',()=>{
 let p=E.project(input([account(),account({id:'b',left:50,rescue:false,cards:[]})]),now+10*h);
 assert.equal(p.events.find(e=>e.kind==='rescue').at,now+5*h);
 p=E.project({...input([account(),account({id:'b',group:'claude',left:100})]),demands:{codex:10,claude:0}},now+5*h);
 assert.equal(p.events[0].kind,'rescue');assert.equal(p.events[0].at,now);
});
test('cooldown, opt-in, expired cards and Claude are respected',()=>{
 for(const a of [account({rescue:false}),account({rescueAfter:now+6*h}),account({cards:[{expiry:now}]}),account({group:'claude'})]) {
 const p=E.project({...input([a]),demands:{codex:10,claude:10}},now+5*h);assert.equal(p.cardCount,0);
 }
});
test('natural refill before card expiry is preserved and new cards change only the future',()=>{
 const a=account({left:0,reset:now+2*h,rescue:false,auto:true,leadMinutes:60,cards:[{expiry:now+3*h}]});
 const p=E.project({...input([a]),demands:{codex:40}},now+20*h);assert.equal(p.events[0].kind,'reset');assert.ok(p.events.find(e=>e.kind==='card').at>=now+2*h);
 const original=JSON.stringify(a);E.project(input([a]),now+3*365*24*h);assert.equal(JSON.stringify(a),original);
});
test('multi-year projection has finite conserved totals without minute-sized arrays',()=>{
 const p=E.project(input([account({left:100})]),now+3*365*24*h);
 assert.ok(p.points.length<5000);assert.ok(Number.isFinite(p.spent));assert.ok(Math.abs(p.points[0].total+p.events.reduce((n,e)=>n+e.gain,0)-p.spent-p.remaining)<.001);
 assert.ok(p.events.every(e=>e.gain>=0));
});
test('weekend bands cover Saturday and Sunday and clip to the viewed local dates',()=>{
 const start=+new Date(2026,10,5,0),end=+new Date(2026,10,12,0),bands=E.weekendRanges(start,end);
 assert.deepEqual(bands,[{from:+new Date(2026,10,7,0),to:+new Date(2026,10,9,0)}]);
 const sun=+new Date(2026,10,8,12);assert.equal(E.weekendRanges(sun,end)[0].from,sun);
 assert.equal(E.weekendRanges(start,+new Date(2026,10,6,0)).length,0);
});
test('weekendRanges follow DST calendar days instead of fixed 48-hour durations',()=>{
 const old=process.env.TZ;process.env.TZ='America/New_York';
 try{const bands=E.weekendRanges(+new Date(2026,9,30),+new Date(2026,10,3));assert.equal(bands.length,1);assert.equal((bands[0].to-bands[0].from)/E.hour,49);}
 finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
