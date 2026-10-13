(function(root){
  'use strict';
  const categories=['数码','家电','衣物','出行','运动','家居','其他'];
  const states={active:'在用',idle:'闲置',sold:'已卖出',retired:'已退役'};
  // A small, consistent SVG illustration set, rendered without external fonts or downloads.
  const icons=[
    ['phone','手机','数码','M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M10 5h4 M11 19h2'],
    ['laptop','笔记本','数码','M4 4h16v12H4Z M2 20l2-4h16l2 4Z M10 18h4'],
    ['tablet','平板','数码','M5 2h14v20H5Z M8 5h8 M11 19h2'],
    ['monitor','显示器','数码','M2 3h20v14H2Z M12 17v4 M7 21h10'],
    ['earbuds','耳机','数码','M7 3a3 3 0 0 0-3 3v5h5V6a3 3 0 0 0-2-3Z M17 3a3 3 0 0 1 3 3v5h-5V6a3 3 0 0 1 2-3Z M4 14h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z M10 17h4'],
    ['headphones','头戴耳机','数码','M4 14V9a8 8 0 0 1 16 0v5 M3 11h4v9H3Z M17 11h4v9h-4Z'],
    ['camera','相机','数码','M3 7h5l2-3h4l2 3h5v13H3Z M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 10h1'],
    ['watch','手表','数码','M9 2h6l1 5H8Z M8 17h8l-1 5H9Z M7 7h10v10H7Z M12 9v3l2 1'],
    ['gamepad','游戏机','数码','M7 7h10c3 0 4 3 5 8s-3 7-6 1H8c-3 6-7 4-6-1s2-8 5-8Z M6 10v4 M4 12h4 M16 11h.1 M19 13h.1'],
    ['speaker','音箱','数码','M5 2h14v20H5Z M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 5h.1'],
    ['keyboard','键盘','数码','M2 6h20v13H2Z M5 10h1 M9 10h1 M13 10h1 M17 10h1 M5 13h1 M9 13h1 M13 13h1 M17 13h1 M7 16h10'],
    ['fridge','冰箱','家电','M6 2h12v20H6Z M6 9h12 M9 5v2 M9 12v5'],
    ['washer','洗衣机','家电','M4 2h16v20H4Z M4 7h16 M7 4h.1 M11 4h.1 M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M8 14h8'],
    ['tv','电视','家电','M3 6h18v13H3Z M8 2l4 4 4-4 M7 22l2-3 M15 19l2 3'],
    ['aircon','空调','家电','M2 4h20v8H2Z M5 9h14 M7 15v4 M12 15v7 M17 15v4'],
    ['fan','风扇','家电','M12 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M12 18v4 M7 22h10 M12 10c-6-6 3-8 0 0c8-2 5 7 0 0c-2 8-9 2 0 0Z'],
    ['cleaner','吸尘器','家电','M5 2h4v9H5Z M7 11v6 M4 17h6v4H4Z M9 3h3v10h5 M14 13h7v9h-7Z'],
    ['kettle','小家电','家电','M7 8h9l2 12H5Z M8 8V5h7v3 M16 10h4v7h-3 M9 2h4 M5 22h13'],
    ['bag','箱包','衣物','M5 7h14v14H5Z M9 7V3h6v4 M5 12h14 M9 11v3 M15 11v3'],
    ['shirt','衣服','衣物','M8 3l4 2 4-2 6 5-4 4-2-2v12H8V10l-2 2-4-4Z'],
    ['shoes','鞋子','衣物','M4 6l6 5 7 2c3 1 5 3 5 6H2v-8Z M2 19v3h20v-3 M10 11l-2 3 M14 12l-2 3'],
    ['jewelry','饰品','衣物','M5 4h14l4 6-11 12L1 10Z M1 10h22 M8 4l-3 6 7 12 7-12-3-6'],
    ['car','汽车','出行','M3 10l3-6h12l3 6v9H3Z M3 10h18 M6 14h2 M16 14h2 M5 19v3 M19 19v3'],
    ['bike','自行车','出行','M5 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M19 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M5 17l5-9 4 9H5 M19 17l-5-13h4 M8 7h5'],
    ['luggage','行李箱','出行','M6 6h12v14H6Z M9 6V2h6v4 M9 9v8 M15 9v8 M8 20v2 M16 20v2'],
    ['fitness','运动器材','运动','M2 8h3v8H2Z M5 5h4v14H5Z M9 12h6 M15 5h4v14h-4Z M19 8h3v8h-3Z'],
    ['ball','球类','运动','M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2v20 M5 5c8 1 8 13 0 14 M19 5c-8 1-8 13 0 14'],
    ['chair','家具','家居','M6 2h12v12H6Z M3 14h18v4H3Z M5 18v4 M19 18v4 M3 10v4 M21 10v4'],
    ['lamp','灯具','家居','M8 2h8l5 10H3Z M12 12v10 M7 22h10'],
    ['book','书籍','家居','M3 3c5-1 7 0 9 2 2-2 4-3 9-2v17c-5-1-7 0-9 2-2-2-4-3-9-2Z M12 5v17'],
    ['guitar','乐器','家居','M16 2l4 2-7 10 M16 5l3 2 M8 11c-6-3-9 6-5 10s13 1 10-5c1-3-1-6-5-5Z M8 16h.1'],
    ['tools','工具','其他','M15 2a6 6 0 0 0-5 9L2 19l3 3 8-8a6 6 0 0 0 9-5l-5 3-4-4 3-5Z'],
    ['box','其他物品','其他','M2 7l10-5 10 5v12l-10 4-10-4Z M2 7l10 5 10-5 M12 12v11 M7 4l10 6']
  ];
  function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;}
  const stamp=s=>Date.parse(s+'T00:00:00Z');
  function validate(p){
    if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||!Number.isInteger(p.priceCents)||p.priceCents<0||p.priceCents>1000000000||!categories.includes(p.category)||!icons.some(i=>i[0]===p.icon)||!Object.hasOwn(states,p.state)||!['icon','photo'].includes(p.cover)||!validDate(p.purchaseDate)||!validDate(p.startDate)||p.startDate<p.purchaseDate||typeof p.note!=='string'||p.note.length>300||p.entryId!==undefined&&(typeof p.entryId!=='string'||p.entryId.length>100)||p.photoId!==undefined&&(typeof p.photoId!=='string'||!p.photoId||p.photoId.length>128))throw new Error('归物本的物品信息格式无效');
    if(['sold','retired'].includes(p.state)&&(!validDate(p.endDate)||p.endDate<p.startDate)||!['sold','retired'].includes(p.state)&&p.endDate)throw new Error('物品结束日期无效');
    if(p.cover==='photo'&&!p.photoId)throw new Error('物品图片缺失');return p;
  }
  function metrics(p,day=today()){
    const ended=['sold','retired'].includes(p.state);if(!validDate(day)||!validDate(p.startDate)||ended&&(!validDate(p.endDate)||p.endDate<p.startDate))throw new Error('统计日期无效');const end=ended&&p.endDate<day?p.endDate:day;
    const days=Math.max(0,Math.floor((stamp(end)-stamp(p.startDate))/86400000)+1);
    let months=0;if(days){const a=new Date(p.startDate+'T00:00:00Z'),b=new Date(end+'T00:00:00Z');months=(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()-(b.getUTCDate()<a.getUTCDate()?1:0);}
    const years=Math.floor(months/12),rest=months%12,age=years?`${years}年${rest?rest+'个月':''}`:months?`${months}个月`:`${days}天`;
    const net=api.costs?api.costs(p,day).net:p.priceCents;
    return {days,daily:days?net/100/days:0,grossDaily:days?p.priceCents/100/days:0,age:days?age:'待开始',ended};
  }
  function summary(items,day=today()){return {count:items.length,totalCents:items.reduce((s,p)=>s+p.priceCents,0),daily:items.reduce((s,p)=>s+metrics(p,day).daily,0)};}
  function photoRecords(snapshot){return [...(snapshot.entries||[]),...(snapshot.possessions||[])];}
  const api={categories,states,icons,today,validDate,validate,metrics,summary,photoRecords};root.JianjiPossessions=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
