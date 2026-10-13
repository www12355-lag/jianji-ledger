const reportThemes={
 purple:{paper:'#faf6ee',ink:'#302d43',accent:'#7967bb',soft:'#eee7fa',muted:'#94879b',card:'#fffdf9'},
 green:{paper:'#f1f6ed',ink:'#283f37',accent:'#497c68',soft:'#deeddd',muted:'#83978a',card:'#fcfdf8'},
 peach:{paper:'#fff3e9',ink:'#563c36',accent:'#bf7966',soft:'#f7dfd3',muted:'#a0877c',card:'#fffcf7'}
};
function drawReportPoster(canvas,report,options){
  canvas.width=1080;canvas.height=1620;
  const c=canvas.getContext('2d'),theme=reportThemes[options.theme]||reportThemes.purple;
  const font='"Microsoft YaHei","PingFang SC",sans-serif';
  const text=(value,x,y,size=30,color=theme.ink,weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px ${font}`;c.fillText(String(value),x,y);};
  const fit=(value,x,y,max,size=30,color=theme.ink,weight=400)=>{c.font=`${weight} ${size}px ${font}`;let output=String(value);while(c.measureText(output).width>max&&size>18){size-=2;c.font=`${weight} ${size}px ${font}`;}if(c.measureText(output).width>max){while(output&&c.measureText(output+'…').width>max)output=output.slice(0,-1);output+='…';}text(output,x,y,size,color,weight);};
  const card=(x,y,w,h,fill=theme.card,r=32)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();};
  const line=(x,y,w)=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.strokeStyle=theme.soft;c.lineWidth=2;c.stroke();};
  const amount=value=>options.hideAmounts?'•••':`${value<0?'−':''}¥${Math.abs(value).toFixed(2)}`;
  const short=value=>value.replace(/-/g,'.');
  const {bounds,summary:s}=report;
  c.fillStyle=theme.paper;c.fillRect(0,0,1080,1620);
  // Small code-drawn ornaments keep the exported image self-contained.
  c.strokeStyle=theme.accent;c.lineWidth=5;c.beginPath();c.arc(929,169,55,0,Math.PI*2);c.stroke();c.beginPath();c.arc(929,169,24,0,Math.PI*2);c.stroke();
  c.beginPath();c.moveTo(852,100);c.lineTo(852,126);c.moveTo(839,113);c.lineTo(865,113);c.moveTo(996,244);c.lineTo(996,270);c.moveTo(983,257);c.lineTo(1009,257);c.stroke();
  text('简记 · 生活账本',66,83,27,theme.accent,600);
  text(`第 ${bounds.start.replace(/-/g,'')} 期`,779,83,22,theme.muted);
  fit(`${options.name.trim()||'我的'}${bounds.label}`,66,202,780,76,theme.ink,700);
  text(bounds.mode==='day'?short(bounds.start):`${short(bounds.start)} — ${short(bounds.end)}`,69,254,26,theme.muted);
  text(bounds.incomplete?`本期进行中 · 截至 ${short(bounds.through)}`:'这一期，记录生活的小片段',69,298,23,theme.muted);
  card(64,341,952,186,theme.soft);
  text('本期趣味称号',96,391,22,theme.accent);
  fit(options.hideCategories&&s.topCategory?'日常观察家':s.title,96,457,850,49,theme.ink,700);
  text(options.hideCategories&&s.topCategory?'生活的每一面，都值得被看见。':s.quote,96,499,27,theme.accent);
  card(64,555,952,274);
  text('生活的收支切片',96,608,29,theme.ink,600);
  text('收入',96,667,24,theme.muted);text('净支出',412,667,24,theme.muted);text('收支结余',728,667,24,theme.muted);
  fit(amount(s.income),96,716,278,42,theme.ink,700);fit(amount(s.net),412,716,278,42,theme.ink,700);fit(amount(s.balance),728,716,254,42,theme.ink,700);
  line(96,751,888);
  fit(report.comparison,96,798,865,24,theme.accent);
  card(64,857,952,318);
  text(options.hideCategories?'生活关键词':'钱都去哪里了',96,914,29,theme.ink,600);
  if(s.empty){text('这一期还没有收支记录',96,984,31,theme.muted);text('有记录的生活，才有回看的故事。',96,1044,26,theme.muted);}
  else if(options.hideCategories){text('分类名称已隐藏',96,984,31,theme.muted);text(`留下 ${s.count} 笔日常，慢慢认识自己的生活。`,96,1044,26,theme.accent);}
  else if(!s.categories.length){text(s.net<0?'退款比本期支出更多':'这一期，没有记下支出',96,984,30,theme.muted);text('每一笔收支，都有自己的故事。',96,1044,26,theme.accent);}
  else{
    const top=s.categories.slice(0,3);
    top.forEach((item,i)=>{const y=963+i*69;fit(item.category,96,y,238,29,theme.ink,600);card(350,y-22,472,14,theme.soft,7);card(350,y-22,Math.max(6,472*item.percent/100),14,theme.accent,7);text(`${item.percent}%`,854,y,27,theme.accent,600);});
    text(s.negativeCategories?'比例按净支出为正的类别计算，已含退款抵扣':'比例按净支出为正的类别计算',96,1151,20,theme.muted);
  }
  card(64,1203,952,207);
  text('记录的日常，也是一种成就',96,1261,29,theme.ink,600);
  fit(`${s.count}`,96,1322,90,44,theme.accent,700);text('笔收支',199,1322,25,theme.muted);
  fit(`${s.recordedDays}`,427,1322,90,44,theme.accent,700);text('天有记录',530,1322,25,theme.muted);
  const habit=s.empty?'没记账不代表没消费，下一笔再继续。':s.refunds>0?`${s.daysWithoutRecordedExpense} 个有记录的日子未记支出 · 本期有退款抵扣`:`${s.daysWithoutRecordedExpense} 个有记录的日子未记支出`;
  fit(habit,96,1370,870,23,theme.muted);
  text('把日子记下来，把生活过明白。',66,1490,36,theme.ink,600);
  text(options.hideAmounts?'分享版 · 已隐藏具体金额':'分享版 · 未包含商户、备注、账户或照片',66,1541,22,theme.accent);
  text('仅反映已记账收支 · 收支结余不是账户余额 · 趣味称号仅供娱乐',66,1580,18,theme.muted);
  return canvas;
}
