let extraAccount=null,cloudSecret='',cloudMeta=null,cloudPending=null,extraTimer=null,extraWorking=false;
function cloudKey(){return 'jianji-cloud-'+socialState?.user.id;}
function cloudOptions(){let v={};try{v=JSON.parse(localStorage.getItem(cloudKey())||'{}');}catch{}return {enabled:v.enabled===true,photos:v.photos!==false,version:Number(v.version)||0,lastAt:Number(v.lastAt)||0};}
function storeCloud(v){if(!socialState)throw new Error('请先登录');localStorage.setItem(cloudKey(),JSON.stringify(v));renderCloudSummary();}
function renderCloudSummary(){const v=cloudOptions();$('cloudMenuLabel').textContent=!socialState?'默认关闭，由你设置备份密码':(v.enabled?'每日自动备份已开启':'自动备份已关闭')+(v.lastAt?' · 上次 '+socialTime(v.lastAt):'');}
function resetExtraAccount(){const uid=socialState?.user.id||null;if(extraAccount!==uid){extraAccount=uid;cloudSecret='';cloudMeta=null;cloudPending=null;aaOnline=[];aaPaymentRetry.clear();challengeItems=[];challengeSeen.clear();challengeLoadedAt=0;$('challengeMenuLabel').textContent='自愿参加记账挑战';$('cloudPassword').value='';$('cloudRestorePreview').hidden=$('cloudConfirmRestore').hidden=true;}renderCloudSummary();}
async function cloudCredential(useInput=true){const input=useInput?$('cloudPassword').value:'';if(input){if(input.length<8||input.length>128)throw new Error('备份密码需 8 至 128 位');return input;}if(cloudSecret)return cloudSecret;
  if(onAndroid()){const token=socialSession?.token;const reply=await window.Capacitor.nativePromise('CloudSecret','read',{});if(token!==socialSession?.token)throw new Error('账号已变化，请重新打开');let v;try{v=JSON.parse(reply.value||'null');}catch{}if(v?.user===socialState?.user.id&&typeof v.password==='string')cloudSecret=v.password;}
  if(!cloudSecret)throw new Error('请填写备份密码');return cloudSecret;
}
async function rememberCloudPassword(password){const uid=socialState.user.id,token=socialSession.token;if(onAndroid())await window.Capacitor.nativePromise('CloudSecret','write',{value:JSON.stringify({user:uid,password})});if(token!==socialSession?.token)throw new Error('账号已变化');cloudSecret=password;$('cloudPassword').value='';}
async function fillCloudPanel(){resetExtraAccount();const token=socialSession?.token;if(!token)return;const meta=await socialRequest('/v1/cloud');if(token!==socialSession?.token)return;cloudMeta=meta;const v=cloudOptions();$('cloudPhotos').checked=v.photos;$('cloudEnabled').checked=v.enabled;
  $('cloudSummary').innerHTML=meta.present?`<b>云端有一份加密备份</b><p>${escapeHtml(socialTime(meta.created*1000))} · ${(meta.size/1024/1024).toFixed(2)} MB · 版本 ${meta.version}</p>`:'<b>还没有云端备份</b><p>先设置密码，再上传你的第一份备份。</p>';
  $('cloudStatus').textContent=v.enabled?'自动备份已开启；需要本机加密凭据、解锁并联网。':'自动备份关闭，可随时手动备份。';renderCloudSummary();
}
async function makeCloudBlob(password,photos){
  await pendingWrites;const snapshot=structuredClone(data),images=[];
  if(photos){for(const id of new Set(JianjiPossessions.photoRecords(snapshot).map(e=>e.photoId).filter(Boolean))){const blob=await photoStore('get',id);if(!blob)throw new Error('有账目或物品图片无法读取，请修复图片或选择不包含照片');images.push({id,mime:blob.type,base64:JianjiBackup.toBase64(new Uint8Array(await blob.arrayBuffer()))});}}
  else for(const {record,field} of JianjiPossessions.photoRefs(snapshot)){delete record[field];if(field==='photoId'&&record.cover==='photo')record.cover='icon';}
  const blob=await JianjiBackup.createBackup(snapshot,images,password);if(blob.length>20*1024*1024)throw new Error('备份超过 20 MB，请取消包含照片或使用本机备份');return blob;
}
async function uploadCloud(automatic=false){
  if(!socialSession||!socialState||document.hidden||!$('appLockOverlay').hidden||!navigator.onLine)return;
  const uid=socialState.user.id,token=socialSession.token,v=cloudOptions();if(automatic&&(!v.enabled||v.lastAt&&new Date(v.lastAt).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})===lifeToday()))return;
  const password=await cloudCredential(!automatic);let expected=v.version;
  if(!automatic){const meta=await socialRequest('/v1/cloud');if(token!==socialSession?.token)return;expected=meta.version;if(meta.present&&!confirm('云端只保留最新一份。确认用当前本机账本替换云端备份？'))return;}
  $('cloudStatus').textContent='正在本机加密，请稍候…';const blob=await makeCloudBlob(password,automatic?v.photos:$('cloudPhotos').checked);
  if(token!==socialSession?.token||uid!==socialState?.user.id||document.hidden||!$('appLockOverlay').hidden)throw new Error('操作已暂停，请解锁后重新备份');
  if(automatic&&!cloudOptions().enabled)return;
  const reply=await socialRequest('/v1/cloud','POST',{blob,expected});if(token!==socialSession?.token)return;
  const latest=cloudOptions();latest.version=reply.version;latest.lastAt=reply.created*1000;storeCloud(latest);cloudMeta=reply;$('cloudStatus').textContent='加密备份已保存到云端';if(!automatic){await rememberCloudPassword(password);await fillCloudPanel();$('cloudStatus').textContent='加密备份已完成';}
}
async function applyExtraRestore(restored){
  const written=[],ids=new Map();let committed=false;
  try{for(const [i,p] of restored.photos.entries()){const id='restore-'+lifeId()+'-'+i;await photoStore('put',id,new Blob([JianjiBackup.fromBase64(p.base64)],{type:p.mime}));written.push(id);ids.set(p.id,id);}
    const replacement=structuredClone(restored.data);replacement.lastBackupAt=new Date().toISOString();for(const {record,field} of JianjiPossessions.photoRefs(replacement)){if(!ids.has(record[field]))throw new Error('备份中缺少账目、物品或凭证关联的图片');record[field]=ids.get(record[field]);}
    await pendingWrites;await JianjiStore.write(replacement);committed=true;data=replacement;normalizeData();refreshCategoryUI();refreshAccountUI();refreshProjectUI();render();syncReminders().catch(()=>toast('账本已恢复，系统提醒未更新'));scheduleAutoBackup();
  }catch(e){if(!committed)for(const id of written)await photoStore('delete',id).catch(()=>{});else throw new Error('账本已恢复，请重新打开应用刷新页面');throw e;}
}
function scheduleExtras(delay=6000){clearTimeout(extraTimer);if(!socialSession||!socialState)return;extraTimer=setTimeout(async()=>{if(extraWorking||socialBusy||document.hidden||!$('appLockOverlay').hidden||!navigator.onLine)return;extraWorking=true;try{await checkChallengeDay();}catch{}try{if(cloudOptions().enabled)await uploadCloud(true);}catch(e){$('cloudStatus').textContent='自动备份未完成：'+e.message;}finally{extraWorking=false;}},delay);}
function setupExtras(){setupLife();setupChallenges();
  const cloudWork=work=>socialAction(async()=>{await work();});
  $('cloudSaveSettings').onclick=()=>cloudWork(async()=>{const token=socialSession?.token,password=$('cloudEnabled').checked?await cloudCredential():null;if(password)await rememberCloudPassword(password);if(token!==socialSession?.token)return;const v=cloudOptions(),meta=await socialRequest('/v1/cloud');if(token!==socialSession?.token)return;v.enabled=$('cloudEnabled').checked;v.photos=$('cloudPhotos').checked;v.version=meta.version;storeCloud(v);$('cloudStatus').textContent=v.enabled?'自动备份已开启，请保存好备份密码。':'自动备份已关闭';scheduleExtras(1000);});
  $('cloudUpload').onclick=()=>cloudWork(()=>uploadCloud(false));
  $('cloudVerifyRestore').onclick=()=>cloudWork(async()=>{cloudPending=null;$('cloudConfirmRestore').hidden=true;const token=socialSession.token,password=await cloudCredential(),reply=await socialRequest('/v1/cloud/content');const restored=await JianjiBackup.readBackup(reply.blob,password);if(token!==socialSession?.token)return;cloudPending={restored,token};$('cloudRestorePreview').textContent=`验证成功：${restored.data.entries.length} 笔账目、${restored.data.possessions?.length||0} 件物品、${restored.photos.length} 张图片。云端保存于 ${socialTime(reply.created*1000)}。确认后将替换本机完整账本，包括预算、计划、想买清单、本机分摊与归物本。建议先保存本机备份。`;$('cloudRestorePreview').hidden=$('cloudConfirmRestore').hidden=false;});
  $('cloudConfirmRestore').onclick=()=>cloudWork(async()=>{const pending=cloudPending;if(!pending||pending.token!==socialSession?.token)throw new Error('请重新验证备份');if(!confirm('确认替换当前本机完整账本？尚未备份的本机修改将被覆盖。'))return;await applyExtraRestore(pending.restored);cloudPending=null;$('cloudConfirmRestore').hidden=$('cloudRestorePreview').hidden=true;const v=cloudOptions();v.enabled=false;storeCloud(v);$('cloudEnabled').checked=false;$('cloudStatus').textContent='账本已恢复；自动云备份已暂停，请核对后重新开启。';toast('完整账本已恢复');});
  $('cloudPassword').oninput=()=>{cloudPending=null;$('cloudConfirmRestore').hidden=$('cloudRestorePreview').hidden=true;};
  $('cloudDelete').onclick=()=>cloudWork(async()=>{const token=socialSession.token,meta=await socialRequest('/v1/cloud');if(token!==socialSession?.token)return;if(!meta.present)throw new Error('云端没有备份');if(!confirm('删除云端加密备份并关闭自动备份？本机账本不会被删除。'))return;const reply=await socialRequest('/v1/cloud','DELETE',{expected:meta.version});if(token!==socialSession?.token)return;const v=cloudOptions();v.enabled=false;v.version=reply.version;v.lastAt=0;storeCloud(v);cloudPending=null;$('cloudConfirmRestore').hidden=$('cloudRestorePreview').hidden=true;await fillCloudPanel();$('cloudStatus').textContent='云端备份已删除，自动备份已关闭';});
  $('cloudLocalBackup').onclick=()=>$('openBackup').click();window.addEventListener('online',()=>scheduleExtras(1000));document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleExtras(1000);});
}
