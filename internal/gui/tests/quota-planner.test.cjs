const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {test} = require('node:test');
const {chromium,webkit} = require('playwright');
const assets = process.env.MAGPIE_PLANNER_ASSETS || path.resolve(__dirname,'../assets');
const now = Date.now(), at = h=>new Date(now+h*3600000).toISOString();
const quota=(user,used,h,expiry)=>({provider:'codex',user,plan:'pro',readAt:at(0),windows:[{name:'7 days',used,resetsAt:at(h)}],resets:{count:1,each:[{until:at(expiry)}]}});
const accounts=[quota('a@example.test',13,160,55),quota('b@example.test',100,40,55),quota('c@example.test',45,20,600)];
const history=accounts.map(q=>({provider:q.provider,user:q.user,lines:[{name:'7 days',points:[{at:at(-2),left:Math.min(100,105-q.windows[0].used),resetsAt:q.windows[0].resetsAt},{at:at(-1),left:100-q.windows[0].used,resetsAt:q.windows[0].resetsAt}]}]}));
const poolData=accounts.map(q=>({provider:q.provider,user:q.user,samples:[{from:at(-2),to:at(-1),used:10,cost:10,tokens:100000,calls:10,unpriced:0}],hourly:Array.from({length:24},(_,i)=>({from:at(i-24),to:at(i-23),cost:1,tokens:10000,calls:1,unpriced:0,complete:true}))}));
const planInput={now,hours:72,demand:3,demands:{codex:3},accounts:accounts.map(q=>({id:JSON.stringify([q.provider,q.user]),group:q.provider,full:100,left:100-q.windows[0].used,tokens:1000000,reset:Date.parse(q.windows[0].resetsAt),periodHours:168,auto:true,leadMinutes:30,cards:[]}))};
const solveFixture=input=>({status:'optimal-discrete',spent:20,waste:10,remaining:200,tokens:200000,events:[],allocations:input.accounts.map(a=>({id:a.id,from:input.now,to:input.now+3600000,amount:1})),points:[{at:input.now,values:input.accounts.map(a=>a.full*a.left/100),total:input.accounts.reduce((n,a)=>n+a.full*a.left/100,0)},{at:input.now+72*3600000,values:input.accounts.map(a=>a.full*.5),total:input.accounts.reduce((n,a)=>n+a.full*.5,0)}]});
const totals={calls:100,errors:5,input:100,output:80,cache_read:300,cache_write:100,cache_unknown:100,cache_unknown_calls:1};
for(const engine of (process.env.BROWSER?[process.env.BROWSER]:['chromium','webkit'])) test(engine+': quota planning page',async(t)=>{
 const browser=await (engine==='webkit'?webkit:chromium).launch(); t.after(()=>browser.close());
 for(const lang of ['en','zh','zh-TW','ja','de']) {
  const theme=lang==='zh'?'dark':'light';
  const page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(60000);
  const errors=[],mutations=[]; let mode='ok', delayed=null, qReads=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(), u=new URL(req.url()), json=x=>route.fulfill({json:x});
   if(req.method()!=='GET')mutations.push(u.pathname);
   if(u.pathname==='/boot.js')return route.fulfill({contentType:'text/javascript',body:`window.bootPrefs={lang:${JSON.stringify(lang)},theme:${JSON.stringify(theme)},web:true};`});
   if(u.pathname==='/wails/runtime.js')return route.fulfill({contentType:'text/javascript',body:'export const Window={};'});
   if(u.pathname==='/api/state')return json({agents:[],profiles:[],settings:{lang,theme},fx:{rate:7}});
   if(u.pathname==='/api/providers')return json({providers:[],presets:[],excluded:[],models:[],gateway:{running:false}});
   if(u.pathname==='/api/usage/quotas') {qReads++;if(mode==='delay') await new Promise(r=>delayed=r);if(mode==='error')return route.fulfill({status:503,body:'unavailable'});return json(mode==='empty'?[]:accounts);}
   if(u.pathname==='/api/usage/quota-pool')return json(poolData);
   if(u.pathname==='/api/usage/quota-plan')return json({input:planInput,result:solveFixture(planInput),demandKnown:true,total:3,coverage:3});
   if(u.pathname==='/api/usage/quota-plan/demo')return json(solveFixture(req.postDataJSON()));
   if(u.pathname==='/api/usage/quotas/history')return json(history);
   if(u.pathname==='/api/usage')return json({...totals,series:[{...totals,label:'Today',time:at(0)}],callerKeys:[{id:'k',name:'<img src=x onerror=alert(1)>',...totals}]});
   if(u.pathname==='/api/gateway/trace'){await new Promise(r=>setTimeout(r,100));return json({mine:false,seq:0,routes:[],totals:{requests:0,rerouted:0,errors:0}});}
   if(u.pathname==='/api/gateway/history')return json({days:[],routes:[]});
   if(u.pathname==='/api/groups')return json({groups:[],models:[]});
   if(u.pathname.startsWith('/api/'))return json({});
   const file=path.join(assets,u.pathname==='/'?'index.html':u.pathname);
   return route.fulfill({body:await fs.readFile(file),contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]});
  });
  await page.goto('http://magpie.test/?view=quota-planner');
  await page.locator('#qpBody .v-account').first().waitFor();
  assert.equal(await page.locator('#qpBody .v-account').count(),3);
  assert.equal(await page.locator('#qpBody .v-timeline').count(),1);
  await page.evaluate(()=>hideAccounts.set(true));
  await page.locator('#qpBody .v-account .pii').first().waitFor();
  await page.evaluate(()=>hideAccounts.set(false));
  await page.locator('#qpTabs [data-tab=trend]').click();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.locator('#qpBody [data-account="1"]').first().click();
  await page.locator('#qpBody [data-stage="1"]').click();
  await page.locator('#qpPace').fill('12');
  assert.match(await page.locator('#qpForecastResult').innerText(),/0%/);
  assert(!/NaN|Infinity/.test(await page.locator('#qpForecast').innerHTML()));
  // Let the shell finish its queued navigation scroll before measuring a slider update.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const before=await page.locator('#view-quota-planner').evaluate(e=>e.scrollTop);
  await page.locator('#qpPace').evaluate(e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#view-quota-planner').evaluate(e=>e.scrollTop),before);
  assert.match(await page.locator('#qpForecastResult').innerText(),/100%/);
  await page.locator('#qpTabs [data-tab=keys]').click();
  await page.locator('#qpBody [data-key="0"]').click();
  assert.equal(await page.locator('#qpBody img').count(),0);
  assert.match(await page.locator('#qpBody .v-donut').innerText(),/75%/);
  await page.locator('#qpTabs [data-tab=mechanism]').click();
  await page.locator('[data-demo-choice]').waitFor();
  if(lang!=='en')assert(!((await page.locator('#qpBody thead').innerText()).includes('Reset cards')),'reset-card heading is translated');
  assert.equal(await page.locator('[data-demo-target]').textContent(),'alpha@example.test');
  await page.locator('[data-demo-runtime=session]').check();
  assert.equal(await page.locator('[data-demo-choice]').textContent(),'beta@example.test');
  await page.locator('[data-demo-runtime=timeout]').check();
  assert.equal(await page.locator('[data-demo-choice]').textContent(),'alpha@example.test');
  await page.locator('[data-demo="card"][data-demo-account="0"]').click();
  await page.locator('[data-demo-field=expiry][data-demo-account="0"]').nth(1).waitFor();
  await page.locator('[data-demo="refill"][data-demo-account="0"]').click();
  assert.equal(await page.locator('[data-demo-field=left][data-demo-account="0"]').inputValue(),'100');
  for(const width of [1024,390]){
   await page.setViewportSize({width,height:900});
   for(const tab of ['plan','trend','keys','mechanism']) {await page.locator(`#qpTabs [data-tab=${tab}]`).click();assert(await page.locator('#view-quota-planner').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${lang} ${tab} overflow at ${width}`);}
  }
  if(lang==='en'){
   await page.setViewportSize({width:1440,height:950});
   await page.locator('#qpTabs [data-tab=plan]').click();
   mode='error';await page.locator('#qpReload').click();await page.getByText('Allowance data could not be read.',{exact:true}).waitFor();
   mode='empty';await page.locator('#qpReload').click();await page.getByText('No subscription accounts are available to plan.',{exact:true}).waitFor();
   mode='delay';await page.locator('#qpReload').click();await page.waitForFunction(()=>document.querySelector('#qpReload').disabled);
   for(let i=0;i<100&&!delayed;i++)await new Promise(r=>setTimeout(r,10));assert(delayed,'the old read is in flight');
   await page.locator('#nav [data-view=providers]').click();mode='ok';delayed?.();await page.waitForTimeout(150);
   await page.locator('#nav [data-view=quota-planner]').click();await page.locator('#qpBody .v-account').first().waitFor();
  }
  assert.deepEqual(errors,[]);assert(mutations.every(p=>p==='/api/usage/quota-plan/demo'));
  if(process.env.ARTIFACT_DIR&&lang==='zh'){await fs.mkdir(process.env.ARTIFACT_DIR,{recursive:true});await page.setViewportSize({width:1440,height:1000});await page.locator('#qpTabs [data-tab=plan]').click();await page.screenshot({path:path.join(process.env.ARTIFACT_DIR,`planner-${engine}.png`)});}
  await page.close();
 }
});
