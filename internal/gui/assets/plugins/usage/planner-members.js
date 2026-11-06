// Counterfactuals share each account's inventory across all observed workloads.
// These read-only scenarios never publish routing targets or spend a reset card.
const quotaMembers = (() => {
  const hour=3600000, eps=1e-7;
  function workload(data, now) {
    if(!data?.usage?.complete)return null;
    if(data.usage.to&&now-data.usage.to>120000)return null;
    const end=Math.floor(Math.min(now,data.usage.to??now)/hour)*hour, from=end-24*hour;
    if(data.usage.from>from)return null;
    const rows=data.usage.rows.filter(r=>r.at>=from&&r.at<end);
    if(rows.some(r=>r.unpriced>0))return null;
    const by=new Map();
    for(const r of rows){const id=JSON.stringify([r.key,r.model]);if(!by.has(id))by.set(id,{id,key:r.key,model:r.model,rate:0,tokens:0,eligible:[]});const d=by.get(id);d.rate+=r.cost/24;d.tokens+=r.tokens/24;}
    if(by.size>64)return null;
    for(const d of by.values()){const member=data.members.find(m=>m.id===d.key);if(!member||member.restricted)return null;d.eligible=member.eligible?.[d.model]||[];}
    return [...by.values()].filter(d=>d.rate>eps);
  }
  // Pool totals do not require member ownership. When member/model permissions
  // are unknown, use the independently measured provider totals explicitly as
  // an aggregate scenario; never present that as compatible member capacity.
  function health(data, plan, now) {
    const input=plan?.input, accounts=input?.accounts||[], base=workload(data,now);
    const fresh=input&&now>=input.now&&now-input.now<=120000;
    const available=fresh&&accounts.length>0&&accounts.length<=plan.total&&accounts.every(a=>Number.isFinite(a.full)&&a.full>0&&Number.isFinite(a.periodHours)&&a.periodHours>0);
    const complete=available&&accounts.length===plan.total,partial=available&&!complete;
    const supply=available?accounts.reduce((n,a)=>n+(a.blocked?0:a.full/a.periodHours)*24,0):null;
    let modelAware=complete&&base!==null,work=modelAware?base:null;
    const scope=new Set(accounts.map(a=>a.id));
    const end=Math.floor(now/hour)*hour;
    const unpriced=data?.usage?.rows.some(r=>r.at>=end-24*hour&&r.at<end&&r.unpriced>0&&(!r.account||scope.has(r.account)));
    if(!modelAware&&!unpriced&&available&&plan.demandKnown&&plan.coverage===accounts.length){
      const groups=[...new Set(accounts.map(a=>a.group||''))],demands=input.demands;
      if(demands&&groups.every(g=>Number.isFinite(demands[g])&&demands[g]>=0)&&Object.keys(demands).every(g=>groups.includes(g))){
        work=groups.map(g=>({key:'',model:g,rate:demands[g],eligible:accounts.filter(a=>(a.group||'')===g).map(a=>a.id)}));
      }
    }
    return {work:available?work:null,modelAware,supply,demand:work===null?null:work.reduce((n,d)=>n+d.rate*24,0),complete,partial};
  }
  // Small bipartite residual network: demand nodes cannot spend the same
  // dollar twice. Augmenting paths let constrained models displace flexible ones.
  function allocate(accounts, demands, amounts) {
    const count=2+accounts.length+demands.length, sink=count-1, g=Array.from({length:count},()=>[]), edges=[];
    function edge(a,b,c){const x={to:b,cap:Math.max(0,c),initial:Math.max(0,c),rev:g[b].length},y={to:a,cap:0,initial:0,rev:g[a].length};g[a].push(x);g[b].push(y);return x;}
    accounts.forEach((a,i)=>edge(0,1+i,a.balance));
    demands.forEach((d,j)=>{edge(1+accounts.length+j,sink,amounts[j]);accounts.forEach((a,i)=>{if(d.eligible.includes(a.id))edges.push({i,j,e:edge(i+1,1+accounts.length+j,amounts.reduce((n,v)=>n+v,0))});});});
    let total=0;
    for(let guard=0;guard<10000;guard++){
      const prev=Array(count).fill(null),q=[0];prev[0]=[-1,-1];
      for(let h=0;h<q.length&&!prev[sink];h++)g[q[h]].forEach((e,i)=>{if(e.cap>eps&&!prev[e.to]){prev[e.to]=[q[h],i];q.push(e.to);}});
      if(!prev[sink])break;
      let v=sink,take=Infinity;while(v){const [p,i]=prev[v];take=Math.min(take,g[p][i].cap);v=p;}
      v=sink;while(v){const [p,i]=prev[v],e=g[p][i];e.cap-=take;g[v][e.rev].cap+=take;v=p;}total+=take;
    }
    const used=accounts.map(()=>0),served=demands.map(()=>0);
    for(const {i,j,e} of edges){const n=e.initial-e.cap;used[i]+=n;served[j]+=n;}
    return {total,used,served};
  }
  function ratio(accounts, demands) {
    const sum=demands.reduce((n,d)=>n+d.rate,0);if(sum<=eps)return null;
    const capacity=accounts.reduce((n,a)=>n+a.balance,0);
    if(capacity<=eps||demands.some(d=>d.rate>eps&&!accounts.some(a=>a.balance>eps&&d.eligible.includes(a.id))))return 0;
    let lo=0,hi=capacity/sum;
    for(let i=0;i<20;i++){const mid=(lo+hi)/2,need=demands.map(d=>d.rate*mid),f=allocate(accounts,demands,need);if(f.total+1e-6>=sum*mid)lo=mid;else hi=mid;}
    return lo;
  }
  function inventory(accounts, demands){const factor=ratio(accounts,demands);return factor===null?demands.map(()=>0):allocate(accounts,demands,demands.map(d=>d.rate*factor)).served;}
  function project(input, demands, days=30, cards=true) {
    if(!input?.accounts?.length||input.accounts.length>16||!demands||demands.length>64||days>90||demands.some(d=>!Number.isFinite(d.rate)||d.rate<0))return null;
    const aa=input.accounts.map(a=>({...a,balance:a.blocked?0:a.full*a.left/100,cards:cards?(a.cards||[]).map(c=>({...c})):[]}));
    if(aa.some(a=>!(a.full>0&&a.reset>input.now&&a.periodHours>0)))return null;
    let at=input.now,first=null;const end=at+days*24*hour,points=[],events=[],intervals=[],served=demands.map(()=>0);
    const snapshot=()=>points.push({at,total:aa.reduce((n,a)=>n+a.balance,0),served:[...served]});snapshot();
    while(at<=end){
      const eventCount=events.length;
      for(const a of aa)if(a.reset<=at){a.balance=a.blocked?0:a.full;a.reset+=a.periodHours*hour;events.push({at,id:a.id,kind:'reset'});}
      for(const a of aa){
        if(a.blocked||a.group!=='codex')continue;
        a.cards=a.cards.filter(c=>c.expiry>at).sort((a,b)=>a.expiry-b.expiry);
        const c=a.cards[0],empty=demands.some(d=>d.rate>eps&&d.eligible.includes(a.id)&&aa.filter(b=>!b.blocked&&d.eligible.includes(b.id)).every(b=>b.balance<=eps));
        const rescue=a.rescue&&empty&&at>=(a.rescueAfter||0)&&demands.some(d=>d.rate>0&&d.eligible.includes(a.id));
        if(c&&a.balance<=a.full*.8+eps&&(rescue||(a.auto&&at>=c.expiry-(a.leadMinutes||30)*60000&&a.reset>=c.expiry))){const old=a.reset;a.balance=a.full;a.reset=at+a.periodHours*hour;if(rescue)a.rescueAfter=old;a.cards.shift();events.push({at,id:a.id,kind:rescue?'rescue':'card'});}
      }
      if(events.length>eventCount)snapshot();
      if(at>=end)break;
      let next=Math.min(end,at+hour);
      for(const a of aa){next=Math.min(next,a.reset);for(const c of a.cards){if(c.expiry>at)next=Math.min(next,c.expiry);const t=c.expiry-(a.leadMinutes||30)*60000;if(t>at)next=Math.min(next,t);}}
      // Fair max-min demand ratio, then maximize use of the remaining stock.
      const scale=(next-at)/hour,targets=demands.map(d=>d.rate*scale),full=allocate(aa,demands,targets);
      // A fully covered slot already meets every fair target. Only shortages
      // need the bounded max-min search; per-member balance curves are not used.
      const f=full.served.every((v,i)=>v+eps>=targets[i])?full:allocate(aa,demands,demands.map(d=>d.rate*Math.min(scale,ratio(aa,demands)??0)));
      const rest=allocate(aa.map((a,i)=>({...a,balance:Math.max(0,a.balance-f.used[i])})),demands,targets.map((v,i)=>Math.max(0,v-f.served[i])));
      aa.forEach((a,i)=>a.balance=Math.max(0,a.balance-f.used[i]-rest.used[i]));
      demands.forEach((d,i)=>{const n=f.served[i]+rest.served[i];served[i]+=n;if(!first&&n+eps<targets[i])first={at,model:d.model};});
      // Availability means every compatible demand is covered in this slot,
      // not that the aggregate account balance is positive.
      intervals.push({from:at,to:next,available:targets.every((v,i)=>f.served[i]+rest.served[i]+eps>=v)});
      at=next;snapshot();
    }
    return {points,events,intervals,first,served,remaining:points.at(-1).total};
  }
  function outlook(run,from,to){
    if(!run?.intervals?.length||!(to>from)||run.intervals[0].from>from||run.intervals.at(-1).to<to)return null;
    const spans=[];
    for(const v of run.intervals){const a=Math.max(from,v.from),b=Math.min(to,v.to);if(b<=a)continue;const last=spans.at(-1);if(last&&last.available===v.available&&last.to===a)last.to=b;else spans.push({from:a,to:b,available:v.available});}
    const first=run.intervals.find(v=>v.to>from&&!v.available),recovery=first&&run.intervals.find(v=>v.from>=first.to&&v.available);
    return {spans,first:first?Math.max(from,first.from):null,recovery:recovery?.from??null,end:run.intervals.at(-1).to};
  }
  function shortageShift(natural,cards,now){
    if(!natural||!cards||natural.end!==cards.end||natural.end<=now)return null;
    if(natural.first===null&&cards.first===null)return null;
    return {hours:((cards.first??cards.end)-(natural.first??natural.end))/hour,bounded:natural.first===null||cards.first===null};
  }
  function ledger(data) {
    if(!data?.usage)return [];
    const owners=new Map(data.members.filter(m=>m.account).map(m=>[m.account,m.id]));
    return data.members.map(m=>{
      let used=0,lent=0,borrowed=0,known=data.usage.complete!==false;
      for(const r of data.usage.rows){if(r.key!==m.id&&owners.get(r.account)!==m.id)continue;if(r.unpriced){known=false;continue;}if(r.key===m.id)used+=r.cost;
        const owner=owners.get(r.account);if(owner&&r.key&&data.members.some(x=>x.id===r.key)&&owner!==r.key){if(owner===m.id)lent+=r.cost;if(r.key===m.id)borrowed+=r.cost;}}
      return {...m,used:known?used:null,lent:known&&m.account?lent:null,borrowed:known&&m.account?borrowed:null,net:known&&m.account?lent-borrowed:null};
    });
  }
  return {workload,health,allocate,ratio,inventory,project,outlook,shortageShift,ledger};
})();
if(typeof module!=='undefined')module.exports=quotaMembers;
