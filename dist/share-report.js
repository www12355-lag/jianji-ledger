(function(root){
  const dateApi=typeof module!=='undefined'?require('./reporting.js'):root.JianjiReporting;
  const cents=value=>Math.round(Number(value||0)*100);
  const parse=value=>{const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12);};
  const move=(value,days)=>{const date=parse(value);date.setDate(date.getDate()+days);return dateApi.iso(date);};
  const titles={餐饮:['生活补给官','认真吃饭，也是认真生活。'],交通:['城市漫游者','每一次出发，都算生活的新章节。'],购物:['生活焕新家','给日常添一点新鲜感。'],居住:['温暖筑巢师','把平凡的日子，过成喜欢的样子。'],娱乐:['快乐收藏家','在日常里，收集属于自己的快乐。'],医疗:['自我关怀者','照顾好自己，是值得记录的事。']};
  function period(mode,anchor,today=dateApi.iso(new Date())){
    if(!['day','week','month','year'].includes(mode)||!dateApi.validDate(anchor)||!dateApi.validDate(today))throw new Error('请选择有效的报告日期');
    if(anchor>today)throw new Error('报告日期不能晚于今天');
    let start=anchor,end=anchor;
    if(mode==='week'){const day=parse(anchor).getDay();start=move(anchor,-((day+6)%7));end=move(start,6);}
    if(mode==='month'){const [y,m]=anchor.split('-').map(Number);const bounds=dateApi.range('month',y,m-1);start=bounds.start;end=bounds.end;}
    if(mode==='year'){start=anchor.slice(0,4)+'-01-01';end=anchor.slice(0,4)+'-12-31';}
    return {mode,start,end,through:end>today?today:end,incomplete:end>today,label:{day:'日报',week:'周报',month:'月报',year:'年度回顾'}[mode]};
  }
  function summarize(entries,bounds){
    const list=entries.filter(e=>!e.deletedAt&&e.date>=bounds.start&&e.date<=bounds.through&&['income','expense','refund'].includes(e.type));
    let income=0,spent=0,refunds=0;
    const categories=new Map(),days=new Map();
    for(const entry of list){
      const amount=cents(entry.amount);
      if(entry.type==='income')income+=amount;
      if(entry.type==='refund'){refunds+=amount;categories.set(entry.category,(categories.get(entry.category)||0)-amount);}
      if(entry.type==='expense'){
        spent+=amount;
        for(const part of entry.splits?.length?entry.splits:[{category:entry.category,amount:entry.amount}])categories.set(part.category,(categories.get(part.category)||0)+cents(part.amount));
      }
      const day=days.get(entry.date)||{spent:0};if(entry.type==='expense')day.spent+=amount;days.set(entry.date,day);
    }
    const ranking=[...categories].map(([category,total])=>({category,total:total/100})).sort((a,b)=>b.total-a.total);
    const positive=ranking.filter(c=>c.total>0),positiveTotal=positive.reduce((sum,c)=>sum+cents(c.total),0);
    const top=positive[0], identity=list.length?(top?(titles[top.category]||['日常观察家','生活的每一面，都值得被看见。']):['生活记录员','每一笔记录，都是日常留下的脚印。']):['故事待续','今天的生活，还等着你写下第一笔。'];
    return {income:income/100,spent:spent/100,refunds:refunds/100,net:(spent-refunds)/100,balance:(income-spent+refunds)/100,count:list.length,recordedDays:days.size,daysWithoutRecordedExpense:[...days.values()].filter(day=>day.spent===0).length,categories:positive.map(c=>({...c,percent:positiveTotal?Math.round(cents(c.total)/positiveTotal*100):0})),negativeCategories:ranking.filter(c=>c.total<0).length,title:identity[0],quote:identity[1],topCategory:top?.category||'',empty:!list.length};
  }
  function previous(bounds){
    if(bounds.mode==='year')return period('year',(Number(bounds.start.slice(0,4))-1)+'-01-01',bounds.through);
    if(bounds.mode==='month'){const date=parse(bounds.start);date.setMonth(date.getMonth()-1);return period('month',dateApi.iso(date),bounds.through);}
    const anchor=move(bounds.start,bounds.mode==='week'?-7:-1);return period(bounds.mode,anchor,bounds.through);
  }
  function comparison(entries,bounds,current){
    if(bounds.incomplete)return '本期进行中，先记录当下';
    const prior=summarize(entries,previous(bounds));
    if(!prior.count)return '上一期未记账，暂不比较';
    if(prior.net<=0||current.net<0)return '有退款抵扣，本期不计算变化比例';
    const percent=Math.round((current.net-prior.net)/prior.net*100);
    return percent===0?'记账净支出与上一期持平':`记账净支出比上一期${percent>0?'多':'少'} ${Math.abs(percent)}%`;
  }
  const api={period,summarize,comparison};root.JianjiShareReport=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
