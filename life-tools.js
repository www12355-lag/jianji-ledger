(function(root){
  function cents(value){const n=Number(value),c=Math.round(n*100);if(!Number.isFinite(n)||n<0||c>1000000000||Math.abs(n*100-c)>0.00001)throw new Error('金额需精确到分且不超过一千万元');return c;}
  function split(total,count){if(!Number.isInteger(total)||total<1||!Number.isInteger(count)||count<2||count>20)throw new Error('请选择 2 至 20 位参与人');return Array.from({length:count},(_,i)=>Math.floor(total/count)+(i<total%count?1:0));}
  function validateBill(b){
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(b?.id||'')||!Array.isArray(b?.parts)||b.parts.some(p=>!p||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id||'')))throw new Error('分摊标识无效');
    if(!b||typeof b.id!=='string'||typeof b.title!=='string'||!b.title.trim()||b.title.length>40||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isInteger(b.totalCents)||b.totalCents<1||b.totalCents>1000000000||!Array.isArray(b.parts)||b.parts.length<2||b.parts.length>20)throw new Error('AA 分摊格式无效');
    const dateApi=typeof module!=='undefined'?require('./reporting.js'):root.JianjiReporting;if(!dateApi.validDate(b.date))throw new Error('分摊日期无效');
    const ids=new Set(),friends=new Set();let total=0,self=0;
    for(const p of b.parts){const paid=p?.paidCents===undefined?0:p.paidCents;if(!p||typeof p.id!=='string'||!p.id||p.id.length>64||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>40||!Number.isInteger(p.cents)||p.cents<0||!Number.isInteger(paid)||paid<0||paid>p.cents)throw new Error('参与人或结算金额无效');ids.add(p.id);total+=p.cents;if(p.self){self++;if(p.friendId)throw new Error('我的参与人不能关联好友');}if(p.friendId){if(typeof p.friendId!=='string'||friends.has(p.friendId))throw new Error('同一好友不能重复');friends.add(p.friendId);}}
    if(self>1)throw new Error('我的参与人不能重复');
    if(total!==b.totalCents||!ids.has(b.payer))throw new Error('每人应付合计必须等于总额');return b;
  }
  function validateWish(w){if(!w||typeof w.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(w.id)||typeof w.name!=='string'||!w.name.trim()||w.name.length>40||!Number.isInteger(w.priceCents)||w.priceCents<1||w.priceCents>1000000000||!['waiting','bought','skipped'].includes(w.state)||![24,72,168].includes(w.hours)||!Number.isFinite(Date.parse(w.created))||typeof w.reason!=='string'||w.reason.length>160)throw new Error('想买清单格式无效');return w;}
  function wishStatus(w,now=Date.now()){const left=Date.parse(w.created)+w.hours*3600000-now;return w.state==='bought'?'已购买':w.state==='skipped'?'暂时不买':left<=0?'冷静期已结束':`还剩 ${Math.max(1,Math.ceil(left/3600000))} 小时`;}
  function annual(entries,goals,bounds){
    const api=typeof module!=='undefined'?require('./share-report.js'):root.JianjiShareReport;
    const months=Array.from({length:12},(_,i)=>{const month=bounds.start.slice(0,4)+'-'+String(i+1).padStart(2,'0');const s=api.summarize(entries,{start:month+'-01',through:bounds.through<month+'-31'?bounds.through:month+'-31'});return {month:i+1,count:s.count,net:s.net};});
    let completed=0;
    for(const g of goals||[]){const before=g.contributions.filter(c=>c.date<bounds.start).reduce((s,c)=>s+cents(c.amount),0),after=g.contributions.filter(c=>c.date<=bounds.through).reduce((s,c)=>s+cents(c.amount),0);if(before<cents(g.target)&&after>=cents(g.target))completed++;}
    return {months,completedGoals:completed};
  }
  const api={cents,split,validateBill,validateWish,wishStatus,annual};root.JianjiLife=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
