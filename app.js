const baseCats = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '其他'];
let cats = [...baseCats];
const iconFiles = { 餐饮: 'utensils', 交通: 'bus-front', 购物: 'shopping-bag', 居住: 'house', 娱乐: 'clapperboard', 医疗: 'heart-pulse', 其他: 'shapes', income: 'wallet', excluded: 'arrow-left-right' };
const iconTones = { 餐饮: 'coral', 交通: 'sky', 购物: 'violet', 居住: 'amber', 娱乐: 'pink', 医疗: 'mint', 其他: 'slate', income: 'mint', excluded: 'slate' };
const customIcon = category => data?.customCategories?.find(item => item.name === category)?.icon;
const iconMarkup = category => `<span class="category-glyph" style="--glyph:url('assets/icons/${iconFiles[category] || iconFiles[customIcon(category)] || iconFiles.其他}.svg')" aria-hidden="true"></span>`;
const toneClass = category => `tone-${iconTones[category] || iconTones[customIcon(category)] || 'slate'}`;
const $ = id => document.getElementById(id);
const now = new Date();
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let activePage = 'home';
let detailFilter = 'all';
let editingId = null;
let entryType = 'expense';
let selectedImage = null;
let previewUrl = null;
let visibleImageUrls = [];
let pendingImport = [];
let importFilter = 'all';
let paymentDraftId = null;
let paymentNotices = [];
let data = { entries: [], budgets: {}, customCategories: [], recurring: [], recurringAcknowledged: {}, accounts: [], importRules: [], lastBackupAt: '' };
function normalizeData() {
  if (!Array.isArray(data.entries)) data.entries = [];
  if (!data.budgets || typeof data.budgets !== 'object') data.budgets = {};
  if (!Array.isArray(data.customCategories)) data.customCategories = [];
  if (!Array.isArray(data.recurring)) data.recurring = [];
  if (!data.recurringAcknowledged || typeof data.recurringAcknowledged !== 'object') data.recurringAcknowledged = {};
  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!Array.isArray(data.importRules)) data.importRules = [];
  if (typeof data.lastBackupAt !== 'string') data.lastBackupAt = '';
  if (![7, 30, 90].includes(Number(data.backupIntervalDays))) data.backupIntervalDays = 30;
}
const liveEntries = () => data.entries.filter(entry => !entry.deletedAt);
const refreshCats = () => { cats = [...baseCats, ...data.customCategories.map(item => item.name)]; };
refreshCats();
const money = n => `${Number(n) < 0 ? '−' : ''}¥ ${Math.abs(Number(n || 0)).toFixed(2)}`;
const key = () => `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}`;
let pendingWrites = Promise.resolve();
const save = () => {
  const snapshot = structuredClone(data);
  const operation = pendingWrites.then(() => JianjiStore.write(snapshot));
  pendingWrites = operation.catch(() => {});
  return operation;
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2700);
}
function photoStore(mode, id, blob) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('此浏览器不支持图片存储'));
    const request = indexedDB.open('jianji-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('photos', mode === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('photos');
      const operation = mode === 'put' ? store.put(blob, id) : mode === 'delete' ? store.delete(id) : store.get(id);
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    };
  });
}
async function loadVisiblePhotos() {
  const slots = [...document.querySelectorAll('[data-photo-id]')];
  for (const slot of slots) {
    try {
      const blob = await photoStore('get', slot.dataset.photoId);
      if (!blob || !slot.isConnected) continue;
      const url = URL.createObjectURL(blob);
      visibleImageUrls.push(url);
      slot.src = url;
      slot.hidden = false;
    } catch { /* The ledger remains usable if browser photo storage is unavailable. */ }
  }
}
function renderRecordList(id, list, emptyText) {
  const container = $(id);
  container.innerHTML = list.map(e => `<div class="record"><div class="icon ${toneClass(e.type === 'expense' ? e.category : e.type === 'refund' ? 'income' : e.type)}">${iconMarkup(e.type === 'expense' ? e.category : e.type === 'refund' ? 'income' : e.type)}</div><div class="recordtext"><b></b><small></small></div>${e.photoId ? `<img class="record-photo" data-photo-id="${escapeHtml(e.photoId)}" alt="记录图片" hidden>` : ''}<div class="amount ${e.type === 'income' || e.type === 'refund' ? 'income' : e.type === 'excluded' ? 'excluded' : ''}">${e.type === 'income' || e.type === 'refund' ? '+' : e.type === 'excluded' ? '' : '−'}${money(e.amount)}</div><div class="actions">${e.type === 'expense' ? `<button data-refund="${escapeHtml(e.id)}" aria-label="为这笔支出记退款">退款</button>` : ''}<button data-edit="${escapeHtml(e.id)}" aria-label="编辑记录">编辑</button><button data-delete="${escapeHtml(e.id)}" aria-label="删除记录">×</button></div></div>`).join('') || `<div class="empty">${emptyText}</div>`;
  [...container.querySelectorAll('.record')].forEach((row, index) => {
    const entry = list[index];
    row.querySelector('b').textContent = entry.note || (entry.transferFrom ? '账户转账' : entry.type === 'income' ? '月度收入' : entry.type === 'refund' ? '退款' : Array.isArray(entry.splits) && entry.splits.length ? '多类别支出' : entry.category);
    const accountName = id => data.accounts.find(account => account.id === id)?.name || '未知账户';
    const accountText = entry.transferFrom ? ` · ${accountName(entry.transferFrom)} → ${accountName(entry.transferTo)}` : entry.accountId ? ` · ${accountName(entry.accountId)}` : '';
    row.querySelector('small').textContent = entry.date + ' · ' + (entry.transferFrom ? '账户转账' : entry.type === 'income' ? '收入' : entry.type === 'excluded' ? '不计收支' : entry.type === 'refund' ? `${entry.category}退款` : Array.isArray(entry.splits) && entry.splits.length ? entry.splits.map(part => `${part.category}${money(part.amount)}`).join('、') : entry.category) + (entry.source ? ` · ${entry.source}` : '') + accountText;
  });
}
function renderStats(list, income, expense) {
  $('statsIncome').textContent = money(income);
  $('statsExpense').textContent = money(expense);
  $('statsBalance').textContent = money(income - expense);
  const categoryTotals = cats.map(category => ({
    category,
    total: list.reduce((sum, entry) => sum + JianjiFeatures.categoryNet(entry, category), 0)
  })).filter(item => item.total > 0).sort((a, b) => b.total - a.total);
  $('categoryStats').innerHTML = categoryTotals.map(item => `<div class="category-row"><div class="rowtop"><b class="category-name"><span class="category-mini ${toneClass(item.category)}">${iconMarkup(item.category)}</span>${escapeHtml(item.category)}</b><span>${money(item.total)}</span></div><small>占本月净支出 ${expense > 0 ? Math.round(item.total / expense * 100) : 0}%</small><div class="track"><div class="fill" style="width:${expense > 0 ? Math.min(100, item.total / expense * 100) : 0}%"></div></div></div>`).join('') || '<div class="empty">本月还没有净支出记录</div>';
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(view.getFullYear(), view.getMonth() - 5 + index, 1);
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entries = liveEntries().filter(e => e.date && e.date.startsWith(ym));
    return {
      label: `${date.getMonth() + 1}月`,
      income: entries.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0),
      expense: JianjiFeatures.netExpense(entries)
    };
  });
  const maximum = Math.max(0, ...months.flatMap(month => [month.income, month.expense]));
  $('trendStats').innerHTML = maximum > 0 ? `<div class="trend-chart">${months.map(month => `<div class="trend-col" aria-label="${month.label}收入${money(month.income)}，净支出${money(month.expense)}"><div class="trend-bars"><div class="trend-bar income" style="height:${Math.max(0, month.income) / maximum * 100}%"></div><div class="trend-bar expense" style="height:${Math.max(0, month.expense) / maximum * 100}%"></div></div><label>${month.label}</label></div>`).join('')}</div>` : '<div class="empty">近 6 个月还没有收支记录</div>';
  const previousKey = `${new Date(view.getFullYear(), view.getMonth() - 1, 1).getFullYear()}-${String(new Date(view.getFullYear(), view.getMonth() - 1, 1).getMonth() + 1).padStart(2, '0')}`;
  const previousExpense = JianjiFeatures.netExpense(liveEntries().filter(entry => entry.date?.startsWith(previousKey)));
  const difference = expense - previousExpense;
  const top = categoryTotals[0];
  const over = cats.filter(category => Number((data.budgets[key()] || {})[category]) > 0 && list.reduce((sum, entry) => sum + JianjiFeatures.categoryNet(entry, category), 0) > Number(data.budgets[key()][category]));
  $('monthlyReview').innerHTML = `<div class="review-grid"><div><small>本月净支出</small><b>${money(expense)}</b></div><div><small>比上月</small><b>${previousExpense === 0 ? '上月暂无数据' : `${difference >= 0 ? '多' : '少'} ${money(Math.abs(difference))}`}</b></div><div><small>最多的类别</small><b>${top ? `${escapeHtml(top.category)} ${money(top.total)}` : '暂无'}</b></div><div><small>超预算类别</small><b>${over.length ? over.map(escapeHtml).join('、') : '无'}</b></div></div>`;
}
function renderPlanning(list, budgets) {
  const due = JianjiFeatures.recurringOccurrences(data.recurring, data.recurringAcknowledged);
  $('recurringDue').innerHTML = due.length ? due.slice(0, 5).map(({ rule, date }) => `<div class="planning-row"><div><b>${escapeHtml(rule.note)}</b><small>${date} · ${rule.type === 'income' ? '收入' : escapeHtml(rule.category)} · ${money(rule.amount)}</small></div><div class="planning-actions"><button data-recurring-post="${escapeHtml(rule.id)}|${date}">记入</button><button data-recurring-skip="${escapeHtml(rule.id)}|${date}">跳过</button></div></div>`).join('') + (due.length > 5 ? `<p class="muted">还有 ${due.length - 5} 笔待确认</p>` : '') : '<div class="empty">暂无待确认账目；可添加房租、订阅等周期账目</div>';
  const alerts = cats.flatMap(category => {
    const limit = Number(budgets[category]);
    if (!Number.isFinite(limit) || limit <= 0) return [];
    const used = list.reduce((sum, entry) => sum + JianjiFeatures.categoryNet(entry, category), 0);
    return used >= limit * 0.8 ? [{ category, used, limit }] : [];
  });
  $('budgetAlertCard').hidden = alerts.length === 0;
  $('budgetAlerts').innerHTML = alerts.map(({ category, used, limit }) => `<div class="budget-alert ${used >= limit ? 'over' : ''}"><b>${escapeHtml(category)}${used >= limit ? '已超出预算' : '接近预算'}</b><span>已用 ${money(used)} / ${money(limit)}</span></div>`).join('');
  const days = data.lastBackupAt ? Math.floor((Date.now() - Date.parse(data.lastBackupAt)) / 86400000) : Infinity;
  const needsBackup = liveEntries().length > 0 && (!Number.isFinite(days) || days >= data.backupIntervalDays);
  $('backupReminder').hidden = !needsBackup;
  $('backupReminder').innerHTML = needsBackup ? `${data.lastBackupAt ? `已超过 ${days} 天没有保存备份。` : '这个账本还没有保存过加密备份。'}<button type="button" id="backupReminderAction">现在备份</button>` : '';
}
function render() {
  visibleImageUrls.forEach(url => URL.revokeObjectURL(url));
  visibleImageUrls = [];
  const ym = key();
  const list = liveEntries().filter(e => e.date && e.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('month').textContent = `${view.getFullYear()}年${view.getMonth() + 1}月`;
  const income = list.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const expense = JianjiFeatures.netExpense(list);
  $('income').textContent = money(income);
  $('expense').textContent = money(expense);
  $('balance').textContent = money(income - expense);
  const search = $('recordSearch').value.trim().toLocaleLowerCase();
  const source = $('recordSource').value;
  const category = $('recordCategory').value;
  const detailList = $('allMonths').checked ? liveEntries().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id) : list;
  const filtered = detailList.filter(e => (detailFilter === 'all' || e.type === detailFilter || detailFilter === 'expense' && e.type === 'refund')
    && (!search || `${e.note || ''} ${e.source || ''} ${e.category || ''}`.toLocaleLowerCase().includes(search))
    && (!source || (source === 'manual' ? !e.source : e.source === source))
    && (!category || e.category === category || e.type === 'expense' && JianjiFeatures.expenseParts(e).some(part => part.category === category)));
  $('count').textContent = `共 ${filtered.length} 笔`;
  const budgets = data.budgets[ym] || {};
  $('budgets').innerHTML = cats.filter(c => Number(budgets[c]) > 0).map(c => {
    const used = list.reduce((sum, entry) => sum + JianjiFeatures.categoryNet(entry, c), 0);
    const limit = Number(budgets[c]);
    const percent = used / limit * 100;
    return `<div class="budgetrow"><div class="rowtop"><b class="category-name"><span class="category-mini ${toneClass(c)}">${iconMarkup(c)}</span>${escapeHtml(c)}</b><span>${money(used)} <span class="muted">/ ${money(limit)}</span></span></div><div class="track"><div class="fill ${percent >= 100 ? 'over' : percent >= 80 ? 'warn' : ''}" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div><small>还可花 ${money(Math.max(0, limit - used))}${used > limit ? ` · 已超 ${money(used - limit)}` : ''}</small></div>`;
  }).join('') || '<div class="empty">还没有设置预算，点右上角开始设置</div>';
  const budgeted = cats.filter(category => Number(budgets[category]) > 0);
  $('budgetRemaining').hidden = budgeted.length === 0;
  if (budgeted.length) {
    const balances = budgeted.map(category => Number(budgets[category]) - list.reduce((used, entry) => used + JianjiFeatures.categoryNet(entry, category), 0));
    const left = balances.reduce((sum, balance) => sum + Math.max(0, balance), 0);
    const over = balances.reduce((sum, balance) => sum + Math.max(0, -balance), 0);
    const today = new Date();
    const currentMonth = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
    const days = currentMonth ? new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate() - today.getDate() + 1 : 0;
    $('budgetRemaining').innerHTML = `<b>各类可用额度合计 ${money(left)}</b><small>${over > 0 ? `其他类别已超 ${money(over)}。` : ''}${currentMonth ? `本月剩余 ${days} 天，日均参考 ${money(left / days)}。` : ''}仅计算已设预算的类别。</small>`;
  }
  renderPlanning(list, budgets);
  renderRecordList('recentRecords', list.slice(0, 3), '这个月还没有记录，点「记一笔」开始');
  renderRecordList('records', filtered, filtered.length ? '' : detailFilter === 'all' ? '这个月还没有记录，点「记一笔」开始' : '这个月没有这类记录');
  renderStats(list, income, expense);
  loadVisiblePhotos();
}
function switchPage(page, updateHash = true) {
  activePage = ['home', 'details', 'stats'].includes(page) ? page : 'home';
  for (const name of ['home', 'details', 'stats']) $(name + 'Page').hidden = name !== activePage;
  $('add').hidden = activePage === 'home';
  document.querySelectorAll('[data-page]').forEach(button => {
    const selected = button.dataset.page === activePage;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (updateHash) location.hash = activePage;
  window.scrollTo(0, 0);
}
function open(id) { $(id).classList.add('show'); }
function close(id) { $(id).classList.remove('show'); }
function setType(type) {
  entryType = type;
  $('expenseTab').classList.toggle('active', type === 'expense');
  $('incomeTab').classList.toggle('active', type === 'income');
  $('excludedTab').classList.toggle('active', type === 'excluded');
  $('categoryField').style.display = type === 'expense' ? 'block' : 'none';
  $('splitField').hidden = type !== 'expense';
  if (type === 'expense') updateSplitUI();
}
function splitRows() {
  return [...$('splitRows').querySelectorAll('.split-row')].map(row => ({ category: row.querySelector('select').value, amount: Number(row.querySelector('input').value) }));
}
function renderSplitRows(parts = []) {
  $('splitRows').innerHTML = parts.map((part, index) => `<div class="split-row"><select aria-label="第${index + 1}个类别">${cats.map(category => `<option value="${escapeHtml(category)}"${category === part.category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><input type="number" min="0.01" step="0.01" value="${Number(part.amount) || ''}" placeholder="金额" aria-label="第${index + 1}个类别金额"><button type="button" data-split-remove="${index}" aria-label="移除类别">×</button></div>`).join('');
  updateSplitRemaining();
}
function updateSplitRemaining() {
  const remaining = Math.round(Number($('entryAmount').value || 0) * 100) - splitRows().reduce((sum, part) => sum + Math.round(part.amount * 100), 0);
  $('splitRemaining').textContent = `尚未分配 ${money(remaining / 100)}；各类别金额之和须等于总金额。`;
}
function updateSplitUI() {
  const enabled = $('splitEnabled').checked && entryType === 'expense';
  $('categoryField').style.display = entryType === 'expense' && !enabled ? 'block' : 'none';
  $('splitRows').hidden = !enabled;
  $('addSplit').hidden = !enabled;
  $('splitRemaining').hidden = !enabled;
  if (enabled && !$('splitRows').children.length) renderSplitRows([{ category: cats[0], amount: '' }, { category: cats[1] || cats[0], amount: '' }]);
}
$('splitEnabled').onchange = updateSplitUI;
$('addSplit').onclick = () => renderSplitRows([...splitRows(), { category: cats.find(category => !splitRows().some(part => part.category === category)) || cats[0], amount: '' }]);
$('splitRows').onclick = event => {
  const button = event.target.closest('[data-split-remove]');
  if (button) renderSplitRows(splitRows().filter((_, index) => index !== Number(button.dataset.splitRemove)));
};
$('splitRows').oninput = updateSplitRemaining;
$('entryAmount').oninput = updateSplitRemaining;
function clearSelectedImage() {
  selectedImage = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('photoPreview').hidden = true;
  $('photoPreview').removeAttribute('src');
  $('photoName').textContent = '可拍摄物品，也可选择相册里的网购截图';
  $('cameraInput').value = '';
  $('imageInput').value = '';
}
function selectImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('请选择图片文件');
  if (file.size > 15 * 1024 * 1024) return toast('图片请小于 15 MB');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  selectedImage = file;
  previewUrl = URL.createObjectURL(file);
  $('photoPreview').src = previewUrl;
  $('photoPreview').hidden = false;
  $('photoName').textContent = file.name || '已选择图片';
}
function refreshCategoryUI() {
  refreshCats();
  for (const id of ['entryCategory', 'budgetCategory', 'recordCategory', 'recurringCategory', 'ruleCategory']) {
    const select = $(id);
    const old = select.value;
    select.innerHTML = (id === 'recordCategory' ? '<option value="">全部类别</option>' : '') + cats.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    if (cats.includes(old)) select.value = old;
  }
  $('categoryShortcuts').innerHTML = cats.map(category => `<button type="button" class="category-shortcut ${toneClass(category)}" data-quick-category="${escapeHtml(category)}" aria-label="记录${escapeHtml(category)}支出"><span class="shortcut-icon">${iconMarkup(category)}</span><span>${escapeHtml(category)}</span></button>`).join('');
  $('customCategoryIcon').innerHTML = baseCats.map(category => `<option value="${category}">${category}</option>`).join('');
}
function renderCustomCategories() {
  $('customCategoryList').innerHTML = data.customCategories.map((item, index) => `<div class="settings-row"><span class="category-mini ${toneClass(item.name)}">${iconMarkup(item.name)}</span><input data-category-edit="${index}" maxlength="12" value="${escapeHtml(item.name)}" aria-label="分类名称"><button data-category-rename="${index}">改名</button><button data-category-delete="${index}">删除</button></div>`).join('') || '<div class="empty">还没有自定义分类</div>';
}
function refreshAccountUI() {
  for (const id of ['entryAccount', 'transferFrom', 'transferTo']) {
    const select = $(id);
    const selected = select.value;
    select.innerHTML = (id === 'entryAccount' ? '<option value="">未指定账户</option>' : '') + data.accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
    if (selected && data.accounts.some(account => account.id === selected)) select.value = selected;
  }
}
function renderAccounts() {
  $('accountList').innerHTML = data.accounts.map(account => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(account.name)}</b><small>当前余额 ${money(JianjiFeatures.accountBalance(account, data.entries))}</small></div><button data-account-edit="${escapeHtml(account.id)}">编辑</button><button data-account-delete="${escapeHtml(account.id)}">删除</button></div>`).join('') || '<div class="empty">还没有账户，可先添加现金、银行卡等</div>';
}
function renderImportRules() {
  $('importRuleList').innerHTML = data.importRules.map(rule => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(rule.keyword)} → ${escapeHtml(rule.category)}</b><small>${escapeHtml(rule.source || '微信和支付宝')}</small></div><button data-rule-remove="${escapeHtml(rule.id)}">删除</button></div>`).join('') || '<div class="empty">还没有分类规则</div>';
}
refreshCategoryUI();
refreshAccountUI();
for (const id of ['recordSearch', 'recordCategory', 'recordSource', 'allMonths']) $(id).addEventListener('input', render);
$('prev').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
$('next').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => switchPage(button.dataset.page));
$('allRecords').onclick = () => switchPage('details');
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  detailFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  render();
});
window.addEventListener('hashchange', () => switchPage(location.hash.slice(1), false));
function openNewEntry(category = '餐饮') {
  editingId = null;
  paymentDraftId = null;
  $('entryModalTitle').textContent = '记一笔';
  $('entryForm').reset();
  $('splitRows').replaceChildren();
  $('removeStoredPhotoField').hidden = true;
  $('entryDate').value = new Date().toLocaleDateString('en-CA');
  clearSelectedImage();
  setType('expense');
  $('entryCategory').value = category;
  open('entryModal');
  $('entryAmount').focus();
}
$('add').onclick = () => openNewEntry();
$('heroAdd').onclick = () => openNewEntry();
$('categoryShortcuts').onclick = event => {
  const button = event.target.closest('[data-quick-category]');
  if (button) openNewEntry(button.dataset.quickCategory);
};
$('setbudget').onclick = () => {
  $('budgetCategory').value = cats[0];
  $('budgetAmount').value = (data.budgets[key()] || {})[cats[0]] ?? '';
  $('budgetMonthLabel').textContent = `当前正在设置 ${view.getFullYear()} 年 ${view.getMonth() + 1} 月预算。`;
  $('budgetCopyStatus').textContent = '复制上月预算只填补当前月尚未设置的类别。';
  open('budgetModal');
};
$('budgetCategory').onchange = () => { $('budgetAmount').value = (data.budgets[key()] || {})[$('budgetCategory').value] ?? ''; };
$('copyPreviousBudgets').onclick = async () => {
  const previous = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const source = data.budgets[previousKey] || {};
  const available = Object.entries(source).filter(([category, amount]) => cats.includes(category) && Number(amount) > 0);
  if (!available.length) return $('budgetCopyStatus').textContent = '上个月没有可复制的分类预算。';
  const current = data.budgets[key()] || {};
  const added = available.filter(([category]) => !Object.hasOwn(current, category));
  if (!added.length) return $('budgetCopyStatus').textContent = '本月已经设置了这些类别；原有额度没有被覆盖。';
  const old = data.budgets[key()];
  data.budgets[key()] = { ...current, ...Object.fromEntries(added) };
  try { await save(); } catch { if (old) data.budgets[key()] = old; else delete data.budgets[key()]; return $('budgetCopyStatus').textContent = '复制失败，请检查存储空间。'; }
  $('budgetAmount').value = data.budgets[key()][$('budgetCategory').value] ?? '';
  $('budgetCopyStatus').textContent = `已复制 ${added.length} 个类别；本月已有预算保持不变。`;
  render();
};
$('manageCategories').onclick = () => { renderCustomCategories(); open('categoryModal'); };
$('categoryForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('customCategoryName').value.trim();
  if (!name || cats.includes(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) return toast('分类名称不可用或已存在');
  data.customCategories.push({ name, icon: $('customCategoryIcon').value });
  try { await save(); } catch { data.customCategories.pop(); return toast('分类保存失败'); }
  $('customCategoryName').value = '';
  refreshCategoryUI(); renderCustomCategories(); render(); toast('分类已添加');
};
$('customCategoryList').onclick = async event => {
  const renameButton = event.target.closest('[data-category-rename]');
  const deleteButton = event.target.closest('[data-category-delete]');
  if (!renameButton && !deleteButton) return;
  const index = Number((renameButton || deleteButton).dataset[renameButton ? 'categoryRename' : 'categoryDelete']);
  const item = data.customCategories[index];
  if (!item) return;
  if (renameButton) {
    const name = renameButton.parentElement.querySelector('input').value.trim();
    if (!name || (name !== item.name && cats.includes(name)) || ['__proto__', 'constructor', 'prototype'].includes(name)) return toast('分类名称不可用或已存在');
    const before = JSON.stringify(data);
    for (const entry of data.entries) {
      if (entry.category === item.name) entry.category = name;
      for (const part of entry.splits || []) if (part.category === item.name) part.category = name;
    }
    for (const rule of data.recurring) if (rule.category === item.name) rule.category = name;
    for (const rule of data.importRules) if (rule.category === item.name) rule.category = name;
    for (const budget of Object.values(data.budgets)) if (Object.hasOwn(budget, item.name)) { budget[name] = budget[item.name]; delete budget[item.name]; }
    item.name = name;
    try { await save(); } catch { data = JSON.parse(before); return toast('分类改名失败'); }
    refreshCategoryUI(); renderCustomCategories(); render(); toast('分类已改名');
  } else {
    if (data.entries.some(entry => entry.category === item.name || entry.splits?.some(part => part.category === item.name)) || data.recurring.some(rule => rule.category === item.name) || data.importRules.some(rule => rule.category === item.name) || Object.values(data.budgets).some(budget => Number(budget[item.name]) > 0)) return toast('此分类仍有账目、周期规则、导入规则或预算，请先调整它们');
    data.customCategories.splice(index, 1);
    try { await save(); } catch { data.customCategories.splice(index, 0, item); return toast('分类删除失败'); }
    refreshCategoryUI(); renderCustomCategories(); render(); toast('分类已删除');
  }
};
let editingAccountId = null;
let editingTransferId = null;
$('manageAccounts').onclick = () => { editingAccountId = null; editingTransferId = null; $('accountForm').reset(); $('accountForm').querySelector('button').textContent = '添加账户'; $('transferForm').reset(); $('transferForm').querySelector('button').textContent = '记录转账'; $('transferDate').value = new Date().toLocaleDateString('en-CA'); renderAccounts(); open('accountModal'); };
$('accountForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('accountName').value.trim();
  const openingBalance = Number($('accountOpening').value);
  if (!name || !Number.isFinite(openingBalance) || data.accounts.some(account => account.name === name && account.id !== editingAccountId)) return toast('账户名称已存在或余额无效');
  const before = structuredClone(data.accounts);
  const existing = data.accounts.find(account => account.id === editingAccountId);
  if (existing) { existing.name = name; existing.openingBalance = openingBalance; }
  else data.accounts.push({ id: crypto.randomUUID(), name, openingBalance });
  try { await save(); } catch { data.accounts = before; return toast('账户保存失败'); }
  editingAccountId = null;
  $('accountForm').reset();
  $('accountForm').querySelector('button').textContent = '添加账户';
  refreshAccountUI(); renderAccounts(); render(); toast('账户已保存');
};
$('accountList').onclick = async event => {
  const edit = event.target.closest('[data-account-edit]');
  const remove = event.target.closest('[data-account-delete]');
  const account = data.accounts.find(item => item.id === (edit?.dataset.accountEdit || remove?.dataset.accountDelete));
  if (!account) return;
  if (edit) {
    editingAccountId = account.id;
    $('accountName').value = account.name;
    $('accountOpening').value = account.openingBalance;
    $('accountForm').querySelector('button').textContent = '保存账户修改';
    $('accountForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (data.entries.some(entry => entry.accountId === account.id || entry.transferFrom === account.id || entry.transferTo === account.id)) return toast('此账户已有账目，请先调整账目后再删除');
  const before = data.accounts;
  data.accounts = before.filter(item => item !== account);
  try { await save(); } catch { data.accounts = before; return toast('账户删除失败'); }
  refreshAccountUI(); renderAccounts(); toast('账户已删除');
};
$('transferForm').onsubmit = async event => {
  event.preventDefault();
  const from = $('transferFrom').value, to = $('transferTo').value, amount = Number($('transferAmount').value);
  if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return toast('请选择不同的转出、转入账户和有效金额');
  const old = editingTransferId === null ? null : data.entries.find(item => String(item.id) === editingTransferId);
  const entry = { ...old, id: old?.id ?? crypto.randomUUID(), type: 'excluded', amount, date: $('transferDate').value, category: '', note: $('transferNote').value.trim() || '账户转账', transferFrom: from, transferTo: to };
  const index = old ? data.entries.indexOf(old) : -1;
  if (index >= 0) data.entries[index] = entry; else data.entries.push(entry);
  try { await save(); } catch { if (index >= 0) data.entries[index] = old; else data.entries.pop(); return toast('转账保存失败'); }
  editingTransferId = null;
  $('transferForm').querySelector('button').textContent = '记录转账';
  $('transferAmount').value = ''; $('transferNote').value = '';
  renderAccounts(); render(); toast(old ? '转账已更新' : '转账已记录');
};
$('manageImportRules').onclick = () => { renderImportRules(); open('importRulesModal'); };
$('importRuleForm').onsubmit = async event => {
  event.preventDefault();
  const keyword = $('ruleKeyword').value.trim(), source = $('ruleSource').value, category = $('ruleCategory').value;
  if (!keyword || !cats.includes(category) || data.importRules.some(rule => rule.keyword === keyword && rule.source === source)) return toast('规则无效或已存在');
  data.importRules.push({ id: crypto.randomUUID(), keyword, source, category });
  try { await save(); } catch { data.importRules.pop(); return toast('规则保存失败'); }
  $('ruleKeyword').value = ''; renderImportRules(); toast('分类规则已添加');
};
$('importRuleList').onclick = async event => {
  const button = event.target.closest('[data-rule-remove]');
  if (!button) return;
  const before = data.importRules;
  data.importRules = before.filter(rule => rule.id !== button.dataset.ruleRemove);
  try { await save(); } catch { data.importRules = before; return toast('规则删除失败'); }
  renderImportRules(); toast('规则已删除');
};
let recurringType = 'expense';
let editingRecurringId = null;
function resetRecurringForm() {
  editingRecurringId = null;
  $('recurringForm').reset();
  $('recurringStart').value = new Date().toLocaleDateString('en-CA');
  $('saveRecurringRule').textContent = '添加周期账目';
  $('cancelRecurringEdit').hidden = true;
  setRecurringType('expense');
}
function setRecurringType(type) {
  recurringType = type;
  $('recurringExpense').classList.toggle('active', type === 'expense');
  $('recurringIncome').classList.toggle('active', type === 'income');
  $('recurringCategoryField').hidden = type === 'income';
}
function renderRecurringRules() {
  $('recurringRules').innerHTML = data.recurring.map(rule => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(rule.note)}</b><small>${rule.frequency === 'weekly' ? '每周' : '每月'} · ${money(rule.amount)} · ${rule.active === false ? '已暂停' : '进行中'}</small></div><button data-rule-edit="${escapeHtml(rule.id)}">编辑</button><button data-rule-toggle="${escapeHtml(rule.id)}">${rule.active === false ? '启用' : '暂停'}</button><button data-rule-delete="${escapeHtml(rule.id)}">删除</button></div>`).join('') || '<div class="empty">还没有周期账目</div>';
}
$('manageRecurring').onclick = () => { resetRecurringForm(); renderRecurringRules(); open('recurringModal'); };
$('cancelRecurringEdit').onclick = resetRecurringForm;
$('recurringExpense').onclick = () => setRecurringType('expense');
$('recurringIncome').onclick = () => setRecurringType('income');
$('recurringForm').onsubmit = async event => {
  event.preventDefault();
  const amount = Number($('recurringAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const existing = editingRecurringId === null ? null : data.recurring.find(item => item.id === editingRecurringId);
  if (editingRecurringId !== null && !existing) return toast('周期规则不存在，请重新打开');
  const rule = { ...existing, id: existing?.id || String(Date.now() + Math.random()), type: recurringType, amount, category: recurringType === 'expense' ? $('recurringCategory').value : '', note: $('recurringNote').value.trim(), frequency: $('recurringFrequency').value, startDate: $('recurringStart').value, active: existing?.active !== false };
  const index = existing ? data.recurring.indexOf(existing) : -1;
  if (index >= 0) data.recurring[index] = rule; else data.recurring.push(rule);
  try { await save(); } catch { if (index >= 0) data.recurring[index] = existing; else data.recurring.pop(); return toast('周期账目保存失败'); }
  resetRecurringForm(); renderRecurringRules(); render(); toast(existing ? '周期规则已更新；已确认的历史账目保持不变' : '周期账目已添加');
};
$('recurringRules').onclick = async event => {
  const edit = event.target.closest('[data-rule-edit]');
  const toggle = event.target.closest('[data-rule-toggle]');
  const remove = event.target.closest('[data-rule-delete]');
  if (!edit && !toggle && !remove) return;
  const rule = data.recurring.find(item => item.id === (edit?.dataset.ruleEdit || toggle?.dataset.ruleToggle || remove?.dataset.ruleDelete));
  if (!rule) return;
  if (edit) {
    editingRecurringId = rule.id;
    setRecurringType(rule.type);
    $('recurringAmount').value = rule.amount;
    $('recurringCategory').value = rule.category || cats[0];
    $('recurringNote').value = rule.note;
    $('recurringFrequency').value = rule.frequency;
    $('recurringStart').value = rule.startDate;
    $('saveRecurringRule').textContent = '保存修改';
    $('cancelRecurringEdit').hidden = false;
    $('recurringForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (toggle) rule.active = rule.active === false;
  else data.recurring = data.recurring.filter(item => item !== rule);
  try { await save(); } catch { if (toggle) rule.active = !rule.active; else data.recurring.push(rule); return toast('保存失败'); }
  if (remove && editingRecurringId === rule.id) resetRecurringForm();
  renderRecurringRules(); render();
};
$('recurringDue').onclick = async event => {
  const post = event.target.closest('[data-recurring-post]');
  const skip = event.target.closest('[data-recurring-skip]');
  if (!post && !skip) return;
  const [id, date] = (post?.dataset.recurringPost || skip?.dataset.recurringSkip).split('|');
  const rule = data.recurring.find(item => item.id === id);
  const occurrenceKey = `${id}|${date}`;
  if (!rule || data.recurringAcknowledged[occurrenceKey]) return;
  const entry = post ? { id: Date.now() + Math.random(), type: rule.type, amount: rule.amount, date, category: rule.category, note: rule.note, recurringKey: occurrenceKey } : null;
  if (entry) data.entries.push(entry);
  data.recurringAcknowledged[occurrenceKey] = post ? 'posted' : 'skipped';
  try { await save(); } catch { if (entry) data.entries.pop(); delete data.recurringAcknowledged[occurrenceKey]; return toast('保存失败'); }
  render(); toast(post ? '周期账目已记入' : '已跳过本期');
};
$('expenseTab').onclick = () => setType('expense');
$('incomeTab').onclick = () => setType('income');
$('excludedTab').onclick = () => setType('excluded');
$('cameraButton').onclick = () => $('cameraInput').click();
$('imageButton').onclick = () => $('imageInput').click();
$('cameraInput').onchange = e => selectImage(e.target.files[0]);
$('imageInput').onchange = e => selectImage(e.target.files[0]);
$('removePhoto').onclick = clearSelectedImage;
$('openImport').onclick = () => {
  pendingImport = [];
  importFilter = 'all';
  $('billFile').value = '';
  $('billFileName').textContent = '尚未选择文件';
  $('importSummary').textContent = '选择文件后会先预览，不会立即入账。';
  $('importPreview').replaceChildren();
  $('importControls').hidden = true;
  document.querySelectorAll('[data-import-filter]').forEach(button => button.classList.toggle('active', button.dataset.importFilter === 'all'));
  $('confirmImport').disabled = true;
  open('importModal');
};
$('chooseBillFile').onclick = () => $('billFile').click();
function updateImportSelection() {
  const selected = $('importPreview').querySelectorAll('input[data-import-index]:checked').length
    + [...$('importPreview').querySelectorAll('select[data-reconcile-index]')].filter(select => select.value !== 'skip').length;
  $('confirmImport').disabled = selected === 0;
  $('confirmImport').textContent = selected ? `确认处理 ${selected} 笔` : '确认导入';
}
function applyImportFilter() {
  $('importPreview').querySelectorAll('.import-item').forEach(row => {
    row.dataset.filtered = String(importFilter === 'review' ? row.dataset.review !== 'true'
      : importFilter === 'duplicate' ? row.dataset.duplicate !== 'true' : false);
  });
  document.querySelectorAll('[data-import-filter]').forEach(button => button.classList.toggle('active', button.dataset.importFilter === importFilter));
}
function renderImportPreview() {
  $('importPreview').innerHTML = pendingImport.map((entry, index) => {
    const duplicate = entry.duplicateMatchId !== null;
    return `<div class="import-item" data-review="${Boolean(entry.reviewReason || duplicate)}" data-duplicate="${duplicate}">${duplicate ? '' : `<input type="checkbox" data-import-index="${index}" aria-label="导入第 ${index + 1} 笔" checked>`}<div class="import-item-main"><b>${escapeHtml(entry.note)}</b><small>${escapeHtml(entry.transactionTime)} · ${entry.source}${entry.reviewReason ? ' · 请核对：' + escapeHtml(entry.reviewReason) : ''}</small>${duplicate ? `<small class="duplicate-hint">可能已记账：${escapeHtml(entry.duplicateHint)}。请选择如何处理。</small><select class="reconcile-choice" data-reconcile-index="${index}" aria-label="疑似重复账目处理方式"><option value="skip">暂不导入</option><option value="merge">关联已有手动账目</option><option value="new">仍新增一笔</option></select>` : ''}<select data-type-index="${index}" aria-label="${escapeHtml(entry.note)}的收支类型"><option value="expense"${entry.type === 'expense' ? ' selected' : ''}>支出</option><option value="income"${entry.type === 'income' ? ' selected' : ''}>收入</option><option value="excluded"${entry.type === 'excluded' ? ' selected' : ''}>不计收支</option></select><select data-category-index="${index}" aria-label="${escapeHtml(entry.note)}的分类"${entry.type !== 'expense' ? ' hidden' : ''}>${cats.map(category => `<option value="${escapeHtml(category)}"${category === entry.category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></div><span class="import-item-amount ${entry.type === 'income' ? 'income' : ''}">${entry.type === 'income' ? '+' : entry.type === 'excluded' ? '' : '−'}${money(entry.amount)}</span></div>`;
  }).join('');
  [...$('importPreview').querySelectorAll('.import-item')].forEach((row, index) => {
    const entry = pendingImport[index];
    if (entry.matchedRuleId) row.querySelector('small').append(' · 已匹配分类规则');
    const select = document.createElement('select');
    select.dataset.importAccountIndex = String(index);
    select.setAttribute('aria-label', `${entry.note}的账户`);
    select.innerHTML = '<option value="">未指定账户</option>' + data.accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
    select.value = entry.accountId || '';
    row.querySelector('.import-item-main').append(select);
  });
  applyImportFilter();
}
$('importControls').onclick = event => {
  const filter = event.target.closest('[data-import-filter]');
  if (filter) { importFilter = filter.dataset.importFilter; applyImportFilter(); return; }
  const checked = event.target.id === 'selectVisibleImport' ? true : event.target.id === 'clearVisibleImport' ? false : null;
  if (checked === null) return;
  $('importPreview').querySelectorAll('.import-item:not([data-filtered="true"]) input[data-import-index]').forEach(box => { box.checked = checked; });
  updateImportSelection();
};
$('billFile').onchange = async event => {
  pendingImport = [];
  $('importPreview').replaceChildren();
  $('importControls').hidden = true;
  $('confirmImport').disabled = true;
  const file = event.target.files[0];
  if (!file) return;
  $('billFileName').textContent = file.name;
  $('importSummary').textContent = '正在识别账单…';
  try {
    const rows = await JianjiBillImport.readBillFile(file);
    const result = JianjiBillImport.parseBill(rows, file.name, data.entries.map(entry => entry.importKey).filter(Boolean));
    pendingImport = result.entries.map(raw => {
      const entry = JianjiFeatures.classifyImport(raw, data.importRules.filter(rule => cats.includes(rule.category)));
      entry.accountId = data.accounts.find(account => account.name === entry.source)?.id || '';
      const duplicate = JianjiFeatures.possibleDuplicates(entry, liveEntries())[0];
      return { ...entry, duplicateMatchId: duplicate?.id ?? null, duplicateHint: duplicate ? duplicate.note || '同日同金额记录' : '' };
    });
    const suspicious = pendingImport.filter(entry => entry.duplicateMatchId !== null).length;
    $('importSummary').textContent = `识别为${result.source}账单：${result.entries.length} 笔可预览，${result.skipped.duplicate} 笔平台订单重复，${suspicious} 笔疑似与手动账目重复（默认暂不导入），${result.skipped.ignored} 行未计入。请逐笔核对。`;
    $('importControls').hidden = pendingImport.length === 0;
    renderImportPreview();
    updateImportSelection();
  } catch (error) {
    $('importSummary').textContent = error.message || '账单识别失败';
  }
};
$('importPreview').onchange = event => {
  if (event.target.matches('[data-import-account-index]')) pendingImport[Number(event.target.dataset.importAccountIndex)].accountId = event.target.value;
  if (event.target.matches('[data-category-index]')) pendingImport[Number(event.target.dataset.categoryIndex)].category = event.target.value;
  if (event.target.matches('[data-type-index]')) {
    const item = pendingImport[Number(event.target.dataset.typeIndex)];
    item.type = event.target.value;
    event.target.parentElement.querySelector('[data-category-index]').hidden = item.type !== 'expense';
    const amount = event.target.closest('.import-item').querySelector('.import-item-amount');
    amount.classList.toggle('income', item.type === 'income');
    amount.textContent = `${item.type === 'income' ? '+' : item.type === 'excluded' ? '' : '−'}${money(item.amount)}`;
  }
  updateImportSelection();
};
$('confirmImport').onclick = async () => {
  const selected = [...$('importPreview').querySelectorAll('[data-import-index]:checked')].map(box => ({ entry: pendingImport[Number(box.dataset.importIndex)], action: 'new' }))
    .concat([...$('importPreview').querySelectorAll('[data-reconcile-index]')].filter(select => select.value !== 'skip').map(select => ({ entry: pendingImport[Number(select.dataset.reconcileIndex)], action: select.value })));
  if (!selected.length) return;
  const before = data.entries;
  const replacement = [...before];
  let added = 0, merged = 0;
  for (const { entry, action } of selected) {
    if (action === 'merge') {
      const index = replacement.findIndex(item => item.id === entry.duplicateMatchId && !item.deletedAt && !item.importKey);
      if (index < 0 || replacement[index].type !== entry.type) return toast('待关联的手动账目已变化，请重新选择账单');
      replacement[index] = { ...replacement[index], source: entry.source, importKey: entry.importKey, transactionTime: entry.transactionTime, accountId: entry.accountId || replacement[index].accountId || '', reconciledAt: new Date().toISOString() };
      merged++;
    } else {
      const { duplicateMatchId, duplicateHint, matchedRuleId, ...record } = entry;
      replacement.push({ ...record, id: Date.now() + Math.random() });
      added++;
    }
  }
  data.entries = replacement;
  try { await save(); }
  catch {
    data.entries = before;
    toast('导入保存失败，请缩小账单时间范围');
    return;
  }
  const latest = selected.reduce((date, item) => item.entry.date > date ? item.entry.date : date, '');
  view = new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1);
  close('importModal');
  render();
  switchPage('details');
  toast(`已新增 ${added} 笔，关联 ${merged} 笔手动账目`);
};
let pendingRestore = null;
$('backupReminder').onclick = event => { if (event.target.id === 'backupReminderAction') $('openBackup').click(); };
$('openBackup').onclick = () => {
  pendingRestore = null;
  $('backupPassword').value = '';
  $('backupFile').value = '';
  $('backupFileName').textContent = '尚未选择文件';
  $('backupStatus').textContent = '';
  $('restoreBackup').textContent = '验证并恢复';
  $('backupInterval').value = String(data.backupIntervalDays);
  open('backupModal');
};
$('backupInterval').onchange = async () => {
  const before = data.backupIntervalDays;
  data.backupIntervalDays = Number($('backupInterval').value);
  try { await save(); } catch { data.backupIntervalDays = before; $('backupInterval').value = String(before); return toast('提醒设置保存失败'); }
  render();
};
for (const id of ['backupPassword', 'backupFile']) $(id).addEventListener('change', () => { pendingRestore = null; $('restoreBackup').textContent = '验证并恢复'; });
$('chooseBackupFile').onclick = () => $('backupFile').click();
$('backupFile').addEventListener('change', () => { $('backupFileName').textContent = $('backupFile').files[0]?.name || '尚未选择文件'; });
async function saveBackupFile(name, contents) {
  if (window.Capacitor?.getPlatform?.() === 'android' && window.Capacitor.nativePromise) {
    await window.Capacitor.nativePromise('BackupFile', 'save', { name, contents });
  } else {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
$('exportBackup').onclick = async () => {
  const password = $('backupPassword').value;
  if (password.length < 8) return toast('备份密码至少 8 位');
  $('exportBackup').disabled = true;
  $('backupStatus').textContent = '正在收集账目与图片并加密…';
  try {
    const photos = [];
    const ids = [...new Set(data.entries.map(entry => entry.photoId).filter(Boolean))];
    for (const id of ids) {
      const blob = await photoStore('get', id);
      if (!blob) throw new Error('有记录图片无法读取，请检查本机图片存储');
      photos.push({ id, mime: blob.type || 'image/jpeg', base64: JianjiBackup.toBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    const content = await JianjiBackup.createBackup(data, photos, password);
    const checked = await JianjiBackup.readBackup(content, password);
    if (checked.data.entries.length !== data.entries.length || checked.photos.length !== photos.length) throw new Error('备份校验失败，请重试');
    if (content.length > 50 * 1024 * 1024) throw new Error('备份超过 50 MB，请先减少账目图片再备份');
    await saveBackupFile(`简记备份-${new Date().toLocaleDateString('en-CA')}.jianji`, content);
    data.lastBackupAt = new Date().toISOString();
    try { await save(); } catch { /* The backup file was saved even if the reminder timestamp could not be persisted. */ }
    render();
    $('backupStatus').textContent = `备份已保存：${data.entries.length} 笔账目（含最近删除）、${photos.length} 张图片。请妥善保管文件和密码。`;
  } catch (error) { $('backupStatus').textContent = error.message || '备份失败'; }
  finally { $('exportBackup').disabled = false; }
};
$('restoreBackup').onclick = async () => {
  const password = $('backupPassword').value;
  const file = $('backupFile').files[0];
  if (!file || !password) return toast('请选择备份文件并填写密码');
  $('restoreBackup').disabled = true;
  try {
    if (!pendingRestore) {
      if (!file.name.toLowerCase().endsWith('.jianji')) throw new Error('请选择 .jianji 备份文件');
      if (file.size > 50 * 1024 * 1024) throw new Error('备份文件超过 50 MB，无法在当前版本恢复');
      pendingRestore = await JianjiBackup.readBackup(await file.text(), password);
      $('backupStatus').textContent = `已验证：${pendingRestore.data.entries.length} 笔账目、${pendingRestore.photos.length} 张图片。再次点击将替换当前账本。`;
      $('restoreBackup').textContent = '确认替换当前账本';
    } else {
      const restored = pendingRestore;
      const photoIds = new Map();
      const written = [];
      let committed = false;
      try {
        for (const [index, photo] of restored.photos.entries()) {
          const id = `restore-${Date.now()}-${index}`;
          const blob = new Blob([JianjiBackup.fromBase64(photo.base64)], { type: photo.mime });
          await photoStore('put', id, blob);
          photoIds.set(photo.id, id);
          written.push(id);
        }
        const replacement = structuredClone(restored.data);
        replacement.lastBackupAt = new Date().toISOString();
        for (const entry of replacement.entries) {
          if (entry.photoId) {
            if (!photoIds.has(entry.photoId)) throw new Error('备份中缺少账目关联的图片');
            entry.photoId = photoIds.get(entry.photoId);
          }
        }
        await pendingWrites;
        await JianjiStore.write(replacement);
        committed = true;
        data = replacement;
        normalizeData();
        refreshCategoryUI(); refreshAccountUI(); render(); close('backupModal'); toast('账本已恢复');
        pendingRestore = null;
      } catch (error) {
        if (!committed) for (const id of written) photoStore('delete', id).catch(() => {});
        else throw new Error('账本已恢复，但页面刷新失败，请重新打开应用');
        throw error;
      }
    }
  } catch (error) { $('backupStatus').textContent = error.message || '恢复失败；当前账本未更改'; pendingRestore = null; $('restoreBackup').textContent = '验证并恢复'; }
  finally { $('restoreBackup').disabled = false; }
};
function renderTrash() {
  const deleted = data.entries.filter(entry => entry.deletedAt).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  $('trashList').innerHTML = deleted.map(entry => `<div class="trash-row"><div class="trash-row-main"><b>${escapeHtml(entry.note || entry.category || '未命名账目')}</b><small>${escapeHtml(entry.date)} · ${money(entry.amount)} · 删除于 ${escapeHtml(String(entry.deletedAt).slice(0, 10))}</small></div><button data-trash-restore="${escapeHtml(entry.id)}">恢复</button><button data-trash-purge="${escapeHtml(entry.id)}">永久删除</button></div>`).join('') || '<div class="empty">没有已删除账目</div>';
}
$('openTrash').onclick = () => { renderTrash(); open('trashModal'); };
$('trashList').onclick = async event => {
  const restore = event.target.closest('[data-trash-restore]');
  const purge = event.target.closest('[data-trash-purge]');
  if (!restore && !purge) return;
  const id = restore?.dataset.trashRestore || purge?.dataset.trashPurge;
  const entry = data.entries.find(item => String(item.id) === id && item.deletedAt);
  if (!entry) return;
  if (restore) {
    if (entry.type === 'refund') {
      const original = data.entries.find(item => String(item.id) === String(entry.refundOf) && item.type === 'expense' && !item.deletedAt);
      if (!original || Math.round(entry.amount * 100) > Math.round(JianjiFeatures.refundAvailable(original, entry.category, data.entries, entry.id) * 100)) return toast('原支出不存在或可退金额不足，无法恢复');
    }
    const old = entry.deletedAt;
    delete entry.deletedAt;
    try { await save(); } catch { entry.deletedAt = old; return toast('恢复失败，请检查存储空间'); }
    toast('账目已恢复');
  } else {
    if (entry.type === 'expense' && data.entries.some(item => item.type === 'refund' && String(item.refundOf) === String(entry.id))) return toast('请先永久删除关联退款');
    if (!confirm('永久删除后无法从最近删除恢复，确定继续吗？')) return;
    const old = data.entries;
    data.entries = old.filter(item => item !== entry);
    try { await save(); } catch { data.entries = old; return toast('删除失败，请检查存储空间'); }
    if (entry.photoId && !data.entries.some(item => item.photoId === entry.photoId)) photoStore('delete', entry.photoId).catch(() => {});
    toast('已永久删除');
  }
  renderTrash(); render();
};
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => close(button.dataset.close));
document.querySelectorAll('.modalback').forEach(modal => modal.onclick = e => { if (e.target === modal) close(modal.id); });
$('entryForm').onsubmit = async e => {
  e.preventDefault();
  const amount = Number($('entryAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const original = editingId === null ? null : data.entries.find(item => String(item.id) === editingId);
  if (editingId !== null && !original) return toast('记录不存在，请重新打开');
  const entry = { ...original, id: original?.id ?? Date.now() + Math.random(), type: entryType, amount, date: $('entryDate').value, category: entryType === 'expense' ? $('entryCategory').value : '', note: $('entryNote').value.trim(), accountId: $('entryAccount').value || '' };
  if (entryType === 'expense' && $('splitEnabled').checked) {
    const parts = splitRows();
    if (!JianjiFeatures.validSplits(amount, parts, cats)) return toast('请让各类别金额相加等于总金额，且类别不重复');
    entry.splits = parts;
    entry.category = parts[0].category;
  } else delete entry.splits;
  if (original?.type === 'expense') {
    const linked = data.entries.filter(item => item.type === 'refund' && !item.deletedAt && String(item.refundOf) === String(original.id));
    if (linked.length && entry.type !== 'expense') return toast('已有退款关联，不能改为其他收支类型');
    for (const category of new Set(linked.map(item => item.category))) {
      const allowed = JianjiFeatures.expenseParts(entry).find(part => part.category === category)?.amount || 0;
      const returned = linked.filter(item => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0);
      if (Math.round(returned * 100) > Math.round(allowed * 100)) return toast('修改后该类别的退款将超过原支出，请先调整退款');
    }
  }
  const paymentNotice = paymentDraftId ? paymentNotices.find(item => item.id === paymentDraftId) : null;
  if (paymentNotice && !original) {
    entry.source = paymentNotice.source;
    entry.paymentNoticeId = paymentNotice.id;
    entry.paymentReceivedAt = paymentNotice.receivedAt;
  }
  if ($('removeStoredPhoto').checked) delete entry.photoId;
  if (selectedImage) {
    entry.photoId = `${entry.id}-${Date.now()}`;
    try { await photoStore('put', entry.photoId, selectedImage); }
    catch { toast('图片保存失败，请检查浏览器存储空间'); return; }
  }
  const index = original ? data.entries.indexOf(original) : -1;
  try {
    if (index >= 0) data.entries[index] = entry;
    else data.entries.push(entry);
    await save();
  }
  catch {
    if (index >= 0) data.entries[index] = original;
    else data.entries.pop();
    if (selectedImage) photoStore('delete', entry.photoId).catch(() => {});
    toast('记录保存失败，请检查浏览器存储空间');
    return;
  }
  if (original?.photoId && original.photoId !== entry.photoId) photoStore('delete', original.photoId).catch(() => {});
  if (paymentNotice) {
    try { await paymentPlugin('dismiss', { id: paymentNotice.id }); } catch { /* Saved entries still hide their matching notice. */ }
    paymentDraftId = null;
    refreshPaymentNotices();
  }
  close('entryModal');
  clearSelectedImage();
  render();
  toast(original ? '记录已更新' : '已保存记录');
};
$('budgetForm').onsubmit = async e => {
  e.preventDefault();
  const amount = Number($('budgetAmount').value);
  if (!Number.isFinite(amount) || amount < 0) return;
  data.budgets[key()] ??= {};
  data.budgets[key()][$('budgetCategory').value] = amount;
  try { await save(); } catch { return toast('预算保存失败'); }
  close('budgetModal'); render(); toast('预算已更新');
};
let refundOriginalId = null;
let editingRefundId = null;
function updateRefundAvailable() {
  const original = data.entries.find(item => String(item.id) === refundOriginalId);
  if (!original) return;
  const available = JianjiFeatures.refundAvailable(original, $('refundCategory').value, data.entries, editingRefundId);
  $('refundAvailable').textContent = `此类别还可退 ${money(available)}`;
}
function openRefund(original, refund = null) {
  refundOriginalId = String(original.id);
  editingRefundId = refund ? String(refund.id) : null;
  $('refundForm').reset();
  $('refundTitle').textContent = refund ? '编辑退款' : '记录退款';
  $('refundOriginal').textContent = `关联原支出：${original.note || '未命名支出'} · ${money(original.amount)} · ${original.date}`;
  const parts = JianjiFeatures.expenseParts(original);
  $('refundCategory').innerHTML = parts.map(part => `<option value="${escapeHtml(part.category)}">${escapeHtml(part.category)}</option>`).join('');
  $('refundAccount').innerHTML = '<option value="">未指定账户</option>' + data.accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
  $('refundCategory').value = refund?.category || parts.find(part => JianjiFeatures.refundAvailable(original, part.category, data.entries) > 0)?.category || parts[0]?.category;
  $('refundAmount').value = refund?.amount || '';
  $('refundDate').value = refund?.date || new Date().toLocaleDateString('en-CA');
  $('refundAccount').value = refund?.accountId || original.accountId || '';
  $('refundNote').value = refund?.note || '';
  updateRefundAvailable();
  open('refundModal');
}
$('refundCategory').onchange = updateRefundAvailable;
$('refundForm').onsubmit = async event => {
  event.preventDefault();
  const original = data.entries.find(item => String(item.id) === refundOriginalId && item.type === 'expense' && !item.deletedAt);
  if (!original) return toast('原支出已不存在');
  const amount = Number($('refundAmount').value);
  const category = $('refundCategory').value;
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) > Math.round(JianjiFeatures.refundAvailable(original, category, data.entries, editingRefundId) * 100)) return toast('退款金额超过此类别的剩余可退金额');
  const previous = editingRefundId ? data.entries.find(item => String(item.id) === editingRefundId && item.type === 'refund') : null;
  const entry = { ...previous, id: previous?.id ?? Date.now() + Math.random(), type: 'refund', refundOf: original.id, amount, date: $('refundDate').value, category, accountId: $('refundAccount').value, note: $('refundNote').value.trim(), source: original.source || '' };
  const index = previous ? data.entries.indexOf(previous) : -1;
  if (index >= 0) data.entries[index] = entry; else data.entries.push(entry);
  try { await save(); } catch { if (index >= 0) data.entries[index] = previous; else data.entries.pop(); return toast('退款保存失败'); }
  close('refundModal'); render(); toast(previous ? '退款已更新' : '退款已记录');
};
async function handleRecordClick(e) {
  if (e.target.matches('.record-photo')) { window.open(e.target.src, '_blank'); return; }
  const refundButton = e.target.closest('[data-refund]');
  if (refundButton) {
    const original = data.entries.find(item => String(item.id) === refundButton.dataset.refund && item.type === 'expense' && !item.deletedAt);
    if (!original) return;
    if (!JianjiFeatures.expenseParts(original).some(part => JianjiFeatures.refundAvailable(original, part.category, data.entries) > 0)) return toast('这笔支出已全部退款');
    openRefund(original);
    return;
  }
  const editButton = e.target.closest('[data-edit]');
  if (editButton) {
    const entry = data.entries.find(item => String(item.id) === editButton.dataset.edit);
    if (!entry) return;
    if (entry.type === 'refund') {
      const original = data.entries.find(item => String(item.id) === String(entry.refundOf) && !item.deletedAt);
      if (!original) return toast('原支出已不存在');
      openRefund(original, entry);
      return;
    }
    if (entry.transferFrom) {
      $('manageAccounts').click();
      editingTransferId = String(entry.id);
      $('transferFrom').value = entry.transferFrom;
      $('transferTo').value = entry.transferTo;
      $('transferAmount').value = entry.amount;
      $('transferDate').value = entry.date;
      $('transferNote').value = entry.note || '';
      $('transferForm').querySelector('button').textContent = '保存转账修改';
      $('transferForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    editingId = String(entry.id);
    paymentDraftId = null;
    $('entryModalTitle').textContent = '编辑记录';
    $('entryForm').reset();
    $('splitRows').replaceChildren();
    clearSelectedImage();
    setType(entry.type);
    $('entryAmount').value = entry.amount;
    $('entryDate').value = entry.date;
    $('entryCategory').value = cats.includes(entry.category) ? entry.category : '其他';
    $('splitEnabled').checked = Array.isArray(entry.splits) && entry.splits.length > 0;
    if ($('splitEnabled').checked) renderSplitRows(entry.splits);
    updateSplitUI();
    $('entryAccount').value = entry.accountId || '';
    $('entryNote').value = entry.note || '';
    $('removeStoredPhotoField').hidden = !entry.photoId;
    $('removeStoredPhoto').checked = false;
    $('photoName').textContent = entry.photoId ? '已保存原图片；选择新图片可替换' : '可拍摄物品，也可选择相册里的网购截图';
    open('entryModal');
    return;
  }
  const button = e.target.closest('[data-delete]');
  if (!button || !confirm('确定删除这笔记录吗？')) return;
  const entry = data.entries.find(item => String(item.id) === button.dataset.delete && !item.deletedAt);
  if (!entry) return;
  if (entry.type === 'expense' && data.entries.some(item => item.type === 'refund' && String(item.refundOf) === String(entry.id))) return toast('请先永久删除关联退款，再删除原支出');
  entry.deletedAt = new Date().toISOString();
  try { await save(); } catch { delete entry.deletedAt; return toast('删除失败，请检查存储空间'); }
  render(); toast('已移到最近删除，可在账本设置中恢复');
}
document.querySelectorAll('.record-list').forEach(container => container.onclick = handleRecordClick);
const onAndroid = () => window.Capacitor?.getPlatform?.() === 'android' && Boolean(window.Capacitor.nativePromise);
const paymentPlugin = (method, args = {}) => window.Capacitor.nativePromise('PaymentNotification', method, args);
function renderPaymentNotices() {
  const pending = paymentNotices.filter(item => !data.entries.some(entry => entry.paymentNoticeId === item.id));
  $('paymentNotices').innerHTML = pending.map(item => {
    const nearNotice = pending.some(other => other.id !== item.id && other.source === item.source && Math.round(other.amount * 100) === Math.round(item.amount * 100) && Math.abs(other.receivedAt - item.receivedAt) < 120000);
    const nearEntry = liveEntries().some(entry => entry.type === 'expense' && entry.source === item.source && Math.round(Number(entry.amount) * 100) === Math.round(item.amount * 100) && (entry.paymentReceivedAt ? Math.abs(entry.paymentReceivedAt - item.receivedAt) < 120000 : entry.date === new Date(item.receivedAt).toLocaleDateString('en-CA')));
    return `<div class="payment-notice"><div class="payment-notice-main"><b>${escapeHtml(item.source)} · ${money(item.amount)}</b><small>${escapeHtml(new Date(item.receivedAt).toLocaleString('zh-CN'))} · ${nearNotice || nearEntry ? '疑似重复，请核对后再记入' : '请核对金额与类别'}</small></div><button type="button" data-payment-confirm="${escapeHtml(item.id)}">确认</button><button type="button" data-payment-dismiss="${escapeHtml(item.id)}">忽略</button></div>`;
  }).join('') || '<div class="empty">暂无待确认的支付通知</div>';
}
async function refreshPaymentNotices() {
  if (!onAndroid()) return;
  $('paymentCard').hidden = false;
  try {
    const [status, result] = await Promise.all([paymentPlugin('status'), paymentPlugin('list')]);
    $('paymentSettings').textContent = status.enabled ? '权限设置' : '开启通知读取';
    $('paymentStatus').textContent = status.enabled
      ? '已开启：简记只在本机保留识别出的平台、金额和时间。通知可能遗漏或识别不准，请确认后入账。'
      : '未开启：点击开启通知读取，在系统设置中授权简记。此权限允许应用读取设备通知；简记只处理微信和支付宝的支付通知。';
    paymentNotices = Array.isArray(result.notices) ? result.notices : [];
    renderPaymentNotices();
  } catch { $('paymentStatus').textContent = '暂时无法读取支付通知，请稍后重试。'; }
}
$('paymentSettings').onclick = async () => {
  try { await paymentPlugin('openSettings'); } catch { toast('无法打开通知读取权限设置'); }
};
$('paymentNotices').onclick = async event => {
  const confirmButton = event.target.closest('[data-payment-confirm]');
  if (confirmButton) {
    const item = paymentNotices.find(notice => notice.id === confirmButton.dataset.paymentConfirm);
    if (!item) return refreshPaymentNotices();
    openNewEntry('其他');
    paymentDraftId = item.id;
    $('entryAmount').value = Number(item.amount).toFixed(2);
    $('entryDate').value = new Date(item.receivedAt).toLocaleDateString('en-CA');
    $('entryNote').value = `${item.source}支付`;
    return;
  }
  const dismissButton = event.target.closest('[data-payment-dismiss]');
  if (!dismissButton) return;
  try { await paymentPlugin('dismiss', { id: dismissButton.dataset.paymentDismiss }); await refreshPaymentNotices(); }
  catch { toast('暂时无法忽略这条通知'); }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPaymentNotices(); });
window.addEventListener('focus', refreshPaymentNotices);
async function start() {
  try {
    data = await JianjiStore.initialize();
    normalizeData();
    refreshCategoryUI();
    refreshAccountUI();
    render();
    switchPage(location.hash.slice(1), false);
    refreshPaymentNotices();
  } catch (error) {
    document.querySelector('main').innerHTML = `<section class="card"><h2>账本暂时无法打开</h2><p>${escapeHtml(error.message || '数据库读取失败')}</p><p>请保留应用数据，重新打开应用后重试。</p></section>`;
  }
}
start();
