let detailRange=null, statsMode='month', statsCustom=null;
let modalSequence=0;
const modalParents=new Map();
const homeOptions=[['quick','分类速记'],['templates','常用模板'],['savings','储蓄目标'],['recent','最近记录']];
function renderHomeLayout(){
  const prefs=JianjiReporting.preferences(data.homeLayout);
  $('quickSection').hidden=!prefs.quick;
  $('templateSection').hidden=!prefs.templates||!data.templates.length;
  $('quickCard').hidden=$('quickSection').hidden&&$('templateSection').hidden;
  $('recentCard').hidden=!prefs.recent;
  $('recentCard').parentElement.hidden=!prefs.recent;
  $('homeSavings').hidden=!prefs.savings||!data.savingsGoals.length;
  if($('homeLayoutModal').classList.contains('show'))renderHomeOptions();
}
function renderHomeOptions(){
  const prefs=JianjiReporting.preferences(data.homeLayout);
  $('homeLayoutOptions').innerHTML=homeOptions.map(([id,label])=>`<label class="option-row"><span>${label}</span><input type="checkbox" data-home-option="${id}" ${prefs[id]?'checked':''}></label>`).join('');
}
function openHomeLayout(){renderHomeOptions();open('homeLayoutModal');}
async function saveHomeLayout(){
  const before=data.homeLayout;
  data.homeLayout=Object.fromEntries([...$('homeLayoutOptions').querySelectorAll('input')].map(input=>[input.dataset.homeOption,input.checked]));
  $('saveHomeLayout').disabled=true;
  try{await save();renderHomeLayout();close('homeLayoutModal');toast('首页设置已保存');}catch{data.homeLayout=before;toast('设置保存失败，请重试');}finally{$('saveHomeLayout').disabled=false;}
}
function toolTiles(tools){
  const favorites=data.favoriteTools||[];
  return tools.map(tool=>`<div class="tool-tile"><button type="button" data-tool="${tool[1]}"><span aria-hidden="true">${uiIcon(tool[1])}</span><b>${escapeHtml(tool[3])}</b></button><button type="button" class="tool-star" data-favorite="${tool[1]}" aria-label="${favorites.includes(tool[1])?'取消收藏':'收藏'}${escapeHtml(tool[3])}" aria-pressed="${favorites.includes(tool[1])}">${favorites.includes(tool[1])?'★':'☆'}</button></div>`).join('');
}
function renderToolDiscovery(){
  const tools=featureTools(), query=$('toolSearch').value.trim().toLocaleLowerCase();
  $('favoriteTools').innerHTML=toolTiles(tools.filter(tool=>(data.favoriteTools||[]).includes(tool[1])));
  $('favoritesSection').hidden=!$('favoriteTools').children.length||!!query;
  $('toolSearchResults').hidden=!query;
  $('toolSearchResults').innerHTML=query?toolTiles(tools.filter(tool=>`${tool[3]} ${tool[4]}`.toLocaleLowerCase().includes(query))):'';
  $('toolSearchEmpty').hidden=!query||!!$('toolSearchResults').children.length;
  $('featureGroups').hidden=!!query;
  for(const panel of ['featurePlan','featureDaily','featureManage']){
    const group={featurePlan:'plan',featureDaily:'daily',featureManage:'manage'}[panel];
    $(panel).querySelector('.tool-grid').innerHTML=toolTiles(tools.filter(tool=>tool[0]===group));
    $(panel).hidden=!!query||!document.querySelector(`[data-feature-group="${group}"]`).classList.contains('active');
  }
}
let favoriteSaving=false;
async function toggleToolFavorite(id){
  if(favoriteSaving)return;
  if(!featureTools().some(tool=>tool[1]===id))return;
  const before=[...(data.favoriteTools||[])];
  data.favoriteTools=before.includes(id)?before.filter(item=>item!==id):[...before,id];
  renderToolDiscovery();
  favoriteSaving=true;
  try{await save();}catch{data.favoriteTools=before;renderToolDiscovery();toast('收藏保存失败');}finally{favoriteSaving=false;}
}
function noteModalOpening(id){
  const target=$(id), previous=topModal();
  modalParents.delete(id);
  if(previous&&previous.id!==id&&['featureDetailModal','recordDetailModal'].includes(previous.id))modalParents.set(id,previous.id);
  target.dataset.modalOrder=String(++modalSequence);target.style.zIndex=String(10+modalSequence%1000);
  document.body.classList.add('has-modal');
}
function topModal(){return [...document.querySelectorAll('.modalback.show')].sort((a,b)=>Number(b.dataset.modalOrder||0)-Number(a.dataset.modalOrder||0))[0];}
function dismissModal(id){
  if(!$('appLockOverlay').hidden)return;
  if(id==='possessionsModal'){posBack();return;}
  if(id==='socialModal'&&!$('socialShareView').hidden){$('socialShareBack').click();return;}
  if(id==='socialModal'&&socialCurrentView==='chat'){socialDisplay('messages');return;}
  if(id==='socialModal'&&socialCurrentView==='friend'){socialDisplay('friends');return;}
  const modal=$(id), savingsBack=modal.querySelector('[data-back-savings]');
  if(savingsBack){savingsBack.click();return;}
  const parent=modalParents.get(id);close(id);
  if(parent){if(parent==='recordDetailModal')openRecordDetail(recordDetailId);else open(parent);}
}
function handleAppBack(){
  if(!$('appLockOverlay').hidden)return false;
  if(document.body.classList.contains('keyboard-open')&&document.activeElement?.matches('input,textarea,select')){document.activeElement.blur();return true;}
  const modal=topModal();if(modal){dismissModal(modal.id);return true;}
  if(activePage!=='home'){switchPage('home');return true;}
  return false;
}
function refreshModalViewport(){
  const viewport=window.visualViewport;
  document.documentElement.style.setProperty('--visible-height',`${viewport?.height||window.innerHeight}px`);
  document.documentElement.style.setProperty('--visible-top',`${viewport?.offsetTop||0}px`);
  document.body.classList.toggle('keyboard-open',!!viewport&&window.innerHeight-viewport.height>120);
  if(document.activeElement?.matches('.modal input,.modal textarea'))requestAnimationFrame(()=>document.activeElement.scrollIntoView({block:'nearest'}));
}
let recordDetailId=null,detailPhotoUrl=null,detailPhotoRequest=0;
function clearDetailPhoto(){++detailPhotoRequest;if(detailPhotoUrl)URL.revokeObjectURL(detailPhotoUrl);detailPhotoUrl=null;}
async function openRecordDetail(id){
  const entry=liveEntries().find(item=>String(item.id)===String(id));if(!entry)return;
  recordDetailId=String(id);clearDetailPhoto();
  const type={expense:'支出',income:'收入',refund:'退款',excluded:'不计收支'}[entry.type];
  const account=id=>data.accounts.find(item=>item.id===id)?.name||'未指定账户';
  const rows=[['日期',formatDate(entry.date)],['类别',entry.splits?.length?'多类别支出':entry.type==='expense'||entry.type==='refund'?entry.category:type],['账户',entry.transferFrom?`${account(entry.transferFrom)} → ${account(entry.transferTo)}`:account(entry.accountId)],['商户',entry.merchant||'未填写'],['备注',entry.note||'未填写'],['项目',(entry.projectIds||[]).map(id=>data.projects.find(p=>p.id===id)?.name).filter(Boolean).join('、')||'未关联'],['来源',entry.source||'手动记录']];
  const related=entry.type==='expense'?liveEntries().filter(item=>item.type==='refund'&&String(item.refundOf)===String(entry.id)):[];
  const original=entry.type==='refund'?liveEntries().find(item=>String(item.id)===String(entry.refundOf)):null;
  $('recordDetailContent').innerHTML=`<div class="record-detail-amount"><small>${type}</small><strong>${money(entry.amount)}</strong></div><dl class="record-fields">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${entry.splits?.length?`<section class="detail-section"><h3>类别拆分</h3>${entry.splits.map(p=>`<p>${escapeHtml(p.category)}<b>${money(p.amount)}</b></p>`).join('')}</section>`:''}${entry.type==='expense'?`<section class="detail-section"><h3>退款情况</h3><p>已退 ${money(related.reduce((sum,r)=>sum+Number(r.amount),0))} · ${related.length} 笔</p>${related.map(r=>`<button class="related-record" type="button" data-related-record="${escapeHtml(r.id)}">${formatDate(r.date)} · ${escapeHtml(r.category)}<b>${money(r.amount)} ›</b></button>`).join('')}</section>`:''}${original?`<button class="related-record" data-related-record="${escapeHtml(original.id)}" type="button">查看原支出<b>${money(original.amount)} ›</b></button>`:''}${entry.photoId?'<section class="detail-section"><h3>图片凭证</h3><p id="detailPhotoStatus" class="import-help">正在加载图片…</p><button type="button" id="zoomDetailPhoto" class="detail-photo-button" hidden><img id="detailPhoto" alt="账目图片，点击放大"></button></section>':''}<div class="record-detail-actions">${entry.type==='expense'?`<button type="button" data-detail-action="refund">记退款</button>`:''}<button type="button" data-detail-action="edit">编辑</button><button type="button" class="danger" data-detail-action="delete">删除</button></div>`;
  open('recordDetailModal');
  if(entry.photoId){const request=detailPhotoRequest;try{const blob=await photoStore('get',entry.photoId);if(request!==detailPhotoRequest||recordDetailId!==String(id))return;if(!blob){$('detailPhotoStatus').textContent='图片暂时不可用';return;}detailPhotoUrl=URL.createObjectURL(blob);$('detailPhoto').src=detailPhotoUrl;$('detailPhotoStatus').hidden=true;$('zoomDetailPhoto').hidden=false;$('zoomDetailPhoto').onclick=()=>{$('fullRecordPhoto').src=detailPhotoUrl;open('photoViewerModal');};}catch{if(request===detailPhotoRequest)$('detailPhotoStatus').textContent='图片读取失败，请重新打开详情';}}
}
function renderDetailRange(){
  $('detailRangeBanner').hidden=!detailRange;
  if(detailRange)$('detailRangeText').textContent=`${formatDate(detailRange.start)} — ${formatDate(detailRange.end)}${$('recordCategory').value?' · '+$('recordCategory').value:''}`;
}
function statsBounds(){return JianjiReporting.range(statsMode,view.getFullYear(),view.getMonth(),statsCustom?.start,statsCustom?.end);}
function statsEntries(){return liveEntries().filter(entry=>JianjiReporting.within(entry,statsBounds()));}
function refreshPeriodHeader(){
  $('month').textContent=activePage==='stats'?(statsMode==='year'?`${view.getFullYear()}年`:statsMode==='custom'?'自选日期':`${view.getFullYear()}年${view.getMonth()+1}月`):`${view.getFullYear()}年${view.getMonth()+1}月`;
  $('prev').disabled=$('next').disabled=activePage==='stats'&&statsMode==='custom';
  $('prev').setAttribute('aria-label',activePage==='stats'&&statsMode==='year'?'上一年':'上个月');
  $('next').setAttribute('aria-label',activePage==='stats'&&statsMode==='year'?'下一年':'下个月');
}
function renderAnalytics(){
  refreshPeriodHeader();
  const bounds=statsBounds(), list=statsEntries(), income=list.filter(e=>e.type==='income').reduce((sum,e)=>sum+Number(e.amount),0), expense=JianjiFeatures.netExpense(list);
  $('statsRangeLabel').textContent=`${formatDate(bounds.start)} — ${formatDate(bounds.end)}`;
  $('statsMode').value=statsMode;$('statsCustomForm').hidden=statsMode!=='custom';
  $('statsIncome').textContent=money(income);$('statsExpense').textContent=money(expense);$('statsBalance').textContent=money(income-expense);
  const labels=document.querySelectorAll('#statsPage .stat-card>span');labels[0].textContent='期间收入';labels[1].textContent='期间净支出';labels[2].textContent='期间结余';
  const totals=cats.map(category=>({category,total:list.reduce((sum,e)=>sum+JianjiFeatures.categoryNet(e,category),0)})).filter(item=>item.total!==0).sort((a,b)=>b.total-a.total);
  $('categoryStats').innerHTML=totals.map(item=>`<button type="button" class="category-row category-drill" data-stats-category="${escapeHtml(item.category)}"><div class="rowtop"><b class="category-name"><span class="category-mini ${toneClass(item.category)}">${iconMarkup(item.category)}</span>${escapeHtml(item.category)}</b><span>${money(item.total)} ›</span></div><small>${expense>0&&item.total>=0?`占期间净支出 ${Math.round(item.total/expense*100)}%`:'退款抵扣后净额'}</small><div class="track"><div class="fill" style="width:${expense>0?Math.max(0,Math.min(100,item.total/expense*100)):0}%"></div></div></button>`).join('')||'<div class="empty">这个日期范围还没有支出或退款</div>';
  let trendBounds=bounds;
  if(statsMode==='month'){const date=new Date(view.getFullYear(),view.getMonth()-5,1);trendBounds={start:JianjiReporting.iso(date),end:bounds.end};}
  const trend=JianjiReporting.buckets(trendBounds).map(bucket=>{const entries=liveEntries().filter(e=>JianjiReporting.within(e,trendBounds)&&e.date.startsWith(bucket.key));return {...bucket,income:entries.filter(e=>e.type==='income').reduce((sum,e)=>sum+Number(e.amount),0),expense:JianjiFeatures.netExpense(entries)};});
  const maximum=Math.max(0,...trend.flatMap(t=>[t.income,Math.abs(t.expense)]));
  $('trendTitle').textContent=statsMode==='month'?'近 6 个月':'期间收支趋势';
  $('trendStats').innerHTML=maximum?`<div class="trend-chart">${trend.map(t=>`<button type="button" class="trend-col trend-drill" data-stats-bucket="${t.key}" aria-label="查看${t.key}明细，收入${money(t.income)}，净支出${money(t.expense)}"><div class="trend-bars"><div class="trend-bar income" style="height:${Math.max(0,t.income)/maximum*100}%"></div><div class="trend-bar expense" style="height:${Math.abs(t.expense)/maximum*100}%"></div></div><span>${t.label}</span></button>`).join('')}</div><p class="import-help">点击柱状图查看明细；净支出为负时表示退款超过当期支出。</p>`:'<div class="empty">这个日期范围还没有收支记录</div>';
  let comparison='暂无可比较的期间', difference=0;
  if(statsMode!=='custom'){const prior=statsMode==='year'?JianjiReporting.range('year',view.getFullYear()-1,0):JianjiReporting.range('month',view.getFullYear(),view.getMonth()-1);const amount=JianjiFeatures.netExpense(liveEntries().filter(e=>JianjiReporting.within(e,prior)));difference=expense-amount;comparison=amount===0?'上一期间暂无净支出':`${difference>=0?'多':'少'} ${money(Math.abs(difference))}`;}
  const months=new Set(list.map(e=>e.date.slice(0,7)));
  const over=new Set();for(const month of months)for(const category of cats){const limit=Number(data.budgets[month]?.[category]);if(limit>0&&liveEntries().filter(e=>e.date.startsWith(month)).reduce((sum,e)=>sum+JianjiFeatures.categoryNet(e,category),0)>limit)over.add(category);}
  $('reviewTitle').textContent='期间回顾';
  $('monthlyReview').innerHTML=`<div class="review-grid"><div><small>期间净支出</small><b>${money(expense)}</b></div><div><small>${statsMode==='year'?'比上一年':statsMode==='month'?'比上个月':'期间比较'}</small><b>${comparison}</b></div><div><small>最多的类别</small><b>${totals.find(t=>t.total>0)?escapeHtml(totals.find(t=>t.total>0).category):'暂无'}</b></div><div><small>涉及月份的超预算类别</small><b>${over.size?[...over].map(escapeHtml).join('、'):'无'}</b></div></div>`;
}
function drillIntoStats(category='',bounds=statsBounds()){
  detailRange={...bounds};$('allMonths').checked=true;detailFilter=category?'expense':'all';
  for(const id of ['recordSearch','recordSource','recordProject'])$(id).value='';$('recordCategory').value=category;
  document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===detailFilter);b.setAttribute('aria-pressed',String(b.dataset.filter===detailFilter));});
  $('advancedFilters').hidden=true;render();switchPage('details');
}
function setupPolish(){
  setupSocial();
  setupShareReport();
  $('saveHomeLayout').onclick=saveHomeLayout;
  $('toolSearch').oninput=renderToolDiscovery;
  $('featuresPage').addEventListener('click',event=>{const star=event.target.closest('[data-favorite]');if(star){event.stopPropagation();toggleToolFavorite(star.dataset.favorite);}const button=event.target.closest('[data-tool]');if(button){event.stopPropagation();openTool(button.dataset.tool);}});
  document.querySelectorAll('.tool-grid').forEach(grid=>grid.onclick=null);
  $('recordDetailContent').onclick=event=>{const related=event.target.closest('[data-related-record]');if(related)return openRecordDetail(related.dataset.relatedRecord);const action=event.target.closest('[data-detail-action]');if(!action)return;const fake=document.createElement('button');fake.dataset[action.dataset.detailAction]=recordDetailId;handleRecordClick({target:fake}).then(()=>{if(action.dataset.detailAction==='delete'&&!liveEntries().some(e=>String(e.id)===recordDetailId))close('recordDetailModal');});};
  $('statsMode').onchange=()=>{statsMode=$('statsMode').value;if(statsMode==='custom'&&!statsCustom){statsCustom=JianjiReporting.range('month',view.getFullYear(),view.getMonth());$('statsStart').value=statsCustom.start;$('statsEnd').value=statsCustom.end;}renderAnalytics();refreshDateLabels();};
  $('statsCustomForm').onsubmit=event=>{event.preventDefault();try{const bounds=JianjiReporting.range('custom',0,0,$('statsStart').value,$('statsEnd').value);statsCustom=bounds;renderAnalytics();}catch(error){toast(error.message);}};
  $('categoryStats').onclick=event=>{const button=event.target.closest('[data-stats-category]');if(button)drillIntoStats(button.dataset.statsCategory);};
  $('trendStats').onclick=event=>{const button=event.target.closest('[data-stats-bucket]');if(!button)return;const parts=button.dataset.statsBucket.split('-').map(Number);let bounds=JianjiReporting.range(parts.length===1?'year':'month',parts[0],(parts[1]||1)-1);if(statsMode!=='month'){const selected=statsBounds();bounds.start=bounds.start<selected.start?selected.start:bounds.start;bounds.end=bounds.end>selected.end?selected.end:bounds.end;}drillIntoStats('',bounds);};
  $('statsIncomeCard').onclick=()=>{drillIntoStats();detailFilter='income';document.querySelector('[data-filter="income"]').click();};
  $('statsExpenseCard').onclick=()=>{drillIntoStats();document.querySelector('[data-filter="expense"]').click();};
  $('backToStats').onclick=()=>switchPage('stats');$('clearDetailRange').onclick=()=>{detailRange=null;$('allMonths').checked=false;render();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&handleAppBack())event.preventDefault();});
  window.handleAppBack=handleAppBack;
  window.visualViewport?.addEventListener('resize',refreshModalViewport);window.visualViewport?.addEventListener('scroll',refreshModalViewport);window.addEventListener('resize',refreshModalViewport);refreshModalViewport();
}
