function featureTools() {
  return [
    ['plan','budget','¥','分类预算','设置每类支出的月度上限，查看剩余额度。','budgetCard'],
    ['plan','cash','▦','现金流日历','按计划预测未来 30 天每天的账户余额。','cashFlowCard'],
    ['plan','annual','◷','年度计划','为保险、年费或旅行提前预留费用。','annualCard'],
    ['plan','subscriptions','↻','订阅管理','集中查看会员和软件订阅、月度费用与扣费日期。','', 'subscriptions'],
    ['daily','recurring','◷','周期账目','房租等固定收支到期后，由你确认入账。','planningCard'],
    ['daily','projects','◇','项目花销','将旅行、装修等不同类别的花销汇总到一起。','projectCard'],
    ['daily','loans','↔','借出与待收款','查看借给谁、剩余待收款和分次还款记录。','receivableCard'],
    ['daily','payment','✓','支付通知','确认微信或支付宝通知识别出的付款信息。','paymentCard'],
    ['daily','missing','?','漏记检查','根据最近记账日期提醒检查是否漏记。','missingCheckCard'],
    ['manage','accounts','▣','账户与对账','设置账户并核对账面余额与实际余额。','', 'manageAccounts'],
    ['manage','categories','◇','分类管理','添加、改名或整理支出分类。','', 'manageCategories'],
    ['manage','rules','≡','商户分类','为常见商户设置类别建议。','', 'manageImportRules'],
    ['manage','history','↶','修改历史','查看最近的账目变更并撤销操作。','', 'openHistory'],
    ['manage','backup','⇧','备份与恢复','加密保存账本，换设备时恢复。','', 'openBackup'],
    ['manage','trash','⌫','最近删除','恢复误删账目或永久删除。','', 'openTrash'],
    ['manage','lock','▣','应用锁','使用系统验证保护打开账本的入口。','', 'appLockSetting']
  ].filter(tool => onAndroid() || !['payment','lock'].includes(tool[1]));
}
function setupFeatureMenu() {
  for (const id of ['budgetCard','cashFlowCard','annualCard','budgetAlertCard','planningCard','projectCard','receivableCard','paymentCard','missingCheckCard','settingsCard']) $('featureStorage').append($(id));
  for (const [group, panel] of [['plan','featurePlan'],['daily','featureDaily'],['manage','featureManage']]) {
    const grid = document.createElement('div'); grid.className = 'tool-grid';
    grid.innerHTML = featureTools().filter(tool => tool[0] === group).map(tool => `<button type="button" data-tool="${tool[1]}"><span aria-hidden="true">${tool[2]}</span><b>${tool[3]}</b></button>`).join('');
    grid.onclick = event => { const button = event.target.closest('[data-tool]'); if (button) openTool(button.dataset.tool); };
    $(panel).append(grid);
  }
  document.querySelectorAll('[data-feature-group]').forEach(button => button.onclick = () => showFeatureGroup(button.dataset.featureGroup));
  $('clearFilters').onclick = () => {
    for (const id of ['recordSearch','recordCategory','recordSource','recordProject']) $(id).value = '';
    $('allMonths').checked = false; detailFilter = 'all';
    document.querySelectorAll('[data-filter]').forEach(button => { const selected = button.dataset.filter === 'all'; button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected)); });
    render();
  };
  $('homeTodo').onclick = () => { renderTodo(); open('todoModal'); };
  $('todoList').onclick = event => { const button = event.target.closest('[data-todo-tool]'); if (button) { close('todoModal'); openTool(button.dataset.todoTool); } };
  $('subscriptionForm').onsubmit = saveSubscription;
  $('subscriptionList').onclick = handleSubscription;
  $('cancelSubscriptionEdit').onclick = resetSubscriptionForm;
  $('subscriptionLink').onchange = () => {
    const rule = data.recurring.find(item => item.id === $('subscriptionLink').value);
    if (rule) fillSubscriptionForm(rule); else resetSubscriptionForm();
  };
}
function showFeatureGroup(group) {
  for (const [name,panel] of [['plan','featurePlan'],['daily','featureDaily'],['manage','featureManage']]) $(panel).hidden = name !== group;
  document.querySelectorAll('[data-feature-group]').forEach(button => { const selected = button.dataset.featureGroup === group; button.classList.toggle('active',selected); button.setAttribute('aria-expanded',String(selected)); });
  $('featureGuide').hidden = true;
}
function openTool(id) {
  const tool = featureTools().find(item => item[1] === id); if (!tool) return;
  const host = $('featureDetailContent');
  for (const child of [...host.children]) if (child.classList.contains('card')) $('featureStorage').append(child);
  host.replaceChildren(); $('featureDetailTitle').textContent = tool[3]; $('featureDetailHelp').textContent = tool[4];
  if (tool[5]) {
    const card = $(tool[5]); card.hidden = false; host.append(card);
    if (id === 'missing' && !$('missingCheckText').textContent) $('missingCheckText').textContent = '目前没有漏记提醒；超过 3 天没有新收支时会提示。';
  } else {
    const button = document.createElement('button'); button.className = 'primary'; button.textContent = `打开${tool[3]}`;
    button.onclick = () => tool[6] === 'subscriptions' ? openSubscriptions() : $(tool[6]).click(); host.append(button);
  }
  open('featureDetailModal');
}
function renderTodo() {
  const due = JianjiFeatures.recurringOccurrences(data.recurring,data.recurringAcknowledged);
  const pending = paymentNotices.filter(notice => !data.entries.some(entry => entry.paymentNoticeId === notice.id));
  const today = new Date().toLocaleDateString('en-CA');
  const current = liveEntries().filter(entry => entry.date.startsWith(today.slice(0,7)));
  const budgets = data.budgets[today.slice(0,7)] || {};
  const items = due.map(({rule,date}) => ({tool:'recurring',title:rule.note,help:`${date} · 待确认 ${money(rule.amount)}`}));
  items.push(...pending.map(notice => ({tool:'payment',title:`${notice.source}支付通知`,help:`待核对 ${money(notice.amount)}`})));
  for (const category of cats) if (Number(budgets[category]) > 0 && current.reduce((sum,entry) => sum + JianjiFeatures.categoryNet(entry,category),0) >= Number(budgets[category])) items.push({tool:'budget',title:`${category}已达预算`,help:'查看剩余额度并调整安排'});
  for (const loan of data.receivables) if (!loan.archived && loan.dueDate < today && JianjiFeatures.receivableOutstanding(loan,data.entries) > 0) items.push({tool:'loans',title:`${loan.person}的待收款已逾期`,help:`待收 ${money(JianjiFeatures.receivableOutstanding(loan,data.entries))}`});
  $('homeTodo').hidden = items.length === 0; $('homeTodo').textContent = `有 ${items.length} 项待处理 · 点击查看 ›`;
  $('todoList').innerHTML = items.map(item => `<button class="todo-row" type="button" data-todo-tool="${item.tool}"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.help)}</small><span>›</span></button>`).join('') || '<div class="empty">当前没有待处理事项</div>';
}
let editingSubscriptionId = null;
function resetSubscriptionForm() {
  editingSubscriptionId = null; $('subscriptionForm').reset(); $('subscriptionDate').value = new Date().toLocaleDateString('en-CA');
  $('subscriptionLink').disabled = false; $('saveSubscription').textContent = '添加订阅'; $('cancelSubscriptionEdit').hidden = true;
}
function fillSubscriptionForm(rule) {
  editingSubscriptionId = rule.id; $('subscriptionName').value = rule.note; $('subscriptionAmount').value = rule.amount;
  $('subscriptionFrequency').value = rule.frequency; $('subscriptionDate').value = rule.startDate; $('subscriptionCategory').value = rule.category;
  $('subscriptionAccount').value = rule.accountId || ''; $('subscriptionLink').disabled = true;
  $('saveSubscription').textContent = rule.subscription ? '保存修改' : '关联为订阅'; $('cancelSubscriptionEdit').hidden = false;
  $('subscriptionForm').scrollIntoView({block:'start',behavior:'smooth'});
}
function renderSubscriptions() {
  const rules = data.recurring.filter(rule => rule.subscription);
  const active = rules.filter(rule => rule.active !== false);
  $('subscriptionSummary').innerHTML = `<b>折合每月 ${money(JianjiFeatures.subscriptionMonthly(rules))}</b><small>${active.length} 项进行中 · 年度折合 ${money(JianjiFeatures.subscriptionMonthly(rules) * 12)}；按周期估算，实际扣费以平台为准。</small>`;
  const due = JianjiFeatures.recurringOccurrences(rules,data.recurringAcknowledged);
  $('subscriptionList').innerHTML = rules.map(rule => {
    const overdue = due.find(item => item.rule.id === rule.id);
    const next = JianjiFeatures.nextRecurringDate(rule,data.recurringAcknowledged);
    return `<div class="annual-plan-row"><b>${escapeHtml(rule.note)}</b><p class="import-help">${money(rule.amount)} / ${rule.frequency === 'yearly' ? '年' : rule.frequency === 'weekly' ? '周' : '月'} · ${rule.active === false ? '已暂停' : overdue ? `${overdue.date}待确认` : `下次扣费 ${next || '暂无'}`}</p><div class="annual-plan-actions"><button data-sub-edit="${escapeHtml(rule.id)}">编辑</button><button data-sub-toggle="${escapeHtml(rule.id)}">${rule.active === false ? '恢复' : '暂停'}</button><button data-sub-unlink="${escapeHtml(rule.id)}">移出订阅</button></div></div>`;
  }).join('') || '<div class="empty">还没有订阅，可新建或关联已有周期支出</div>';
  $('subscriptionLink').innerHTML = '<option value="">新建订阅</option>' + data.recurring.filter(rule => rule.type === 'expense' && !rule.subscription).map(rule => `<option value="${escapeHtml(rule.id)}">${escapeHtml(rule.note)} · ${money(rule.amount)}</option>`).join('');
}
function openSubscriptions() { refreshCategoryUI(); refreshAccountUI(); renderSubscriptions(); resetSubscriptionForm(); open('subscriptionModal'); }
async function saveSubscription(event) {
  event.preventDefault(); const amount = Number($('subscriptionAmount').value), name = $('subscriptionName').value.trim();
  if (!name || !Number.isFinite(amount) || amount <= 0 || !$('subscriptionDate').value) return toast('请填写有效订阅名称、费用和日期');
  const existing = data.recurring.find(rule => rule.id === editingSubscriptionId);
  if (!existing && data.recurring.length >= 1000) return toast('周期账目已达到上限');
  const before = structuredClone(data.recurring);
  const rule = { ...existing, id: existing?.id || crypto.randomUUID(), type:'expense', subscription:true, note:name, amount, frequency:$('subscriptionFrequency').value, startDate:$('subscriptionDate').value, category:$('subscriptionCategory').value, accountId:$('subscriptionAccount').value, active:existing?.active !== false };
  if (existing) data.recurring[data.recurring.indexOf(existing)] = rule; else data.recurring.push(rule);
  try { await save(); } catch { data.recurring = before; return toast('订阅保存失败'); }
  syncReminders().catch(() => toast('订阅已保存，但系统提醒未更新')); renderSubscriptions(); resetSubscriptionForm(); render(); toast('订阅已保存');
}
async function handleSubscription(event) {
  const edit = event.target.closest('[data-sub-edit]'), toggle = event.target.closest('[data-sub-toggle]'), unlink = event.target.closest('[data-sub-unlink]');
  const rule = data.recurring.find(item => item.id === (edit?.dataset.subEdit || toggle?.dataset.subToggle || unlink?.dataset.subUnlink)); if (!rule) return;
  if (edit) return fillSubscriptionForm(rule);
  const before = structuredClone(rule);
  if (toggle) rule.active = rule.active === false; else delete rule.subscription;
  try { await save(); } catch { Object.assign(rule,before); return toast('订阅更新失败'); }
  syncReminders().catch(() => toast('订阅已保存，但系统提醒未更新')); renderSubscriptions(); resetSubscriptionForm(); render();
  toast(toggle ? '已更新记账提醒；平台扣费请到平台管理' : '已移出订阅，仍保留为周期账目');
}
