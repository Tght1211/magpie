// Event-driven conditional inventory projection. Work scales with refills and
// account depletion, not the number of minutes in a multi-year view.
const quotaExplorer = (() => {
  const hour=3600000, day=24*hour, eps=1e-7;
  function project(input,end,rescue=true) {
    if(!input?.accounts?.length || !Number.isFinite(end) || end<=input.now || end-input.now>10*366*day)return null;
    const aa=input.accounts.map(a=>({...a,balance:a.full*a.left/100,source:0,cards:(a.cards||[]).map(c=>({...c,used:false})),after:a.rescueAfter||0}));
    if(aa.length>16 || aa.some(a=>!(a.periodHours>=1&&a.full>0&&a.reset>input.now)))return null;
    const groups=[...new Set(aa.map(a=>a.group||''))];
    if(!input.demands && groups.length>1)return null;
    const demand=g=>Math.max(0,input.demands?.[g]??input.demand??0);
    let at=input.now, spent=0,unserved=0,cardCount=0,cardGain=0;
    const points=[],events=[],uses=[];
    const snap=()=>{const parts=[0,0,0];for(const a of aa)parts[a.source]+=a.balance;points.push({at,parts,total:parts.reduce((v,w)=>v+w,0)});};
    const refill=(a,kind,c)=>{const old=a.reset,gain=a.full-a.balance;if(c){c.used=true;a.reset=at+a.periodHours*hour;cardCount++;cardGain+=gain;if(kind==='rescue')a.after=old;}else a.reset+=a.periodHours*hour;
      a.balance=a.full;a.source=c?2:1;events.push({at,id:a.id,kind,gain,next:a.reset,old});snap();};
    snap();
    for(let guard=0;at<end&&guard<200000;guard++) {
      // Natural resets at the same instant precede any emergency decision.
      for(const a of aa)if(a.reset<=at)refill(a,'reset');
      for(const a of aa){
        if(a.blocked || a.group!=='codex')continue;
        const cs=a.cards.filter(c=>!c.used&&c.expiry>at).sort((a,b)=>a.expiry-b.expiry);
        const stock=aa.filter(b=>!b.blocked&&b.group===a.group).reduce((n,b)=>n+b.balance,0);
        const c=cs[0];if(!c)continue;
        if(rescue&&a.rescue&&stock<=eps&&demand(a.group)>0&&at>=a.after)refill(a,'rescue',c);
        else if(a.auto&&a.balance<=a.full*.8+eps&&at>=c.expiry-(a.leadMinutes||30)*60000&&a.reset>=c.expiry)refill(a,'card',c);
      }
      const picks=groups.map(g=>({g,rate:demand(g),a:aa.filter(a=>a.group===g&&!a.blocked&&a.balance>eps).sort((a,b)=>{
        const deadline=a=>Math.min(a.reset,...(a.auto&&a.group==='codex'?a.cards.filter(c=>!c.used&&c.expiry>at).map(c=>c.expiry):[]));return deadline(a)-deadline(b);
      })[0]}));
      let next=end;
      for(const a of aa){next=Math.min(next,a.reset);if(a.after>at)next=Math.min(next,a.after);
        for(const c of a.cards)if(!c.used&&c.expiry>at){next=Math.min(next,c.expiry);const lead=c.expiry-(a.leadMinutes||30)*60000;if(lead>at)next=Math.min(next,lead);}}
      for(const p of picks)if(p.a&&p.rate>0){next=Math.min(next,at+p.a.balance/p.rate*hour);
        if(p.a.auto&&p.a.group==='codex'&&p.a.balance>p.a.full*.8&&p.a.cards.some(c=>!c.used&&c.expiry>at&&at>=c.expiry-(p.a.leadMinutes||30)*60000&&p.a.reset>=c.expiry))next=Math.min(next,at+(p.a.balance-p.a.full*.8)/p.rate*hour);}
      if(next<=at+.001)next=Math.min(end,at+1);
      let amount=0;
      for(const p of picks){const wanted=p.rate*(next-at)/hour,used=p.a?Math.min(wanted,p.a.balance):0;if(p.a)p.a.balance=Math.max(0,p.a.balance-used);amount+=used;unserved+=wanted-used;}
      uses.push({from:at,to:next,amount});spent+=amount;at=next;snap();
    }
    if(at<end)return null;
    return {points,events,uses,spent,unserved,cardCount,cardGain,remaining:points.at(-1).total};
  }
  // Calendar days use the reader's zone, including DST transitions.
  function weekendRanges(from,to) {
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>10*366*day)return [];
    const d=new Date(from);d.setHours(0,0,0,0);
    if(d.getDay()===0)d.setDate(d.getDate()-1);else d.setDate(d.getDate()+(6-d.getDay()));
    const out=[];
    while(+d<to){const end=new Date(d);end.setDate(end.getDate()+2);if(+end>from)out.push({from:Math.max(from,+d),to:Math.min(to,+end)});d.setDate(d.getDate()+7);}
    return out;
  }
  const scales=[{id:'day',days:1,key:'1 day'},{id:'week',days:7,key:'1 week'},{id:'month',days:30,key:'1 month'},{id:'year',days:365,key:'1 year'},{id:'years',days:3*365,key:'3 years'}];
  function range(s) {const span=(scales.find(v=>v.id===s.scale)||scales[1]).days*day;return {from:s.start??Date.now()-day,to:(s.start??Date.now()-day)+span,span};}
  return {project,range,scales,hour,day,weekendRanges};
})();
if(typeof module!=='undefined')module.exports=quotaExplorer;
