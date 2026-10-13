(function(root){
  const api=typeof module!=='undefined'?require('./share-report.js'):root.JianjiShareReport;
  function create(entries,budgets,mode,anchor,options={},today){
    const bounds=api.period(mode,anchor,today), summary=api.summarize(entries,bounds);
    const hideAmounts=options.hideAmounts!==false, hideCategories=options.hideCategories!==false;
    let budget=null;
    if(options.shareBudget&&mode==='month'){
      const limits=budgets?.[bounds.start.slice(0,7)]||{};
      const categories=Object.keys(limits).filter(name=>Number(limits[name])>0);
      const limit=categories.reduce((sum,name)=>sum+Number(limits[name]),0);
      let spent=0;
      for(const entry of entries.filter(e=>!e.deletedAt&&e.date>=bounds.start&&e.date<=bounds.through)){
        if(entry.type==='expense')for(const part of entry.splits?.length?entry.splits:[entry])if(categories.includes(part.category))spent+=Math.round(part.amount*100);
        if(entry.type==='refund'&&categories.includes(entry.category))spent-=Math.round(entry.amount*100);
      }
      if(limit>0)budget={percent:Math.min(10000,Math.round(Math.max(0,spent/100)/limit*1000)/10)};
    }
    return {mode,start:bounds.start,end:bounds.end,through:bounds.through,hideAmounts,hideCategories,
      count:summary.count,recordedDays:summary.recordedDays,income:hideAmounts?null:summary.income,
      net:hideAmounts?null:summary.net,balance:hideAmounts?null:summary.balance,
      categories:summary.categories.map((c,i)=>({name:hideCategories?`分类 ${i+1}`:c.category,percent:c.percent})),budget};
  }
  root.JianjiSocialReport={create};if(typeof module!=='undefined')module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
