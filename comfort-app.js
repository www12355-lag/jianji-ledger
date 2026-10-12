function formatDate(value,relative=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'';
 const [year,month,day]=value.split('-').map(Number),text=`${year}年${month}月${day}日`;
 return relative&&value===new Date().toLocaleDateString('en-CA')?`今天 · ${text}`:text;
}
function refreshDateLabels(){document.querySelectorAll('.date-control input').forEach(input=>{input.previousElementSibling.textContent=input.value?formatDate(input.value,true):'选择日期';});}
function setupChineseDates(){
 document.querySelectorAll('input[type=date]').forEach(input=>{
  const wrapper=document.createElement('span');wrapper.className='date-control';const text=document.createElement('span');text.className='date-display';text.setAttribute('aria-hidden','true');input.before(wrapper);wrapper.append(text,input);
  const property=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  Object.defineProperty(input,'value',{get(){return property.get.call(this);},set(value){property.set.call(this,value);text.textContent=this.value?formatDate(this.value,true):'选择日期';}});
  input.addEventListener('change',refreshDateLabels);input.addEventListener('input',refreshDateLabels);
 });
 document.addEventListener('reset',()=>queueMicrotask(refreshDateLabels));refreshDateLabels();
}
let entryDraft=null,lastDraftPhoto=undefined,draftBaseline=null,entryDraftId=null,draftErrorShown=false;
function entryDraftSnapshot(){return {version:1,entryId:entryDraftId,editingId,paymentDraftId,type:entryType,amount:$('entryAmount').value,date:$('entryDate').value,category:$('entryCategory').value,account:$('entryAccount').value,note:$('entryNote').value,merchant:$('entryMerchant').value,remember:$('rememberMerchant').checked,removePhoto:$('removeStoredPhoto').checked,projects:selectedProjectIds(),splitEnabled:$('splitEnabled').checked,splits:splitRows(),more:$('entryMore').open,hasPhoto:!!selectedImage};}
function beginEntryDraftTracking(){draftBaseline=JSON.stringify(entryDraftSnapshot());}
function renderDraftBanner(){
 $('homeDraft').hidden=!entryDraft;
 if(entryDraft)$('draftSummary').textContent=`${entryDraft.editingId?'编辑记录':'未保存的记账'}${entryDraft.amount?` · ${money(entryDraft.amount)}`:''}`;
}
async function loadEntryDraft(){
 try{entryDraft=await JianjiDraftStore.read();lastDraftPhoto=entryDraft?.photo||null;
 if(entryDraft && entryDraft.editingId===null && data.entries.some(entry=>String(entry.id)===String(entryDraft.entryId)))await discardEntryDraft();
 }catch{toast('草稿暂时无法读取，账本仍可使用');}renderDraftBanner();
}
function persistEntryDraft(){
 if(!$('entryModal').classList.contains('show'))return Promise.resolve();
 const snapshot=entryDraftSnapshot();
 if(JSON.stringify(snapshot)===draftBaseline||!JianjiDraftStore.meaningful(snapshot))return Promise.resolve();
 const updatePhoto=selectedImage!==lastDraftPhoto,photo=selectedImage;lastDraftPhoto=photo;
 entryDraft={...snapshot,photo};renderDraftBanner();
 return JianjiDraftStore.write(snapshot,photo,updatePhoto).then(()=>{draftErrorShown=false;}).catch(()=>{lastDraftPhoto=undefined;if(!draftErrorShown){toast('草稿保存失败，请检查存储空间');draftErrorShown=true;}});
}
async function discardEntryDraft(){await JianjiDraftStore.clear();entryDraft=null;lastDraftPhoto=null;renderDraftBanner();}
function resumeEntryDraft(){
 const draft=entryDraft;if(!draft)return openNewEntry(null,false);
 if(draft.editingId===null&&data.entries.some(entry=>String(entry.id)===String(draft.entryId))){discardEntryDraft().catch(()=>{});return openNewEntry(null,false);}
 const original=draft.editingId!==null?data.entries.find(entry=>String(entry.id)===draft.editingId&&!entry.deletedAt):null;
 if(draft.editingId!==null&&!original){discardEntryDraft().catch(()=>{});return toast('草稿对应的记录已删除，无法继续编辑');}
 openNewEntry(null,false);editingId=draft.editingId;entryDraftId=draft.entryId;paymentDraftId=draft.paymentDraftId;setType(draft.type);
 for(const [id,value] of Object.entries({entryAmount:draft.amount,entryDate:draft.date,entryCategory:cats.includes(draft.category)?draft.category:cats[0],entryAccount:data.accounts.some(a=>a.id===draft.account)?draft.account:'',entryNote:draft.note,entryMerchant:draft.merchant}))$(id).value=value||'';
 $('rememberMerchant').checked=draft.remember;$('removeStoredPhoto').checked=draft.removePhoto;$('removeStoredPhotoField').hidden=!original?.photoId;
 setSelectedProjects((draft.projects||[]).filter(id=>data.projects.some(project=>project.id===id)));$('splitEnabled').checked=draft.splitEnabled;renderSplitRows(draft.splits||[]);updateSplitUI();
 if(draft.photo)selectImage(draft.photo);$('entryMore').open=draft.more;$('entryModalTitle').textContent=draft.editingId?'继续编辑':'继续记账';renderEntryCategories();refreshDateLabels();draftBaseline=null;toast('已恢复上次草稿');
}
function setupComfort(){
 setupChineseDates();
 $('resumeDraft').onclick=resumeEntryDraft;$('discardDraft').onclick=()=>discardEntryDraft().then(()=>toast('草稿已清除')).catch(()=>toast('草稿清除失败'));
 const changed=()=>{persistEntryDraft();};
 $('entryForm').addEventListener('input',changed);$('entryForm').addEventListener('change',changed);
 $('entryForm').addEventListener('click',event=>{if(event.target.closest('button[type=button]'))changed();});
 document.querySelector('#entryModal .seg').addEventListener('click',changed);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)persistEntryDraft();});
 window.addEventListener('pagehide',persistEntryDraft);
 $('lockDelay').onchange=saveLockDelay;
 $('toggleDetailFilters').onclick=()=>{ $('advancedFilters').hidden=!$('advancedFilters').hidden;renderDetailFilterState(); };
 $('newSavingsGoal').onclick=()=>{resetSavingsForm();openSavingsEditor();};
 document.querySelectorAll('[data-back-savings]').forEach(button=>button.onclick=()=>{close('savingsEditorModal');close('savingsDepositModal');close('savingsDetailModal');openSavings();});
}
let appLockDelayMs=0;
function renderDetailFilterState(){
 const count=[detailFilter!=='all',$('recordCategory').value,$('recordSource').value,$('recordProject').value,$('allMonths').checked].filter(Boolean).length;
 $('toggleDetailFilters').textContent=count?`筛选 · ${count}`:'筛选';$('toggleDetailFilters').setAttribute('aria-expanded',String(!$('advancedFilters').hidden));
 $('clearFilters').hidden=!count&&!$('recordSearch').value.trim();
}
async function openLockSettings(){
 try{const status=await window.Capacitor.nativePromise('AppLock','status',{});appLockDelayMs=Number(status.delayMs)||0;appLockEnabled=Boolean(status.enabled);renderLockSettings();open('lockSettingsModal');}catch{toast('无法读取应用锁设置');}
}
function renderLockSettings(){$('lockDelay').value=String(appLockDelayMs);$('lockEnabledStatus').textContent=appLockEnabled?'已开启':'未开启';$('toggleAppLock').textContent=appLockEnabled?'关闭应用锁':'开启应用锁';}
async function saveLockDelay(){
 const delay=Number($('lockDelay').value);$('lockDelay').disabled=true;
 try{await window.Capacitor.nativePromise('AppLock','authenticate',{});await window.Capacitor.nativePromise('AppLock','setDelay',{delayMs:delay});appLockDelayMs=delay;toast('锁定时间已更新');}catch(error){toast(error.message||'锁定时间保存失败');}finally{$('lockDelay').disabled=false;renderLockSettings();}
}
function openSavingsEditor(){close('savingsModal');close('savingsDetailModal');$('savingsEditorTitle').textContent=editingSavingsId?'编辑目标':'新建储蓄目标';open('savingsEditorModal');}
let detailSavingsId=null;
function openSavingsDetail(id){detailSavingsId=id;close('savingsModal');renderSavingsDetail();open('savingsDetailModal');}
function renderSavingsDetail(){
 const goal=(data.savingsGoals||[]).find(goal=>goal.id===detailSavingsId);if(!goal)return;
 $('savingsDetailTitle').textContent=goal.name;
 $('savingsDetailContent').innerHTML=goalMarkup(goal,true);
}
if(typeof module!=='undefined')module.exports={formatDate};
