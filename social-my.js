let socialCurrentView='account',myLoadPending=null,socialAutoTimer=null,socialAutoGeneration=0,socialAutoWorking=false;
let chatFriend=null,chatItems=[],chatMore=false,chatGeneration=0,chatLoading=false,chatQueue=null,chatPinBottom=false;
const chatDrafts=new Map();
let socialAutoError='',myBackupError='';
const socialViewNames={account:'账号资料',friends:'我的好友',messages:'消息',chat:'聊天',feed:'好友分享',auto:'自动分享',ranking:'排行榜',friend:'好友资料',cloud:'加密云备份'};
function autoKey(){return socialState?'jianji-auto-share-'+socialState.user.id:null;}
function autoOptions(){
  let value={};try{value=JSON.parse(localStorage.getItem(autoKey())||'{}');}catch{}
  return {enabled:value.enabled===true,mode:['day','week','month'].includes(value.mode)?value.mode:'week',hideAmounts:value.hideAmounts!==false,hideCategories:value.hideCategories!==false,shareBudget:value.shareBudget===true,recipients:Array.isArray(value.recipients)?value.recipients.filter(id=>typeof id==='string'):[],published:value.published&&typeof value.published==='object'?value.published:{},lastAt:Number(value.lastAt)||0,lastMode:value.lastMode||'',lastRecipients:Array.isArray(value.lastRecipients)?value.lastRecipients:[]};
}
function storeAuto(value){if(!autoKey())throw new Error('请先登录');localStorage.setItem(autoKey(),JSON.stringify(value));}
function socialTime(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';}
function renderMyBackup(){
  const dates=[data.lastBackupAt,lastAutoBackupAt].filter(value=>value&&Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a));
  const latest=dates[0],count=liveEntries().length,items=data.possessions?.length||0,days=latest?Math.max(0,Math.floor((Date.now()-Date.parse(latest))/86400000)):null;
  const overdue=(count>0||items>0)&&(days===null||days>=(Number(data.backupIntervalDays)||30));
  $('myBackupBadge').textContent=myBackupError?'需要检查':overdue?'建议备份':latest?'已备份':'尚未备份';
  $('myBackupBadge').classList.toggle('needs-backup',!!myBackupError||overdue);
  $('myBackupLast').textContent=latest?'上次备份：'+socialTime(latest):'还没有保存过完整账本备份';
  const content=`${count} 笔账目${items?'、'+items+' 件物品':''}`;
  $('myBackupHint').textContent=myBackupError?'自动备份未完成：'+myBackupError:overdue?(latest?`已 ${days} 天未备份，当前有 ${content}。`:`当前有 ${content}，建议保存一份加密备份。`):`当前 ${content}${autoBackupConfigured?' · 已开启自动加密备份':''}`;
  $('myBackupOpen').textContent=latest?'备份与恢复 ›':'现在备份 ›';
}
function renderAutoSummary(){
  const user=socialState?.user;
  if(!user){$('myAutoLabel').textContent='由你选择，默认关闭';$('myAutoDetail').textContent='';$('socialAutoSummary').replaceChildren();$('socialAutoStatus').textContent='';return;}
  const v=autoOptions(),names=v.recipients.map(id=>friendName(id,'已移除的好友'));
  const state=!v.enabled?'已关闭':!navigator.onLine?'等待联网':socialAutoWorking?'正在分享':socialAutoError?'等待重试':'已开启';
  $('myAutoLabel').textContent=state+(v.enabled?' · '+socialLabels[v.mode]:'');
  const short=names.slice(0,2).map(n=>Array.from(n).slice(0,8).join('')).join('、');
  $('myAutoDetail').textContent=v.enabled?`${short?'给 '+short+(names.length>2?` 等 ${names.length} 人`:''):'尚未选择接收好友'} · ${v.lastAt?'上次 '+socialTime(v.lastAt):'尚未自动分享'}`:v.lastAt?'上次分享：'+socialTime(v.lastAt):'';
  $('socialAutoSummary').innerHTML=`<b>${state}${v.enabled?' · '+socialLabels[v.mode]:''}</b><p>接收好友：${escapeHtml(names.join('、')||'尚未选择')}</p><p>上次分享：${v.lastAt?escapeHtml(socialTime(v.lastAt))+' · '+escapeHtml(socialLabels[v.lastMode]||'小报'):'还没有自动分享记录'}</p>`;
  $('socialAutoStatus').textContent=!v.enabled?'自动分享已关闭，已有小报仍可手动撤回。':!navigator.onLine?'当前离线，联网并打开应用后会补发。':socialAutoError?'待重试：'+socialAutoError+'。下次联网打开会重试。':socialAutoWorking?'正在更新所选周期的小报…':'将按你保存的设置自动更新，新增好友不会自动加入。';
}
function renderAutoPreview(){
  $('socialAutoBudgetField').hidden=$('socialAutoMode').value!=='month';
  try{$('socialAutoPreview').innerHTML=reportCard(JianjiSocialReport.create(data.entries,data.budgets,$('socialAutoMode').value,JianjiReporting.iso(new Date()),{hideAmounts:$('socialAutoAmounts').checked,hideCategories:$('socialAutoCategories').checked,shareBudget:$('socialAutoMode').value==='month'&&$('socialAutoBudget').checked}));}
  catch(error){$('socialAutoPreview').textContent=error.message;}
}
function rememberSocialReport(reply,report,recipients){
  if(!reply.id||!socialState)return;
  const item={id:reply.id,owner:{id:socialState.user.id,nickname:socialState.user.nickname},own:true,created:reply.created||Math.floor(Date.now()/1000),report:reply.report||report,
    recipients:recipients.map(id=>({id,nickname:friendInfo(id)?.nickname||'好友'})),cheers:[]};
  socialState.reports=[item,...socialState.reports.filter(r=>r.id!==reply.id)].slice(0,100);renderSocial();
}
function renderMyPage(){
  const user=socialState?.user;
  $('myProfile').innerHTML=user?`<span class="my-avatar avatar-${user.avatar||'purple'}">${escapeHtml(user.nickname.slice(0,1))}</span><span><b>${escapeHtml(user.nickname)}</b><small>${escapeHtml(user.bio||'点击头像编辑资料')}</small><small class="my-account">账号 ${escapeHtml(user.username)}</small></span><i>›</i>`:`<span class="my-avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span><span><b>登录我的账号</b><small>加好友、聊生活、分享消费小报</small></span><i>›</i>`;
  $('myFriendCount').textContent=user?`${socialState.friends.length} 位好友 · ${socialState.incoming.length} 个待确认申请`:'添加朋友，一起记账';
  const unread=(socialState?.conversations||[]).reduce((sum,c)=>sum+c.unread,0);
  $('myUnread').hidden=!unread;$('myUnread').textContent=unread>99?'99+':String(unread);$('myNavDot').hidden=!unread;
  renderAutoSummary();renderMyBackup();resetExtraAccount();
  if(!socialSession){chatFriend=null;chatItems=[];chatDrafts.clear();chatQueue?.clear();chatQueue=null;socialSelectedFriend=null;socialAutoError='';++chatGeneration;$('socialChatInput').value='';}
}
async function loadMySocial(){
  renderMyPage();if(!$('appLockOverlay').hidden)return;
  if(myLoadPending)return myLoadPending;
  myLoadPending=(async()=>{
    try{
      if(!socialSession){const saved=await socialStorage('read');const value=JSON.parse(saved.value||'null');if(value?.token&&value.expires>Date.now()/1000)socialSession=value;else await socialStorage('clear');}
      if(socialSession){await refreshSocial(true);scheduleSocialAuto();scheduleExtras();}else renderSocial();
    }catch(error){socialStatus(error.message);renderSocial();}
  })();
  try{await myLoadPending;}finally{myLoadPending=null;}
}
function socialDisplay(view){
  if(chatFriend&&socialCurrentView==='chat')chatDrafts.set(chatFriend,$('socialChatInput').value);
  socialCurrentView=view;$('socialModal').querySelector('.modal').classList.toggle('chat-view',view==='chat');$('socialTitle').textContent=socialSession?socialViewNames[view]||'我的':'我的账号';
  $('socialShareView').hidden=true;$('socialCommunity').hidden=false;
  document.querySelectorAll('[data-social-panel]').forEach(panel=>panel.hidden=panel.dataset.socialPanel!==view);
  $('socialRefresh').hidden=['chat','auto','friend'].includes(view);
  if(socialState&&view==='account'){const u=socialState.user;$('socialAccountName').value=u.username;$('socialProfileNickname').value=u.nickname;$('socialBio').value=u.bio||'';$('socialAvatar').value=u.avatar||'purple';}
  if(socialState&&view==='auto')fillAutoForm();
  if(socialState&&view==='ranking')refreshChallenges().catch(e=>socialStatus(e.message));
  if(socialState&&view==='cloud')fillCloudPanel().catch(e=>socialStatus(e.message));
  if(view!=='chat')$('socialChatLatest').hidden=true;
  $('socialModal').querySelector('.modal').scrollTop=0;
}
function renderConversations(){
  $('socialConversations').innerHTML=(socialState?.conversations||[]).map(c=>`<button class="conversation-row" data-social-chat="${c.id}"><span class="social-avatar avatar-${friendAvatar(c.id)}">${escapeHtml(friendName(c.id,c.nickname).slice(0,1))}</span><span><b>${escapeHtml(friendName(c.id,c.nickname))}</b><small>${escapeHtml(c.last?.content||'还没有消息，打个招呼吧')}</small></span>${c.unread?`<em>${c.unread>99?'99+':c.unread}</em>`:'<i>›</i>'}</button>`).join('')||'<div class="empty">先在“我的好友”添加朋友，再聊聊生活。</div>';
}
async function openChat(friend){
  if(!socialState?.friends.some(f=>f.id===friend))return;
  if(chatFriend)chatDrafts.set(chatFriend,$('socialChatInput').value);
  chatFriend=friend;chatItems=[];chatMore=false;++chatGeneration;
  socialDisplay('chat');$('socialTitle').textContent=friendName(friend);ensureChatQueue();$('socialChatLatest').hidden=true;
  $('socialChatInput').value=chatDrafts.get(friend)||'';renderChat();await socialAction(()=>loadChat());
}
function ensureChatQueue(){
  const uid=socialState?.user.id;if(!uid)return null;
  if(!chatQueue||chatQueue.sender!==uid)chatQueue=new JianjiChatOutbox.Outbox(uid);return chatQueue;
}
function chatAtBottom(){const box=$('socialChatMessages');return box.scrollHeight-box.scrollTop-box.clientHeight<60;}
function pinChatBottom(){const box=$('socialChatMessages');box.scrollTop=box.scrollHeight;$('socialChatLatest').hidden=true;}
function renderChat(position='keep'){
  const box=$('socialChatMessages'),oldTop=box.scrollTop,oldHeight=box.scrollHeight;
  const pending=ensureChatQueue()?.list(chatFriend)||[],messages=[...chatItems,...pending];
  box.innerHTML=messages.map(m=>{
    const mine=m.sender===socialState?.user.id,status=m.status||'sent';
    const label=mine?`<span>${status==='failed'?'发送失败 · 点消息重试':status==='sending'?'发送中…':'已发送'}</span>`:'';
    const bubble=status==='failed'?`<button type="button" class="chat-bubble-retry" data-chat-retry="${m.client}" aria-label="重试发送这条消息">${escapeHtml(m.content)}</button>`:`<p>${escapeHtml(m.content)}</p>`;
    return `<article class="chat-message ${mine?'mine':'theirs'} ${status==='failed'?'failed':''}">${bubble}<small>${new Date(m.created*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'})}${label}</small></article>`;
  }).join('')||'<div class="empty">从一句问候开始。</div>';
  $('socialChatOlder').hidden=!chatMore;
  if(position===true||position==='bottom')pinChatBottom();else if(position==='prepend')box.scrollTop=oldTop+Math.max(0,box.scrollHeight-oldHeight);else box.scrollTop=oldTop;
}
async function loadChat(older=false){
  if(chatLoading||!chatFriend||socialCurrentView!=='chat')return;
  const friend=chatFriend,generation=chatGeneration;chatLoading=true;
  try{
    const before=older&&chatItems.length?'/before/'+chatItems[0].id:'';
    const value=await socialRequest('/v1/messages/'+friend+before);
    if(friend!==chatFriend||generation!==chatGeneration||!socialSession)return;
    const atBottom=chatAtBottom(),empty=!chatItems.length,ids=new Set(chatItems.map(m=>m.id));
    const changed=value.messages.some(m=>!ids.has(m.id)),queue=ensureChatQueue(),pendingBefore=queue.list(friend).length;
    queue.reconcile(value.messages);
    chatItems=[...new Map([...chatItems,...value.messages].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);
    if(older||empty)chatMore=value.hasMore;
    if(changed||empty||pendingBefore!==queue.list(friend).length)renderChat(older?'prepend':empty||atBottom?'bottom':'keep');
    if(changed&&!older&&!empty&&!atBottom)$('socialChatLatest').hidden=false;
    const c=socialState?.conversations.find(c=>c.id===friend);if(c)c.unread=0;renderMyPage();
  }finally{chatLoading=false;}
}
async function deliverChatRecord(client){
  const queue=ensureChatQueue(),record=queue?.records.get(client),token=socialSession?.token;if(!record)return;
  await socialAction(async()=>{
    record.status='sending';if(chatFriend===record.friend)renderChat('bottom');
    try{
      const message=await queue.deliver(client,async(friend,body)=>(await socialRequest('/v1/messages/'+friend,'POST',body)).message);
      if(queue!==chatQueue||socialSession?.token!==token)return;
      if(chatFriend===record.friend&&message){chatItems=[...new Map([...chatItems,message].map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);renderChat(chatPinBottom?'bottom':'keep');}
      socialStatus('消息已发送');try{await refreshSocial(true);}catch{ /* The individual message is already confirmed. */ }
    }catch(error){
      if(queue!==chatQueue)return;
      if(!queue.records.has(client)){socialStatus('消息已发送');return;}
      if(chatFriend===record.friend)renderChat(chatPinBottom?'bottom':'keep');socialStatus(error.message+'；可点消息重试');
    }
  });
}
async function sendChat(event){
  event.preventDefault();if(socialBusy||!$('appLockOverlay').hidden)return;
  if(!chatFriend)return socialStatus('请先选择好友');
  let record;try{record=ensureChatQueue().enqueue(chatFriend,$('socialChatInput').value);}catch(error){return socialStatus(error.message);}
  $('socialChatInput').value='';chatDrafts.delete(chatFriend);chatPinBottom=true;renderChat('bottom');await deliverChatRecord(record.client);
}
async function retryChatMessage(client){if(socialBusy||!$('appLockOverlay').hidden)return;chatPinBottom=true;await deliverChatRecord(client);}

function fillAutoForm(){
  const v=autoOptions();$('socialAutoEnabled').checked=v.enabled;$('socialAutoMode').value=v.mode;$('socialAutoAmounts').checked=v.hideAmounts;$('socialAutoCategories').checked=v.hideCategories;$('socialAutoBudget').checked=v.shareBudget;
  $('socialAutoBudgetField').hidden=v.mode!=='month';
  renderAutoSummary();
  $('socialAutoRecipients').innerHTML=socialState.friends.map(f=>`<label class="option-row"><span>${escapeHtml(friendName(f.id,f.nickname))}</span><input type="checkbox" value="${f.id}" ${v.recipients.includes(f.id)?'checked':''}></label>`).join('')||'<p class="import-help">还没有好友，先去添加朋友。</p>';
  renderAutoPreview();
}
function pruneAutoRecipients(){
  if(!socialState)return;const v=autoOptions(),ids=new Set(socialState.friends.map(f=>f.id)),active=v.recipients.filter(id=>ids.has(id));
  if(active.length!==v.recipients.length){++socialAutoGeneration;v.recipients=active;if(!active.length)v.enabled=false;v.published={};storeAuto(v);socialStatus('好友名单已变动，请检查自动分享接收人');}
}
function scheduleSocialAuto(delay=5000){
  clearTimeout(socialAutoTimer);if(!socialState||!socialSession||!autoOptions().enabled)return;
  socialAutoTimer=setTimeout(()=>runSocialAuto().catch(error=>{socialAutoError=error.message;renderAutoSummary();}),delay);
}
async function runSocialAuto(){
  if(socialAutoWorking||socialBusy||document.hidden||!$('appLockOverlay').hidden){if(socialState&&autoOptions().enabled)scheduleSocialAuto(10000);return;}
  if(!socialSession||!socialState)return;
  const v=autoOptions();if(!v.enabled||!v.recipients.length)return;
  if(!navigator.onLine){socialAutoError='当前离线';renderAutoSummary();throw new Error('当前离线');}
  const generation=socialAutoGeneration,token=socialSession.token,uid=socialState.user.id;
  const recipients=v.recipients.filter(id=>socialState.friends.some(f=>f.id===id));if(!recipients.length)return;
  const report=JianjiSocialReport.create(data.entries,data.budgets,v.mode,JianjiReporting.iso(new Date()),v);
  const slot=report.mode+':'+report.start;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({report,recipients}))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(v.published[slot]===hash){socialAutoError='';renderAutoSummary();return;}
  if(socialAutoWorking||generation!==socialAutoGeneration||socialSession?.token!==token||!autoOptions().enabled||!$('appLockOverlay').hidden)return;
  socialAutoWorking=true;socialAutoError='';renderAutoSummary();
  try{
    const reply=await socialRequest('/v1/reports','POST',{report,recipients});
    if(generation!==socialAutoGeneration||socialState?.user.id!==uid)return;
    rememberSocialReport(reply,report,recipients);
    const latest=autoOptions();latest.lastAt=Date.now();latest.lastMode=v.mode;latest.lastRecipients=recipients;latest.published[slot]=hash;latest.published=Object.fromEntries(Object.entries(latest.published).slice(-16));storeAuto(latest);
    try{await refreshSocial(true);}catch{ /* Upload succeeded; list refresh can wait. */ }
  }catch(error){socialAutoError=error.message;throw error;}finally{socialAutoWorking=false;renderAutoSummary();}
}
async function revokeSocialReport(id){
  const report=socialState?.reports.find(r=>r.id===id)?.report,v=autoOptions();
  const stop=v.enabled&&report?.mode===v.mode&&JianjiSocialReport.create([],{},v.mode,JianjiReporting.iso(new Date())).start===report.start;
  if(!confirm('撤回后好友将无法查看，已保存的截图无法收回。'+(stop?'这也会关闭本机自动分享，避免重新发布。':'')+'确认撤回？'))return socialStatus('已取消');
  if(stop){++socialAutoGeneration;clearTimeout(socialAutoTimer);v.enabled=false;storeAuto(v);}
  await socialRequest('/v1/reports/'+id,'DELETE');await refreshSocial(true);socialStatus(stop?'已撤回，并关闭本机自动分享':'已撤回分享');
}
function setupMySocial(){
  const paths=['<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>','<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>','<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5z"/>','<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>','<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>','<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v7m-4 1h8"/>'];
  document.querySelectorAll('.my-menu>button .my-menu-icon').forEach((e,i)=>e.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${({friends:paths[1],messages:paths[2],feed:paths[3],auto:paths[4],ranking:paths[5],cloud:'<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11H6Z"/><path d="m9 13 3-3 3 3m-3-3v10"/>'}[e.closest('[data-social-view]').dataset.socialView]||paths[0])}</svg>`);
  setupFriendDetails();$('myBackupOpen').onclick=()=>{$('openBackup').click();};
  $('myProfile').onclick=()=>openSocial('account');
  document.querySelectorAll('[data-social-view]').forEach(b=>b.onclick=()=>openSocial(b.dataset.socialView));
  $('socialProfileForm').onsubmit=e=>{e.preventDefault();socialAction(async()=>{await socialRequest('/v1/me','PATCH',{nickname:$('socialProfileNickname').value,bio:$('socialBio').value,avatar:$('socialAvatar').value});await refreshSocial();socialStatus('账号资料已保存');});};
  $('socialChatForm').onsubmit=sendChat;$('socialChatBack').onclick=()=>socialDisplay('messages');$('socialChatOlder').onclick=()=>socialAction(()=>loadChat(true));
  $('socialChatLatest').onclick=()=>{pinChatBottom();};$('socialChatMessages').onscroll=()=>{if(chatAtBottom())$('socialChatLatest').hidden=true;};
  $('socialChatInput').addEventListener('focus',()=>{chatPinBottom=true;requestAnimationFrame(pinChatBottom);});
  window.visualViewport?.addEventListener('resize',()=>{if(socialCurrentView==='chat'&&$('socialModal').classList.contains('show')&&chatPinBottom){requestAnimationFrame(()=>{pinChatBottom();$('socialChatInput').scrollIntoView({block:'nearest'});});}});
  $('socialChatMessages').addEventListener('touchstart',()=>{chatPinBottom=false;},{passive:true});
  $('socialAutoMode').onchange=()=>{$('socialAutoBudgetField').hidden=$('socialAutoMode').value!=='month';renderAutoPreview();};
  for(const id of ['socialAutoEnabled','socialAutoAmounts','socialAutoCategories','socialAutoBudget'])$(id).onchange=renderAutoPreview;
  $('socialAutoRecipients').onchange=renderAutoPreview;
  $('socialAutoForm').onsubmit=e=>{e.preventDefault();socialAction(async()=>{
    const v={enabled:$('socialAutoEnabled').checked,mode:$('socialAutoMode').value,hideAmounts:$('socialAutoAmounts').checked,hideCategories:$('socialAutoCategories').checked,shareBudget:$('socialAutoMode').value==='month'&&$('socialAutoBudget').checked,recipients:[...$('socialAutoRecipients').querySelectorAll('input:checked')].map(e=>e.value),published:{},lastAt:autoOptions().lastAt,lastMode:autoOptions().lastMode,lastRecipients:autoOptions().lastRecipients};
    if(v.enabled&&!v.recipients.length)throw new Error('请选择至少一位接收好友');
    ++socialAutoGeneration;clearTimeout(socialAutoTimer);storeAuto(v);socialAutoError='';renderMyPage();socialStatus(v.enabled?'已开启，按所选内容和好友自动更新当前周期':'已关闭自动分享，已有小报可手动撤回');scheduleSocialAuto(1000);
  });};
  window.addEventListener('offline',renderAutoSummary);
  window.addEventListener('online',()=>{loadMySocial();scheduleSocialAuto(1000);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadMySocial();scheduleSocialAuto(1000);}else ++chatGeneration;});
  setInterval(async()=>{
    if(document.hidden||!$('appLockOverlay').hidden||!socialSession||!socialState||socialBusy)return;
    try{if(socialCurrentView==='chat'&&$('socialModal').classList.contains('show'))await loadChat();if(activePage==='me'||$('socialModal').classList.contains('show'))await refreshSocial(true);scheduleSocialAuto(1000);}catch(error){if(activePage==='me')socialStatus(error.message);}
  },15000);
  setupExtras();
}
