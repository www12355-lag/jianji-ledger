let socialSelectedFriend=null;
function friendInfo(id){return socialState?.friends.find(f=>f.id===id);}
function friendName(id,fallback='好友'){const f=friendInfo(id);return f?.remark||f?.nickname||fallback;}
function friendAvatar(id){const color=friendInfo(id)?.avatar;return ['purple','mint','peach','blue'].includes(color)?color:'purple';}
function renderFriends(){
  const query=$('socialFriendSearch').value.trim().toLocaleLowerCase(),all=socialState?.friends||[];
  const friends=all.filter(f=>`${f.nickname} ${f.remark||''} ${f.username||''}`.toLocaleLowerCase().includes(query));
  $('socialFriends').innerHTML=friends.map(f=>`<div class="social-friend"><button class="friend-summary" type="button" data-social-friend="${f.id}"><span class="social-avatar avatar-${friendAvatar(f.id)}">${escapeHtml(friendName(f.id).slice(0,1))}</span><span><b>${escapeHtml(friendName(f.id))}</b><small>${escapeHtml(f.remark?'昵称 '+f.nickname:'账号 '+(f.username||'未显示'))}</small></span><i>›</i></button><button type="button" data-social-chat="${f.id}">聊天</button></div>`).join('')||`<div class="empty">${query?'没有匹配的好友，换个关键词试试。':'把邀请码发给朋友，确认后一起记账。'}</div>`;
}
function renderFriendProfile(){
  const f=friendInfo(socialSelectedFriend);if(!f)return;
  $('socialFriendProfile').innerHTML=`<span class="my-avatar avatar-${friendAvatar(f.id)}">${escapeHtml(friendName(f.id).slice(0,1))}</span><h3>${escapeHtml(friendName(f.id))}</h3><dl><div><dt>昵称</dt><dd>${escapeHtml(f.nickname)}</dd></div><div><dt>账号</dt><dd>${escapeHtml(f.username||'未显示')}</dd></div></dl>`;
}
async function openFriendProfile(id){
  if(!friendInfo(id))return;
  await socialAction(async()=>{
    const result=await socialRequest('/v1/friends/'+id);
    const existing=friendInfo(id);if(!existing)return;Object.assign(existing,result.friend);socialSelectedFriend=id;
    socialDisplay('friend');renderFriendProfile();$('socialFriendRemark').value=result.friend.remark||'';
    $('socialFriendMoreActions').hidden=true;$('socialFriendMore').setAttribute('aria-expanded','false');socialStatus('');
  });
}
async function removeSocialFriend(id){
  if(!friendInfo(id))return;
  if(!confirm('删除后双方无法再查看已分享的小报，也不能继续聊天。好友备注会清除。确认删除？'))return socialStatus('已取消');
  await socialRequest('/v1/friends/'+id,'DELETE');
  if(chatFriend===id){chatFriend=null;chatItems=[];chatQueue?.clear();++chatGeneration;$('socialChatMessages').replaceChildren();}
  await refreshSocial(true);socialSelectedFriend=null;socialDisplay('friends');socialStatus('好友已删除');
}
function setupFriendDetails(){
  $('socialFriendSearch').oninput=renderFriends;
  $('socialFriendBack').onclick=()=>socialDisplay('friends');
  $('socialFriendMore').onclick=()=>{const show=$('socialFriendMoreActions').hidden;$('socialFriendMoreActions').hidden=!show;$('socialFriendMore').setAttribute('aria-expanded',String(show));};
  $('socialFriendDelete').onclick=()=>socialAction(()=>removeSocialFriend(socialSelectedFriend));
  $('socialFriendChat').onclick=()=>openChat(socialSelectedFriend);
  $('socialFriendRemarkForm').onsubmit=event=>{event.preventDefault();socialAction(async()=>{
    const id=socialSelectedFriend,result=await socialRequest('/v1/friends/'+id,'PATCH',{remark:$('socialFriendRemark').value.trim()});
    const f=friendInfo(id);if(!f)throw new Error('好友关系已变动，请刷新');Object.assign(f,result.friend);renderSocial();renderFriendProfile();socialStatus('备注已保存，仅你可见');
  });};
}
