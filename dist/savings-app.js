const toolIconPaths = {
 more:'M5 12h.01 M12 12h.01 M19 12h.01',
 budget:'M3 5h18v14H3z M7 9h4 M7 13h2 M15 9v6 M13 11h4',
 cash:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 17h2',
 annual:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 15l2 2 5-4',
 subscriptions:'M20 8a8 8 0 0 0-14-2L3 9 M3 4v5h5 M4 16a8 8 0 0 0 14 2l3-3 M21 20v-5h-5',
 savings:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
 recurring:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5H8',
 projects:'M3 7h7l2 2h9v11H3z M3 7V4h6l3 3',
 loans:'M3 8h17 M16 4l4 4-4 4 M21 16H4 M8 12l-4 4 4 4',
 payment:'M6 17h12l-2-3V9a4 4 0 0 0-8 0v5z M10 20h4',
 missing:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 16h.01',
 accounts:'M3 6h18v14H3z M3 6V4h14 M16 11h5v4h-5z',
 categories:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 rules:'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4',
 history:'M3 10a9 9 0 1 1 2 8 M3 4v6h6 M12 7v5l3 2',
 backup:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 lock:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
 camera:'M3 7h5l2-3h4l2 3h5v13H3z M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
 image:'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01'
};
function uiIcon(name) { return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${toolIconPaths[name] || toolIconPaths.categories}"/></svg>`; }
function renderEntryCategories() {
 $('entryCategoryChoices').innerHTML=preferredCategories().map(category=>`<button type="button" data-entry-category="${escapeHtml(category)}" class="${$('entryCategory').value===category?'selected':''}" aria-pressed="${$('entryCategory').value===category}">${iconMarkup(category)}<span>${escapeHtml(category)}</span></button>`).join('');
}
let editingSavingsId=null;
function setupSavings() {
 $('entryCategoryChoices').onclick=event=>{ const button=event.target.closest('[data-entry-category]'); if(button){$('entryCategory').value=button.dataset.entryCategory;renderEntryCategories();} };
 $('entryCategory').onchange=renderEntryCategories;
 $('cameraButton').innerHTML=uiIcon('camera')+'拍照'; $('imageButton').innerHTML=uiIcon('image')+'图片或截图';
 $('homeFeatures').firstElementChild.innerHTML=uiIcon('categories');
 $('savingsForm').onsubmit=saveSavingsGoal;
 $('cancelSavingsEdit').onclick=resetSavingsForm;
 $('savingsList').onclick=handleSavings;
 $('savingsDepositForm').onsubmit=saveSavingsDeposit;
 $('homeSavings').onclick=openSavings;
}
function resetSavingsForm(){ editingSavingsId=null;$('savingsForm').reset();$('saveSavingsGoal').textContent='创建目标';$('cancelSavingsEdit').hidden=true; }
function openSavings(){renderSavings();resetSavingsForm();open('savingsModal');}
function renderSavings() {
 const goals=data.savingsGoals||[], total=goals.reduce((sum,goal)=>sum+JianjiSavings.progress(goal).saved,0);
 $('savingsSummary').innerHTML=`<small>为想要的生活，慢慢积攒</small><b>${money(total)}</b><small>${goals.length} 个目标 · ${goals.filter(goal=>JianjiSavings.progress(goal).complete).length} 个已完成</small>`;
 $('savingsList').innerHTML=goals.map(goal=>{
  const p=JianjiSavings.progress(goal);
  return `<article class="goal-card"><div class="goal-head"><b>${escapeHtml(goal.name)}</b><span class="goal-badge">${p.complete?'已达成':p.overdue?'已过目标日期':`${Math.floor(p.percent)}%`}</span></div><div class="track"><div class="fill" style="width:${p.percent}%"></div></div><div class="goal-numbers"><b>${money(p.saved)}</b><span>目标 ${money(goal.target)}</span></div><p>${p.complete?'目标已达成，可以继续积攒。':`还差 ${money(p.remaining)}${goal.deadline?` · 目标日期 ${escapeHtml(goal.deadline)}`:''}${p.overdue?'，可调整目标日期。':p.monthly!==null?`<br>含本月，平均每月还需 ${money(p.monthly)}`:''}`}</p><div class="goal-actions"><button data-goal-deposit="${escapeHtml(goal.id)}">存入一笔</button><button data-goal-edit="${escapeHtml(goal.id)}">编辑</button><button data-goal-delete="${escapeHtml(goal.id)}">删除</button></div><details class="goal-history"><summary>存入记录（${goal.contributions.length}）</summary><ul>${goal.contributions.slice().reverse().map(item=>`<li><span>${escapeHtml(item.date)} · ${money(item.amount)}${item.note?` · ${escapeHtml(item.note)}`:''}</span><button data-goal-undo="${escapeHtml(goal.id)}" data-contribution="${escapeHtml(item.id)}">撤销</button></li>`).join('')||'<li>还没有存入记录</li>'}</ul></details></article>`;
 }).join('')||'<div class="empty">第一笔储蓄，从一个小目标开始</div>';
 $('homeSavings').hidden=!goals.length;
 if(goals.length){const goal=goals.find(g=>!JianjiSavings.progress(g).complete)||goals[0], p=JianjiSavings.progress(goal);$('homeSavings').innerHTML=uiIcon('savings')+`<span><b>${escapeHtml(goal.name)}</b><small>已存 ${money(p.saved)} / ${money(goal.target)} · ${Math.floor(p.percent)}%</small></span><span aria-hidden="true">›</span>`;}
}
async function mutateSavings(change){const before=structuredClone(data.savingsGoals);change();try{await save();}catch{data.savingsGoals=before;toast('储蓄保存失败，请重试');return false;}renderSavings();return true;}
async function saveSavingsGoal(event){
 event.preventDefault();const name=$('savingsName').value.trim(), target=Number($('savingsTarget').value), deadline=$('savingsDeadline').value;
 if(!name||!Number.isFinite(target)||target<=0)return toast('请填写名称和有效目标金额');
 const existing=data.savingsGoals.find(g=>g.id===editingSavingsId);
 if(!existing&&data.savingsGoals.length>=100)return toast('最多创建 100 个目标');
 const goal={id:existing?.id||crypto.randomUUID(),name,target,deadline,contributions:existing?.contributions||[]};
 if(await mutateSavings(()=>{if(existing)data.savingsGoals[data.savingsGoals.indexOf(existing)]=goal;else data.savingsGoals.push(goal);})){resetSavingsForm();toast('目标已保存');}
}
let depositSavingsId=null;
function handleSavings(event){
 const button=event.target.closest('button');if(!button)return;
 const id=button.dataset.goalDeposit||button.dataset.goalEdit||button.dataset.goalDelete||button.dataset.goalUndo, goal=data.savingsGoals.find(g=>g.id===id);if(!goal)return;
 if(button.dataset.goalEdit){editingSavingsId=id;$('savingsName').value=goal.name;$('savingsTarget').value=goal.target;$('savingsDeadline').value=goal.deadline;$('saveSavingsGoal').textContent='保存修改';$('cancelSavingsEdit').hidden=false;$('savingsForm').scrollIntoView({block:'start',behavior:'smooth'});return;}
 if(button.dataset.goalDeposit){depositSavingsId=id;$('savingsDepositForm').reset();$('savingsDepositTitle').textContent='存入 · '+goal.name;$('savingsDepositDate').value=new Date().toLocaleDateString('en-CA');close('savingsModal');open('savingsDepositModal');return;}
 if(button.dataset.goalDelete){if(!confirm('删除这个目标及其存入记录？账本收支不会改变。'))return;mutateSavings(()=>{data.savingsGoals=data.savingsGoals.filter(g=>g.id!==id);}).then(ok=>{if(ok){resetSavingsForm();toast('目标已删除');}});return;}
 if(button.dataset.goalUndo){if(!confirm('撤销这笔存入记录？'))return;mutateSavings(()=>{goal.contributions=goal.contributions.filter(c=>c.id!==button.dataset.contribution);}).then(ok=>{if(ok)toast('存入已撤销');});}
}
async function saveSavingsDeposit(event){
 event.preventDefault();const goal=data.savingsGoals.find(g=>g.id===depositSavingsId),amount=Number($('savingsDepositAmount').value),date=$('savingsDepositDate').value;
 if(!goal||!Number.isFinite(amount)||amount<=0||!date)return toast('请填写有效金额和日期');
 if(goal.contributions.length>=10000)return toast('此目标存入记录已达到上限');
 if(await mutateSavings(()=>goal.contributions.push({id:crypto.randomUUID(),amount,date,note:$('savingsDepositNote').value.trim()}))){close('savingsDepositModal');open('savingsModal');toast('已记录存入');}
}
