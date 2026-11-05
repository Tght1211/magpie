const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium,webkit} = require('playwright');
const assets = process.env.MAGPIE_PLANNER_ASSETS || path.resolve(__dirname,'../assets');
for(const engine of (process.env.BROWSER?[process.env.BROWSER]:['chromium','webkit'])) test(engine+': quota planning page',async(t)=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch(); t.after(()=>browser.close());
 for(const lang of ['en','zh','zh-TW','ja','de']) {
const now = Date.now(), at = h=>new Date(now+h*3600000).toISOString();
const quota=(user,used,h,expiry)=>({provider:'codex',user,plan:'pro',readAt:at(0),windows:[{name:'7 days',used,resetsAt:at(h)}],resets:{count:1,each:[{until:at(expiry)}]}});
const accounts=[quota('a@example.test',13,160,55),quota('b@example.test',100,40,55),quota('c@example.test',45,20,600),quota('d@example.test',60,80,1000)].map((q,i)=>({...q,plan:i===0?'Pro 20x':'Pro 5x'}));
const history=accounts.map(q=>({provider:q.provider,user:q.user,lines:[{name:'7 days',points:[{at:at(-2),left:Math.min(100,105-q.windows[0].used),resetsAt:q.windows[0].resetsAt},{at:at(-1),left:100-q.windows[0].used,resetsAt:q.windows[0].resetsAt}]}]}));
const poolData=accounts.map((q,i)=>({provider:q.provider,user:q.user,samples:[{from:at(-2),to:at(-1),used:10,cost:i===0?40:10,tokens:100000,calls:10,unpriced:0}],hourly:Array.from({length:24},(_,i)=>({from:at(i-24),to:at(i-23),cost:.75,tokens:10000,calls:1,unpriced:0,complete:true}))}));
const planInput={now,hours:72,demand:3,demands:{codex:3},accounts:accounts.map((q,i)=>({id:JSON.stringify([q.provider,q.user]),group:q.provider,full:i===0?400:100,left:100-q.windows[0].used,tokens:1000000,reset:Date.parse(q.windows[0].resetsAt),periodHours:168,auto:true,leadMinutes:30,cards:[]}))};
const solveFixture=input=>({status:'optimal-discrete',spent:20,waste:10,remaining:200,tokens:200000,events:[],allocations:input.accounts.map(a=>({id:a.id,from:input.now,to:input.now+3600000,amount:1})),points:[{at:input.now,values:input.accounts.map(a=>a.full*a.left/100),total:input.accounts.reduce((n,a)=>n+a.full*a.left/100,0)},{at:input.now+72*3600000,values:input.accounts.map(a=>a.full*.5),total:input.accounts.reduce((n,a)=>n+a.full*.5,0)}]});
const totals={calls:100,errors:5,input:100,output:80,cache_read:300,cache_write:100,cache_unknown:100,cache_unknown_calls:1};

  const theme=lang==='zh'?'dark':'light';
  const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(60000);
  const errors=[],mutations=[]; const bindings={};let memberComplete=true;let mode='ok', delayed=null, qReads=0, paceMode='normal';
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(), u=new URL(req.url()), json=x=>route.fulfill({json:x});
   if(req.method()!=='GET')mutations.push(u.pathname);
   if(u.pathname==='/boot.js')return route.fulfill({contentType:'text/javascript',body:`window.bootPrefs={lang:${JSON.stringify(lang)},theme:${JSON.stringify(theme)},web:true};`});
   if(u.pathname==='/wails/runtime.js')return route.fulfill({contentType:'text/javascript',body:'export const Window={};'});
   if(u.pathname==='/api/state')return json({agents:[],profiles:[],settings:{lang,theme},fx:{rate:7}});
   if(u.pathname==='/api/providers')return json({providers:[],presets:[],excluded:[],models:[],gateway:{running:false}});
   if(u.pathname==='/api/usage/quotas') {qReads++;if(mode==='delay') await new Promise(r=>delayed=r);if(mode==='error')return route.fulfill({status:503,body:'unavailable'});return json(mode==='empty'?[]:accounts);}
   if(u.pathname==='/api/usage/quota-pool')return json(paceMode==='normal'?poolData:poolData.map(a=>({...a,hourly:a.hourly.map(p=>({...p,cost:0,to:paceMode==='stale'?at(-10):p.to}))})));
   if(u.pathname==='/api/usage/quota-plan'&&u.searchParams.get('history')==='1'){
    const from=+u.searchParams.get('from'),to=+u.searchParams.get('to');return json({earliest:now-30*86400000,bins:[{from,to:Math.min(now,to),actual:12,predicted:10,known:to<=now}],observations:[],forecasts:[]});
   }
   if(u.pathname==='/api/usage/quota-plan')return json({input:planInput,result:solveFixture(planInput),demandKnown:true,total:4,coverage:4});
   if(u.pathname==='/api/usage/quota-plan/demo')return json(solveFixture(req.postDataJSON()));
   if(u.pathname==='/api/usage/quotas/history')return json(history);
   if(u.pathname==='/api/usage/quota-members'&&req.method()==='POST'){const b=req.postDataJSON();bindings[b.key]=b.account;return json({ok:true});}
   if(u.pathname==='/api/usage/quota-members')return json({at:now,members:accounts.map((q,i)=>({id:'k'+i,name:i===0?'<img src=x onerror=alert(1)>':'Member '+i,account:bindings['k'+i]===''?'':planInput.accounts[i].id,ref:bindings['k'+i]??'codex/'+i,eligible:{'codex/model':planInput.accounts.map(a=>a.id)}})),accounts:accounts.map((q,i)=>({id:planInput.accounts[i].id,ref:'codex/'+i,user:q.user,provider:'codex'})),usage:{from:now-30*86400000,to:now,complete:memberComplete,rows:accounts.flatMap((q,i)=>Array.from({length:26},(_,h)=>({at:Math.floor(now/3600000)*3600000-(h+1)*3600000,key:'k'+i,account:planInput.accounts[i].id,model:'codex/model',cost:1,tokens:10000,unpriced:0})))}});
   if(u.pathname==='/api/usage')return json({...totals,series:[{...totals,label:'Today',time:at(0)}],callerKeys:[{id:'k',name:'<img src=x onerror=alert(1)>',...totals}]});
   if(u.pathname==='/api/gateway/trace'){await new Promise(r=>setTimeout(r,100));return json({mine:false,seq:0,routes:[],totals:{requests:0,rerouted:0,errors:0}});}
   if(u.pathname==='/api/gateway/history')return json({days:[],routes:[]});
   if(u.pathname==='/api/groups')return json({groups:[],models:[]});
   if(u.pathname.startsWith('/api/'))return json({});
   const file=path.join(assets,u.pathname==='/'?'index.html':u.pathname);
   return route.fulfill({body:await fs.readFile(file),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]});
  });
  await page.goto('http://magpie.test/?view=quota-planner');
  await page.locator('#qpBody .qp-account').first().waitFor();
  assert.equal(await page.locator('#qpBody .qp-account').count(),4);
  assert.equal(await page.locator('.headline h1').count(),1);
  assert(await page.locator('.qp-account-grid').evaluate(e=>e.previousElementSibling?.classList.contains('detail-head')),'account readout is below its heading');
  const summaryBox=await page.locator('.summary').boundingBox(), controlsBox=await page.locator('.forecast-controls').boundingBox();
  assert(controlsBox.y>=summaryBox.y+summaryBox.height-1,'forecast controls do not overlap summary');
  if(lang==='zh'){
   assert(Math.abs(summaryBox.height-153.6875)<2,'approved battery summary density');
   assert.equal(await page.locator('.summary').evaluate(e=>getComputedStyle(e).padding),'20px');
   assert(Math.abs((await page.locator('.qp-account-grid').boundingBox()).height-116.5)<2,'approved account readout density');
  }
  await page.locator('[data-qp-unit=cny]').click();
  assert((await page.locator('[data-qp-number=pool-total]').textContent()).includes('¥'));
  await page.locator('[data-qp-unit=usd]').click();
  assert.equal(await page.locator('.refresh-strip').count(),1);
  await page.locator('#qpTabs [data-tab=plan]').focus();
  await page.keyboard.press('End');assert.equal(await page.locator('#qpTabs [data-tab=health]').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');assert.equal(await page.locator('#qpTabs [data-tab=plan]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-forecast-mode]').count(),2);
  assert(await page.locator('.qp-usage-bar').count()>0);
  assert(await page.locator('.qp-refill-dot').count()>0);
  const beforeMode=await page.locator('.total-line.future-line').first().getAttribute('d');
  await page.locator('[data-forecast-mode=actual]').click();
  assert.notEqual(await page.locator('.total-line.future-line').first().getAttribute('d'),beforeMode);
  await page.locator('[data-forecast-mode=recommended]').click();
  assert.equal(await page.locator('#qpDateThumb').count(),1);
  if(process.env.ARTIFACT_DIR&&lang==='zh'){
   await fs.mkdir(process.env.ARTIFACT_DIR,{recursive:true});
   for(const tab of ['plan','trend','keys','health']){
    await page.locator(`#qpTabs [data-tab=${tab}]`).click();
    await page.locator('.headline h1').waitFor();
    await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,`${tab}-${engine}-desktop.png`),fullPage:true});
   }
   await page.locator('#qpTabs [data-tab=plan]').click();
  }
  assert.equal(await page.locator('[data-tab=mechanism]').count(),0);
  assert.equal(await page.locator('[data-qp-composition=accounts]').getAttribute('aria-pressed'),'true');
  assert(await page.locator('.qp-account-area').count()>0);
  assert(await page.locator('[data-qp-weekend]').count()>0);
  assert.equal(await page.locator('.v-live-pace').getAttribute('data-pace-state'),'steady');
  const oldDate=await page.locator('#qpDate').inputValue();
  await page.locator('[data-qp-move="1"]').click();
  assert.notEqual(await page.locator('#qpDate').inputValue(),oldDate);
  await page.locator('[data-qp-move=now]').click();
  await page.locator('[data-qp-scale-menu]').click();await page.getByRole('menuitemradio').last().click();
  assert(!/NaN|Infinity/.test(await page.locator('.v-explorer-chart').innerHTML()));
  await page.locator('[data-qp-scale=week]').click();await page.locator('[data-qp-move=now]').click();
  await page.locator('[data-qp-rescue]').click();
  assert.equal(await page.locator('[data-qp-rescue]').isChecked(),false);
  await page.locator('#qpNavigator').evaluate(e=>{e.value=Number(e.value)+86400000;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForTimeout(250);
  await page.locator('[data-qp-move=now]').click();
  await page.evaluate(()=>hideAccounts.set(true));
  await page.locator('#qpBody .qp-account .pii').first().waitFor();
  await page.evaluate(()=>hideAccounts.set(false));
  assert((await page.locator('.qp-account').first().textContent()).includes('a@example.test'),'unmask restores account identity');
  await page.locator('#qpTabs [data-tab=trend]').click();
  await page.locator('[data-review-account="1"]').click();
  assert.equal(await page.locator('[data-review-account="1"]').getAttribute('aria-pressed'),'true');
  await page.locator('#qpTabs [data-tab=keys]').click();
  await page.locator('[data-member="0"]').click();
  assert.equal(await page.locator('#qpBody img').count(),0);
  assert.equal(await page.locator('#qpBody .analysis-plot svg').count(),2);
  if(lang==='en'){
   await page.locator('[data-bind-member]').click();await page.getByRole('menuitemradio').first().click();
   await page.getByText('Bind the contributed account to compare standalone and shared usage.',{exact:true}).waitFor();
   assert.equal(bindings.k0,'');
   await page.locator('[data-bind-member]').click();await page.getByRole('menuitemradio').nth(1).click();
   await page.waitForFunction(()=>document.querySelectorAll('#qpBody .analysis-plot svg').length===2);
   assert.equal(bindings.k0,'codex/0');
   memberComplete=false;await page.locator('#qpReload').click();await page.waitForFunction(()=>document.querySelector('#qpBody .v-metrics b')?.textContent.includes('—'));
   memberComplete=true;await page.locator('#qpReload').click();await page.waitForFunction(()=>document.querySelector('#qpBody .v-metrics b')?.textContent&&!document.querySelector('#qpBody .v-metrics b').textContent.includes('—'));
  }

  await page.locator('[data-key-model="codex/model"]').click();
  await page.locator('#qpTabs [data-tab=health]').click();
  for(const [key,value]of Object.entries({full:'200',daily:'20',resetHours:'40',left:'80',cards:'1',expiryHours:'50'}))await page.locator(`[data-admission=${key}]`).fill(value);
  await page.locator('[data-admission=expiryHours]').press('Tab');
  assert(!/NaN|Infinity/.test(await page.locator('#qpBody').innerHTML()));
  for(const width of [1024,390]){
   await page.setViewportSize({width,height:900});
   for(const tab of ['plan','trend','keys','health']) {await page.locator(`#qpTabs [data-tab=${tab}]`).click();assert(await page.locator('#view-quota-planner').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${lang} ${tab} overflow at ${width}`);}
  }
  if(lang==='en'){
   await page.setViewportSize({width:1440,height:950});
   await page.locator('#qpTabs [data-tab=plan]').click();
   paceMode='zero';
   await page.waitForFunction(()=>document.querySelector('.v-live-pace')?.dataset.paceState==='slow',null,{timeout:25000});
   const displayed=await page.locator('[data-qp-number=pace-actual]').getAttribute('data-qp-value');assert.equal(displayed,'0');
   paceMode='stale';
   await page.waitForFunction(()=>document.querySelector('.v-live-pace')?.dataset.paceState==='unknown',null,{timeout:25000});
   assert.equal(await page.locator('[data-qp-number=pace-actual]').getAttribute('data-qp-value'),'');paceMode='normal';
   mode='error';await page.locator('#qpReload').click();await page.getByText('Allowance data could not be read.',{exact:true}).waitFor();
   mode='empty';await page.locator('#qpReload').click();await page.getByText('No subscription accounts are available to plan.',{exact:true}).waitFor();
   mode='delay';await page.locator('#qpReload').click();await page.waitForFunction(()=>document.querySelector('#qpReload').disabled);
   for(let i=0;i<100&&!delayed;i++)await new Promise(r=>setTimeout(r,10));assert(delayed,'the old read is in flight');
   await page.locator('#nav [data-view=providers]').click();mode='ok';delayed?.();await page.waitForTimeout(150);
   await page.locator('#nav [data-view=quota-planner]').click();await page.locator('#qpBody .qp-account').first().waitFor();
  }
  assert.deepEqual(errors,[]);assert(mutations.every(p=>['/api/usage/quota-plan/demo','/api/usage/quota-members'].includes(p)));
  if(process.env.ARTIFACT_DIR&&lang==='zh'){await fs.mkdir(process.env.ARTIFACT_DIR,{recursive:true});await page.setViewportSize({width:1440,height:1000});await page.locator('#qpTabs [data-tab=plan]').click();await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,`planner-${engine}.png`)});}
  await page.close();
 }
});
