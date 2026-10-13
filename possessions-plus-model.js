(function(root){
  const api=typeof module!=='undefined'?require('./possessions.js'):root.JianjiPossessions,oldValidate=api.validate;
  const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v);
  const money=v=>Number.isInteger(v)&&v>=0&&v<=1000000000;
  function shift(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);if(!Number.isFinite(+d)||d.getUTCFullYear()>9999)return null;return d.toISOString().slice(0,10);}
  function costs(p,day=api.today()){const fees=(p.fees||[]).filter(f=>f.date<=day);const added=fees.filter(f=>f.kind==='expense').reduce((s,f)=>s+f.cents,0),recovered=fees.filter(f=>f.kind==='recovery').reduce((s,f)=>s+f.cents,0);return {added,recovered,net:p.priceCents+added-recovered};}
  function goal(p,day=api.today()){if(!p.targetDailyCents)return null;const m=api.metrics(p,day),net=costs(p,day).net,needed=Math.max(1,Math.ceil(net/p.targetDailyCents)),reached=m.days>0&&net<=p.targetDailyCents*m.days;return {reached,needed,remaining:Math.max(0,needed-m.days),percent:Math.min(100,Math.max(0,m.days/needed*100)),date:shift(p.startDate,needed-1),ended:m.ended};}
  function validate(p){oldValidate(p);if(p.deletedAt!==undefined&&(typeof p.deletedAt!=='string'||!Number.isFinite(Date.parse(p.deletedAt))))throw new Error('物品删除时间无效');if(p.targetDailyCents!==undefined&&!money(p.targetDailyCents))throw new Error('目标日均金额无效');
    for(const key of ['warrantyDate','maintenanceDate'])if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key]&&!api.validDate(p[key])))throw new Error('物品提醒日期无效');
    if(p.reminderDays!==undefined&&![0,1,3,7,14,30].includes(p.reminderDays)||p.careReminders!==undefined&&typeof p.careReminders!=='boolean'||p.receiptPhotoId!==undefined&&(typeof p.receiptPhotoId!=='string'||!p.receiptPhotoId||p.receiptPhotoId.length>128))throw new Error('物品凭证或提醒设置无效');
    const used=new Set(p.entryId?[p.entryId]:[]),ids=new Set();if(p.fees!==undefined&&(!Array.isArray(p.fees)||p.fees.length>500))throw new Error('每件物品最多保留 500 条成本记录');
    for(const f of p.fees||[]){if(!f||!id(f.id)||ids.has(f.id)||typeof f.name!=='string'||!f.name.trim()||f.name.length>60||!['expense','recovery'].includes(f.kind)||!money(f.cents)||f.cents===0||!api.validDate(f.date)||f.date<p.purchaseDate||f.entryId!==undefined&&(typeof f.entryId!=='string'||f.entryId.length>100))throw new Error('物品追加费用或回收金额无效');if(f.entryId&&used.has(f.entryId))throw new Error('同一账目不能在这件物品中重复计入');if(f.entryId)used.add(f.entryId);ids.add(f.id);}return p;
  }
  const live=items=>items.filter(p=>!p.deletedAt);
  const expired=(items,now=Date.now())=>items.filter(p=>p.deletedAt&&now-Date.parse(p.deletedAt)>=30*86400000);
  function reminders(items,day=api.today()){const out=[];for(const p of live(items)){if(!p.careReminders||['sold','retired'].includes(p.state))continue;for(const [key,kind] of [['warrantyDate','warranty'],['maintenanceDate','maintenance']]){const due=p[key];if(!due||due<day)continue;const notice=shift(due,-(p.reminderDays??7));out.push({id:'pos-'+p.id+'-'+kind,frequency:'once',kind:'possession',startDate:notice<day?day:notice,dueDate:due,active:true});}}return out;}
  function photoRefs(snapshot){const out=[];for(const p of [...(snapshot.entries||[]),...(snapshot.possessions||[])])for(const field of ['photoId','receiptPhotoId'])if(p[field])out.push({record:p,field});return out;}
  function review(items,year,mode,day=api.today(),ids=null){const start=year+'-01-01',through=year+'-12-31'<day?year+'-12-31':day;let list=live(items).filter(p=>p.purchaseDate<=through&&(!ids||ids.includes(p.id)));if(mode==='new')list=list.filter(p=>p.purchaseDate>=start);if(mode==='year')list=list.filter(p=>p.startDate<=through&&(!['sold','retired'].includes(p.state)||p.endDate>=start));
    list.sort((a,b)=>mode==='new'?b.purchaseDate.localeCompare(a.purchaseDate):api.metrics(b,through).days-api.metrics(a,through).days);const fresh=list.filter(p=>p.purchaseDate>=start),held=list.reduce((s,p)=>{const a=p.startDate>start?p.startDate:start,b=['sold','retired'].includes(p.state)&&p.endDate<through?p.endDate:through;return s+Math.max(0,Math.floor((Date.parse(b)-Date.parse(a))/86400000)+1);},0);
    return {items:list,count:list.length,newCount:fresh.length,newTotal:fresh.reduce((s,p)=>s+p.priceCents,0),heldDays:held,start,through};}
  Object.assign(api,{validate,shift,costs,goal,live,expired,reminders,photoRefs,review,photoRecords:snapshot=>photoRefs(snapshot).map(({record,field})=>({photoId:record[field]}))});
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
