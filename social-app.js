const SOCIAL_ENDPOINT='https://47.94.4.152';
let socialSession=null,socialState=null,socialBusy=false,socialLoad=0,socialAuthMode='login';
const socialLabels={day:'日报',week:'周报',month:'月报'};
async function socialStorage(action,value){
  if(onAndroid())return window.Capacitor.nativePromise('SocialSession',action,value?{value:JSON.stringify(value)}:{});
  if(action==='read')return {value:sessionStorage.getItem('jianji-social-session')||''};
  if(action==='write')sessionStorage.setItem('jianji-social-session',JSON.stringify(value));
  if(action==='clear')sessionStorage.removeItem('jianji-social-session');
  return {};
}
async function socialRequest(path,method='GET',body){
  const requestToken=socialSession?.token;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),path.startsWith('/v1/cloud')?120000:15000);
  try{
    const response=await fetch(SOCIAL_ENDPOINT+path,{method,signal:controller.signal,cache:'no-store',
      headers:{'Content-Type':'application/json',...(socialSession?{Authorization:'Bearer '+socialSession.token}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json().catch(()=>({error:response.status===429?'操作较频繁，请稍后再试':'好友服务暂时不可用，请稍后重试'}));
    if(!response.ok){
      if(response.status===401&&socialSession?.token===requestToken&&requestToken){socialSession=null;socialState=null;await socialStorage('clear');renderSocial();}
      throw new Error(value.error||'服务暂时不可用');
    }
    return value;
  }catch(error){
    if(error.name==='AbortError')throw new Error('连接超时，请检查网络后重试');
    if(error instanceof TypeError)throw new Error('无法连接好友服务，请检查网络；本地记账仍可使用');
    throw error;
  }finally{clearTimeout(timer);}
}
function socialStatus(message){$('socialStatus').textContent=message;$('myStatus').textContent=message;}
function setSocialBusy(value){socialBusy=value;$('socialModal').querySelectorAll('button:not([data-close]),input,select').forEach(e=>e.disabled=value);if(!value){$('socialShareOpen').disabled=!socialState?.friends.length;$('socialAccountName').disabled=true;}}
async function socialAction(work){
  if(socialBusy||!$('appLockOverlay').hidden)return;
  setSocialBusy(true);socialStatus('正在处理…');
  try{await work();}catch(error){socialStatus(error.message||'操作未完成，请重试');}
  finally{setSocialBusy(false);}
}
async function openSocial(view='feed'){
  socialCurrentView=view;open('socialModal');socialStatus('');await loadMySocial();renderSocial();socialDisplay(view);
}
async function refreshSocial(silent=false){
  const generation=++socialLoad, token=socialSession?.token;if(!token)return;
  const [me,friends,requests,reports,conversations]=await Promise.all([
    socialRequest('/v1/me'),socialRequest('/v1/friends'),socialRequest('/v1/requests'),socialRequest('/v1/reports'),socialRequest('/v1/conversations')]);
  if(generation!==socialLoad||socialSession?.token!==token)return;
  socialState={...me,...friends,...requests,...reports,...conversations};pruneAutoRecipients();renderSocial();if(!silent)socialStatus('已更新');
}
function socialAuthModeSet(mode){
  socialAuthMode=mode;
  document.querySelectorAll('[data-social-auth]').forEach(b=>{b.classList.toggle('active',b.dataset.socialAuth===mode);b.setAttribute('aria-pressed',String(b.dataset.socialAuth===mode));});
  for(const [id,shown] of [['socialNicknameField',mode==='register'],['socialEnrollmentField',mode==='register'],['socialRecoveryField',mode==='recover']]){
    $(id).hidden=!shown;$(id).querySelector('input').required=shown;
  }
  $('socialPassword').autocomplete=mode==='login'?'current-password':'new-password';
  $('socialPasswordLabel').textContent=mode==='recover'?'新密码':'密码';
  $('socialAuthSubmit').textContent={login:'登录我的账号',register:'创建内测账号',recover:'使用恢复码重设密码'}[mode];
  $('socialAuthHelp').textContent=mode==='register'?'注册口令由简记管理员提供。昵称会显示给好友；账本仍保存在本机。':mode==='recover'?'使用注册时保存的恢复码。重设后，其他设备登录会失效。':'账号仅用于好友圈；登录不会上传或替换你的本地账本。';
}
async function socialAuthenticate(event){
  event.preventDefault();await socialAction(async()=>{
    const result=await socialRequest('/v1/auth/'+socialAuthMode,'POST',{
      username:$('socialUsername').value.trim(),password:$('socialPassword').value,nickname:$('socialNickname').value.trim(),
      enrollment:$('socialEnrollment').value.trim(),recoveryCode:$('socialRecovery').value.trim()});
    socialSession={token:result.token,expires:result.expires};
    try{await socialStorage('write',socialSession);}catch{toast('已登录，但无法保存登录状态，下次需重新登录');}
    $('socialAuthForm').reset();renderSocial();
    socialDisplay(socialCurrentView);
    if(result.recoveryCode){$('socialRecoveryCode').textContent=result.recoveryCode;$('socialRecoveryNotice').hidden=false;}
    await refreshSocial();socialDisplay(socialCurrentView);scheduleSocialAuto();
  });
}
function reportCard(report){
  const values=report.hideAmounts?['•••','•••','•••']:[report.income,report.net,report.balance].map(money);
  return `<div class="social-period"><b>${socialLabels[report.mode]}</b><span>${escapeHtml(report.start)}${report.mode==='day'?'':' 至 '+escapeHtml(report.end)}</span></div>
    ${report.through<report.end?`<p class="import-help">截至 ${escapeHtml(report.through)}</p>`:''}
    <div class="social-numbers">${['收入','净支出','收支结余'].map((label,i)=>`<div><small>${label}</small><b>${values[i]}</b></div>`).join('')}</div>
    <p class="social-habit">${report.count} 笔收支 · ${report.recordedDays} 天有记录${report.hideAmounts?' · 金额已隐藏':''}</p>
    <div class="social-categories">${report.categories.slice(0,3).map(c=>`<div><span>${escapeHtml(c.name)}</span><div class="track"><i style="width:${Math.max(0,Math.min(100,c.percent))}%"></i></div><b>${c.percent}%</b></div>`).join('')||'<p class="import-help">暂无正净支出的分类</p>'}</div>
    ${report.budget?`<p class="social-budget ${report.budget.percent>=100?'over':''}">本月设有预算的分类，合计已用 ${report.budget.percent}%${report.budget.percent>=100?' · 一起留意后续开销':''}</p>`:''}`;
}
function renderSocial(){
  renderMyPage();$('socialAuthView').hidden=!!socialSession;$('socialHub').hidden=!socialSession;
  if(!socialSession){for(const id of ['socialMe','socialFriends','socialRequests','socialFeed','socialShareRecipients','socialConversations','socialChatMessages','socialFriendProfile'])$(id).replaceChildren();$('socialShareView').hidden=true;$('socialCommunity').hidden=false;$('socialRecoveryNotice').hidden=true;$('socialRecoveryCode').textContent='';return;}
  if(!socialState)return;
  const s=socialState;
  $('socialMe').innerHTML=`<span class="social-avatar avatar-${s.user.avatar||'purple'}">${escapeHtml(s.user.nickname.slice(0,1))}</span><div><b>${escapeHtml(s.user.nickname)}</b><small>账号 ${escapeHtml(s.user.username)}</small></div>`;
  $('socialInviteCode').textContent=s.user.inviteCode;
  $('socialRequests').innerHTML=[...s.incoming.map(r=>`<article class="social-request"><b>${escapeHtml(r.nickname)}</b><small>希望和你成为好友</small><div><button data-social-accept="${r.id}">接受</button><button data-social-reject="${r.id}">拒绝</button></div></article>`),...s.outgoing.map(r=>`<article class="social-request"><b>${escapeHtml(r.nickname)}</b><small>等待对方确认</small><button data-social-reject="${r.id}">取消申请</button></article>`)].join('')||'<p class="import-help">暂无好友申请</p>';
  renderFriends();
  $('socialShareOpen').disabled=!s.friends.length;
  $('socialFeed').innerHTML=s.reports.map(item=>`<article class="social-report"><header><b>${escapeHtml(item.own?item.owner.nickname:friendName(item.owner.id,item.owner.nickname))}${item.own?' · 我分享的':''}</b><small>${new Date(item.created*1000).toLocaleDateString('zh-CN')}</small></header>${reportCard(item.report)}
    ${item.own?`<p class="import-help">分享给 ${item.recipients.map(r=>escapeHtml(r.nickname)).join('、')||'暂无好友（查看权限已撤销）'}</p><div class="social-cheers">${item.cheers.map(c=>`<small>${escapeHtml(c.nickname)}：${escapeHtml(c.kind)}</small>`).join('')}</div><button class="quiet-button" data-social-revoke="${item.id}">撤回这份分享</button>`:
      `<div class="social-cheer-buttons">${['为你加油','继续坚持记账','一起稳住预算'].map(kind=>`<button class="${item.cheers.some(c=>c.kind===kind)?'active':''}" data-social-cheer="${item.id}" data-kind="${kind}">${kind}</button>`).join('')}</div>`}</article>`).join('')||'<div class="empty">这里还没有分享。记录生活，再分享一份自己的消费小报。</div>';
  $('socialFeedHelp').textContent='最近 100 份分享 · 仅反映已记账收支，收支结余不等于账户余额。';
  renderConversations();
  if(socialCurrentView==='friend'&&socialSelectedFriend){if(friendInfo(socialSelectedFriend))renderFriendProfile();else{socialSelectedFriend=null;socialDisplay('friends');}}
}
function openSocialShare(){
  if(!socialState?.friends.length)return;
  $('socialTitle').textContent='分享消费小报';$('socialShareView').hidden=false;$('socialCommunity').hidden=true;
  const today=JianjiReporting.iso(new Date());$('socialAnchor').max=today;$('socialAnchor').value=today;
  $('socialMode').value='week';$('socialHideAmounts').checked=true;$('socialHideCategories').checked=true;$('socialShareBudget').checked=false;
  $('socialShareRecipients').innerHTML=socialState.friends.map(f=>`<label class="option-row"><span>${escapeHtml(friendName(f.id,f.nickname))}</span><input type="checkbox" value="${f.id}"></label>`).join('');
  renderSocialPreview();
}
function socialPreview(){return JianjiSocialReport.create(data.entries,data.budgets,$('socialMode').value,$('socialAnchor').value,
  {hideAmounts:$('socialHideAmounts').checked,hideCategories:$('socialHideCategories').checked,shareBudget:$('socialShareBudget').checked});}
function renderSocialPreview(){
  $('socialBudgetField').hidden=$('socialMode').value!=='month';
  try{$('socialPreview').innerHTML=reportCard(socialPreview());}catch(error){$('socialPreview').textContent=error.message;}
}
function setupSocial(){
  setupMySocial();
  socialAuthModeSet('login');
  document.querySelectorAll('[data-social-auth]').forEach(b=>b.onclick=()=>socialAuthModeSet(b.dataset.socialAuth));
  $('socialAuthForm').onsubmit=socialAuthenticate;
  $('socialRefresh').onclick=()=>socialAction(socialCurrentView==='ranking'?refreshChallenges:socialCurrentView==='cloud'?fillCloudPanel:refreshSocial);
  $('socialLogout').onclick=()=>socialAction(async()=>{
    try{await socialRequest('/v1/auth/logout','POST',{});}catch{ /* Local logout works even when offline. */ }
    ++socialLoad;clearTimeout(socialAutoTimer);++socialAutoGeneration;socialSession=null;socialState=null;await socialStorage('clear');$('socialRecoveryNotice').hidden=true;$('socialRecoveryCode').textContent='';renderSocial();socialStatus('已退出好友圈，本地账本保留在本机');
  });
  $('socialRecoveryDone').onclick=()=>{$('socialRecoveryNotice').hidden=true;$('socialRecoveryCode').textContent='';};
  $('socialCopyInvite').onclick=()=>socialAction(async()=>{await navigator.clipboard.writeText(socialState.user.inviteCode);socialStatus('邀请码已复制，由你发送给朋友');});
  $('socialRotateInvite').onclick=()=>socialAction(async()=>{if(!confirm('更换后旧邀请码立即失效，已有好友不受影响。确认更换？'))return socialStatus('已取消');await socialRequest('/v1/invite/rotate','POST',{});await refreshSocial();socialStatus('邀请码已更换');});
  $('socialAddForm').onsubmit=event=>{event.preventDefault();socialAction(async()=>{await socialRequest('/v1/requests','POST',{code:$('socialFriendCode').value.trim()});$('socialFriendCode').value='';await refreshSocial();socialStatus('好友申请已发送，等待对方确认');});};
  $('socialShareOpen').onclick=openSocialShare;
  $('socialShareBack').onclick=()=>socialDisplay('feed');
  for(const id of ['socialMode','socialAnchor','socialHideAmounts','socialHideCategories','socialShareBudget'])$(id).oninput=renderSocialPreview;
  $('socialPublish').onclick=()=>socialAction(async()=>{
    const recipients=[...$('socialShareRecipients').querySelectorAll('input:checked')].map(e=>e.value);
    if(!recipients.length)throw new Error('请至少选择一位好友');
    const report=socialPreview();
    const reply=await socialRequest('/v1/reports','POST',{report,recipients});rememberSocialReport(reply,report,recipients);
    socialDisplay('feed');await refreshSocial();socialStatus('已分享；同一周期再次分享会替换内容和接收好友');
  });
  $('socialHub').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.chatRetry)return retryChatMessage(b.dataset.chatRetry);
    if(b.dataset.socialFriend)return openFriendProfile(b.dataset.socialFriend);
    if(b.dataset.socialChat)return openChat(b.dataset.socialChat);
    if(b.id==='socialRename')return socialAction(async()=>{const nickname=prompt('设置好友看到的昵称（1 至 24 字）',socialState.user.nickname);if(nickname===null)return socialStatus('已取消');await socialRequest('/v1/me','PATCH',{nickname});await refreshSocial();});
    if(b.dataset.socialAccept)return socialAction(async()=>{await socialRequest('/v1/requests/'+b.dataset.socialAccept,'POST',{});await refreshSocial();});
    if(b.dataset.socialReject)return socialAction(async()=>{await socialRequest('/v1/requests/'+b.dataset.socialReject,'DELETE');await refreshSocial();});
    if(b.dataset.socialRevoke)return socialAction(()=>revokeSocialReport(b.dataset.socialRevoke));
    if(b.dataset.socialCheer)return socialAction(async()=>{const item=socialState.reports.find(r=>r.id===b.dataset.socialCheer);const selected=item?.cheers.some(c=>c.kind===b.dataset.kind);await socialRequest('/v1/reports/'+b.dataset.socialCheer+'/cheer','POST',{kind:selected?'':b.dataset.kind});await refreshSocial();});
  });
}
