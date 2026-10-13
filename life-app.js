let aaOnline=[],aaDraft=[],aaEditing=null,wishEditing=null,aaPaymentRetry=new Map(),lifeBusy=false;
const lifeId=()=>crypto.randomUUID().replaceAll('-','');
const lifeToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
async function lifeAction(work){if(lifeBusy||!$('appLockOverlay').hidden)return;lifeBusy=true;try{await work();}catch(e){toast(e.message||'操作未完成');}finally{lifeBusy=false;}}
async function changeLife(work){const before=structuredClone(data);try{work();await save();}catch(e){data=before;throw e;}}
function openWishes(){wishEditing=null;$('wishForm').hidden=true;renderWishes();open('wishModal');}
function renderWishes(){
  $('wishSummary').textContent=`等待决定 ${data.wishList.filter(w=>w.state==='waiting').length} 项 · 放下的愿望预算 ${money(data.wishList.filter(w=>w.state==='skipped').reduce((s,w)=>s+w.priceCents,0)/100)}（计划价格，非实际节省）`;
  $('wishList').innerHTML=data.wishList.slice().reverse().map(w=>`<article class="life-card"><div class="life-title"><b>${escapeHtml(w.name)}</b><strong>${money(w.priceCents/100)}</strong></div><p>${escapeHtml(w.reason||'给自己一点考虑的时间')}</p><small>${escapeHtml(JianjiLife.wishStatus(w))}</small><div class="life-actions">${w.state==='waiting'?`<button data-wish="bought" data-id="${w.id}">已买</button><button data-wish="skipped" data-id="${w.id}">暂时不买</button><button data-wish="edit" data-id="${w.id}">修改</button>`:''}<button data-wish="delete" data-id="${w.id}">删除</button></div></article>`).join('')||'<div class="empty">下次心动时，先把愿望放在这里。</div>';
}
function editWish(w){wishEditing=w?.id||null;$('wishForm').reset();if(w){$('wishName').value=w.name;$('wishPrice').value=(w.priceCents/100).toFixed(2);$('wishReason').value=w.reason;$('wishHours').value=w.hours;}$('wishForm').hidden=false;$('wishName').focus();}
function aaScreen(view){$('aaListView').hidden=view!=='list';$('aaForm').hidden=view!=='form';$('aaDetail').hidden=view!=='detail';$('aaStatus').textContent='';}
function openAA(){aaScreen('list');renderAAList();open('aaModal');refreshAA().catch(e=>$('aaStatus').textContent=e.message);}
async function refreshAA(){if(!socialSession||!socialState){aaOnline=[];renderAAList();return;}const token=socialSession.token;const reply=await socialRequest('/v1/aa');if(token!==socialSession?.token)return;aaOnline=reply.bills;renderAAList();}
function renderAAList(){
  const uid=socialState?.user.id,visible=aaOnline.filter(b=>!b.own||!data.aaBills.some(l=>l.cloudId===b.id&&l.cloudOwner===uid));
  $('aaBills').innerHTML=data.aaBills.slice().reverse().map(b=>`<button class="life-card life-open" data-aa-local="${b.id}"><b>${escapeHtml(b.title)}</b><small>${escapeHtml(b.date)} · ${money(b.totalCents/100)} · ${b.cloudId?'已在线分享':'本机分摊'}</small></button>`).join('')+visible.map(b=>`<button class="life-card life-open" data-aa-online="${b.id}"><b>${escapeHtml(b.bill.title)}</b><small>${escapeHtml(b.nickname)} · ${b.closed?'已撤回':b.state==='invited'?'等待接收':'在线分摊'}</small></button>`).join('')||'<div class="empty">聚餐、出游，都可以留一张分摊单。</div>';
}
function drawAAParts(){
  const payer=$('aaPayer').value;
  $('aaParts').innerHTML=aaDraft.map((p,i)=>`<div class="aa-person" data-part="${p.id}"><label class="field">${i===0?'我':'参与人 '+(i+1)}<input data-part-name maxlength="40" value="${escapeHtml(p.name)}" ${p.self?'readonly':''} required></label>${!p.self?`<label class="field">关联好友（可选）<select data-part-friend><option value="">仅记录姓名</option>${(socialState?.friends||[]).map(f=>`<option value="${f.id}" ${p.friendId===f.id?'selected':''}>${escapeHtml(friendName(f.id,f.nickname))}</option>`).join('')}</select></label>`:''}<label class="field">应付金额<input data-part-cents type="number" step="0.01" min="0" value="${(p.cents/100).toFixed(2)}" ${$('aaSplit').value==='equal'?'readonly':''} required></label>${i>1?'<button type="button" data-part-remove>移除</button>':''}</div>`).join('');
  $('aaPayer').innerHTML=aaDraft.map(p=>`<option value="${p.id}">${escapeHtml(p.name||'未命名')}</option>`).join('');if(aaDraft.some(p=>p.id===payer))$('aaPayer').value=payer;updateAASum();
}
function updateAASum(){const total=aaDraft.reduce((s,p)=>s+p.cents,0);$('aaSum').textContent=`应付合计 ${money(total/100)} · 总额 ${money(Number($('aaTotal').value))}；均分余下的分按参与人顺序分配。`;}
function divideAA(){try{const amounts=JianjiLife.split(JianjiLife.cents($('aaTotal').value),aaDraft.length);if($('aaSplit').value==='equal')aaDraft.forEach((p,i)=>p.cents=amounts[i]);}catch{}drawAAParts();}
function newAA(){aaEditing=null;$('aaForm').reset();$('aaDate').value=lifeToday();aaDraft=[{id:lifeId(),name:'我',self:true,cents:0,paidCents:0},{id:lifeId(),name:'',cents:0,paidCents:0}];$('aaEntry').innerHTML='<option value="">不关联</option>'+liveEntries().filter(e=>e.type==='expense').slice().reverse().slice(0,200).map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.date+' '+(e.note||e.category))} · ${money(e.amount)}</option>`).join('');aaScreen('form');drawAAParts();}
function showAADetail(localId,onlineId){
  const local=data.aaBills.find(b=>b.id===localId),online=aaOnline.find(b=>b.id===(onlineId||local?.cloudId)&&(!local||local.cloudOwner===socialState?.user.id));
  const item=online?.bill||local;if(!item)return toast('请先刷新分摊单');aaScreen('detail');
  const hidden=online&&!online.own&&online.state==='invited',closed=online?.closed||false;
  let content=`<div class="life-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.date)}${item.totalCents?' · '+money(item.totalCents/100):''}</p><p class="import-help">${closed?'发起人已撤回这张分摊单。':hidden?'待你接收：你的份额 '+money(item.ownCents/100)+'。确认后，所有已接收的参与人可见完整分摊与结算记录。':'记录结算不会转账，也不会自动改变账本收支。'}</p>`;
  if(hidden&&!closed)content+=`<button class="primary" data-aa-join="${online.id}">确认接收</button>`;
  if(!hidden&&item.parts){
    const payer=item.parts.find(p=>p.id===item.payer);content+=`<p>垫付人：${escapeHtml(payer?.name||'')}</p>`;
    for(const p of item.parts){const paid=online?online.payments.filter(x=>x.part===p.id&&x.state==='confirmed').reduce((s,x)=>s+x.cents,0):(p.paidCents||0),pending=online?online.payments.filter(x=>x.part===p.id&&x.state==='pending').reduce((s,x)=>s+x.cents,0):0,allowed=!closed&&(!local?.cloudId||!!online)&&p.id!==item.payer&&(!online||online.own||p.friendId===socialState?.user.id);
      content+=`<div class="aa-settlement"><b>${escapeHtml(p.name)}</b><small>应付 ${money(p.cents/100)} · 已结 ${money(paid/100)}${pending?' · 待核对 '+money(pending/100):''}${p.id===item.payer?' · 垫付人':''}</small>${allowed&&paid+pending<p.cents?`<button data-aa-pay="${p.id}" data-local="${local?.id||''}" data-online="${online?.id||''}" data-max="${p.cents-paid-pending}">${online&&!online.own?'提交已结算':'记录结算'}</button>`:''}</div>`;
    }
    if(online?.own)for(const p of online.payments.filter(p=>p.state==='pending'))content+=`<div class="aa-settlement"><p>${escapeHtml(item.parts.find(x=>x.id===p.part)?.name||'参与人')}申请结算 ${money(p.cents/100)}</p><button data-aa-confirm="${p.id}" data-bill="${online.id}" data-state="confirmed">确认收到</button><button data-aa-confirm="${p.id}" data-bill="${online.id}" data-state="rejected">未收到</button></div>`;
  }
  if(local&&!local.cloudId)content+=`<button class="quiet-button" data-aa-publish="${local.id}">邀请已关联的好友在线查看</button><button class="quiet-button danger" data-aa-delete="${local.id}">删除本机分摊</button>`;
  if(online?.own&&!closed)content+=`<button class="quiet-button danger" data-aa-withdraw="${online.id}">撤回在线分摊</button>`;
  if(local?.cloudId&&!online)content+='<p class="import-help">该分摊曾分享。联网并登录原账号后查看最新结算，离线内容仅供参考。</p>';
  content+='</div><button class="quiet-button" data-aa-back>返回列表</button>';$('aaDetail').innerHTML=content;
}
async function handleAA(e){const b=e.target.closest('button');if(!b)return;await lifeAction(async()=>{
  if(b.hasAttribute('data-aa-back')){aaScreen('list');renderAAList();}
  else if(b.dataset.aaLocal)showAADetail(b.dataset.aaLocal);
  else if(b.dataset.aaOnline)showAADetail(null,b.dataset.aaOnline);
  else if(b.dataset.aaJoin){if(!confirm('接收后，本单已接收的参与人都能查看完整分摊和结算记录。确认接收？'))return;await socialRequest('/v1/aa/'+b.dataset.aaJoin+'/join','POST');await refreshAA();showAADetail(null,b.dataset.aaJoin);}
  else if(b.dataset.aaDelete){if(!confirm('删除这张本机分摊单？账本收支不受影响。'))return;await changeLife(()=>data.aaBills=data.aaBills.filter(x=>x.id!==b.dataset.aaDelete));aaScreen('list');renderAAList();}
  else if(b.dataset.aaPublish){
    const bill=data.aaBills.find(x=>x.id===b.dataset.aaPublish);if(!socialState||!socialSession)throw new Error('请先到“我的”登录账号');
    const recipients=bill.parts.filter(p=>p.friendId&&socialState.friends.some(f=>f.id===p.friendId)).map(p=>p.friendId);
    if(!recipients.length)throw new Error('新建分摊时，先为参与人关联一位好友');
    if(bill.parts.some(p=>p.paidCents))throw new Error('已有本机结算，请保留本机记录；需要在线协作时新建分摊单');
    if(!confirm(`邀请 ${recipients.map(id=>friendName(id)).join('、')} 接收“${bill.title}”？总额 ${money(bill.totalCents/100)}。确认接收后可见本单所有人的姓名、份额与结算记录；不会分享关联账目的备注或照片。`))return;
    const uid=socialState.user.id,token=socialSession.token,reply=await socialRequest('/v1/aa','POST',{localId:bill.id,bill:{title:bill.title,date:bill.date,totalCents:bill.totalCents,payer:bill.payer,parts:bill.parts.map(({id,name,self,friendId,cents})=>({id,name,self,friendId,cents}))},recipients});
    if(token!==socialSession?.token)return;await changeLife(()=>{bill.cloudId=reply.id;bill.cloudOwner=uid;});await refreshAA();showAADetail(bill.id);
  }else if(b.dataset.aaWithdraw){if(!confirm('撤回后，好友无法继续查看或提交结算；已有转账不会撤销。'))return;await socialRequest('/v1/aa/'+b.dataset.aaWithdraw,'DELETE');await refreshAA();showAADetail(null,b.dataset.aaWithdraw);}
  else if(b.dataset.aaPay){
    const text=prompt('本次已结算金额（这里只记录，不会转账）',String(Number(b.dataset.max)/100));if(text===null)return;const cents=JianjiLife.cents(text);if(cents<1||cents>Number(b.dataset.max))throw new Error('金额超过尚未结清的份额');
    if(b.dataset.online){const key=[b.dataset.online,b.dataset.aaPay,cents,socialState?.user.id].join(':'),nonce=aaPaymentRetry.get(key)||lifeId();aaPaymentRetry.set(key,nonce);await socialRequest('/v1/aa/'+b.dataset.online+'/payments','POST',{part:b.dataset.aaPay,cents,clientId:nonce});aaPaymentRetry.delete(key);await refreshAA();showAADetail(b.dataset.local,b.dataset.online);}
    else {await changeLife(()=>{const p=data.aaBills.find(x=>x.id===b.dataset.local).parts.find(x=>x.id===b.dataset.aaPay);if(p.paidCents+cents>p.cents)throw new Error('份额已变化，请重新打开');p.paidCents+=cents;});showAADetail(b.dataset.local);}
  }else if(b.dataset.aaConfirm){await socialRequest('/v1/aa/'+b.dataset.bill+'/payments/'+b.dataset.aaConfirm,'PATCH',{state:b.dataset.state});await refreshAA();showAADetail(null,b.dataset.bill);}
});}
function setupLife(){
  setupPossessions();
  $('wishNew').onclick=()=>editWish();$('wishCancel').onclick=()=>$('wishForm').hidden=true;
  $('wishForm').onsubmit=e=>{e.preventDefault();lifeAction(async()=>{if(!wishEditing&&data.wishList.length>=200)throw new Error('清单最多保留 200 项，请整理旧愿望');const prior=data.wishList.find(w=>w.id===wishEditing);const w={id:prior?.id||lifeId(),created:prior?.created||new Date().toISOString(),state:'waiting',name:$('wishName').value.trim(),priceCents:JianjiLife.cents($('wishPrice').value),reason:$('wishReason').value.trim(),hours:Number($('wishHours').value)};JianjiLife.validateWish(w);await changeLife(()=>{if(prior)data.wishList[data.wishList.indexOf(prior)]=w;else data.wishList.push(w);});$('wishForm').hidden=true;renderWishes();});};
  $('wishList').onclick=e=>{const b=e.target.closest('[data-wish]');if(!b)return;lifeAction(async()=>{const w=data.wishList.find(w=>w.id===b.dataset.id);if(!w)return;if(b.dataset.wish==='edit')return editWish(w);if(b.dataset.wish==='delete'&&!confirm('删除这个愿望？'))return;if(b.dataset.wish==='bought'&&Date.now()<Date.parse(w.created)+w.hours*3600000&&!confirm('冷静期还没结束，仍然标记为已买？'))return;await changeLife(()=>{if(b.dataset.wish==='delete')data.wishList=data.wishList.filter(x=>x!==w);else w.state=b.dataset.wish;});renderWishes();});};
  $('aaNew').onclick=newAA;$('aaRefresh').onclick=()=>lifeAction(refreshAA);$('aaCancel').onclick=()=>{aaScreen('list');renderAAList();};$('aaTotal').oninput=$('aaSplit').onchange=divideAA;
  $('aaAddPerson').onclick=()=>{if(aaDraft.length>=20)return toast('最多 20 人');aaDraft.push({id:lifeId(),name:'',cents:0,paidCents:0});divideAA();};
  $('aaParts').oninput=e=>{const row=e.target.closest('[data-part]'),p=aaDraft.find(x=>x.id===row?.dataset.part);if(!p)return;if(e.target.hasAttribute('data-part-name'))p.name=e.target.value;if(e.target.hasAttribute('data-part-cents')){try{p.cents=JianjiLife.cents(e.target.value);}catch{p.cents=-1;}updateAASum();}};
  $('aaParts').onchange=e=>{if(!e.target.hasAttribute('data-part-friend'))return;const p=aaDraft.find(x=>x.id===e.target.closest('[data-part]').dataset.part);p.friendId=e.target.value;if(p.friendId)p.name=friendName(p.friendId);drawAAParts();};
  $('aaParts').onclick=e=>{if(e.target.hasAttribute('data-part-remove')){aaDraft=aaDraft.filter(x=>x.id!==e.target.closest('[data-part]').dataset.part);divideAA();}};
  $('aaEntry').onchange=()=>{const entry=liveEntries().find(x=>String(x.id)===$('aaEntry').value);if(entry){$('aaTotal').value=entry.amount;$('aaDate').value=entry.date;if(!$('aaName').value)$('aaName').value=entry.note||entry.category;divideAA();}};
  $('aaForm').onsubmit=e=>{e.preventDefault();lifeAction(async()=>{if(data.aaBills.length>=500)throw new Error('最多保留 500 张分摊单');const bill={id:lifeId(),title:$('aaName').value.trim(),date:$('aaDate').value,totalCents:JianjiLife.cents($('aaTotal').value),payer:$('aaPayer').value,parts:structuredClone(aaDraft),entryId:$('aaEntry').value};JianjiLife.validateBill(bill);const linked=liveEntries().find(x=>String(x.id)===bill.entryId);if(bill.entryId&&(!linked||linked.type!=='expense'||JianjiLife.cents(linked.amount)!==bill.totalCents))throw new Error('关联支出的金额必须等于总金额');await changeLife(()=>data.aaBills.push(bill));aaScreen('list');renderAAList();});};
  $('aaBills').onclick=$('aaDetail').onclick=handleAA;
}
