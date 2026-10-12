const baseCats = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '其他'];
let cats = [...baseCats];
const iconFiles = { 餐饮: 'utensils', 交通: 'bus-front', 购物: 'shopping-bag', 居住: 'house', 娱乐: 'clapperboard', 医疗: 'heart-pulse', 其他: 'shapes', income: 'wallet', excluded: 'arrow-left-right' };
const iconTones = { 餐饮: 'coral', 交通: 'sky', 购物: 'violet', 居住: 'amber', 娱乐: 'pink', 医疗: 'mint', 其他: 'slate', income: 'mint', excluded: 'slate' };
const customIcon = category => data?.customCategories?.find(item => item.name === category)?.icon;
const iconMarkup = category => `<span class="category-glyph" style="--glyph:url('assets/icons/${iconFiles[category] || iconFiles[customIcon(category)] || iconFiles.其他}.svg')" aria-hidden="true"></span>`;
const toneClass = category => `tone-${iconTones[category] || iconTones[customIcon(category)] || 'slate'}`;
const $ = id => document.getElementById(id);
const onAndroid = () => window.Capacitor?.getPlatform?.() === 'android' && Boolean(window.Capacitor.nativePromise);
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
let data = { entries: [], budgets: {}, customCategories: [], recurring: [], recurringAcknowledged: {}, accounts: [], importRules: [], templates: [], annualPlans: [], cashFlowPlans: [], projects: [], receivables: [], entryHistory: [], lastBackupAt: '' };
function normalizeData() {
  if (!Array.isArray(data.entries)) data.entries = [];
  if (!data.budgets || typeof data.budgets !== 'object') data.budgets = {};
  if (!Array.isArray(data.customCategories)) data.customCategories = [];
  if (!Array.isArray(data.recurring)) data.recurring = [];
  if (!data.recurringAcknowledged || typeof data.recurringAcknowledged !== 'object') data.recurringAcknowledged = {};
  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!Array.isArray(data.importRules)) data.importRules = [];
  if (!Array.isArray(data.templates)) data.templates = [];
  if (!Array.isArray(data.annualPlans)) data.annualPlans = [];
  if (!Array.isArray(data.savingsGoals)) data.savingsGoals = [];
  if (!Array.isArray(data.cashFlowPlans)) data.cashFlowPlans = [];
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!Array.isArray(data.receivables)) data.receivables = [];
  if (!Array.isArray(data.entryHistory)) data.entryHistory = [];
  if (typeof data.lastEntryAccount !== 'string') data.lastEntryAccount = '';
  if (typeof data.missingCheckEnabled !== 'boolean') data.missingCheckEnabled = true;
  if (typeof data.missingCheckDismissedUntil !== 'string') data.missingCheckDismissedUntil = '';
  if (typeof data.lastBackupAt !== 'string') data.lastBackupAt = '';
  if (![7, 30, 90].includes(Number(data.backupIntervalDays))) data.backupIntervalDays = 30;
}
const liveEntries = () => data.entries.filter(entry => !entry.deletedAt);
const refreshCats = () => { cats = [...baseCats, ...data.customCategories.map(item => item.name)]; };
refreshCats();
const money = n => `${Number(n) < 0 ? '−' : ''}¥ ${Math.abs(Number(n || 0)).toFixed(2)}`;
const key = () => `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}`;
let pendingWrites = Promise.resolve();
let autoBackupConfigured = false;
let lastAutoBackupAt = '';
let autoBackupTimer = null;
const save = () => {
  const snapshot = structuredClone(data);
  const operation = pendingWrites.then(() => JianjiStore.write(snapshot));
  pendingWrites = operation.catch(() => {});
  operation.then(() => scheduleAutoBackup()).catch(() => {});
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
  container.innerHTML = list.map((e, index) => `${id === 'records' && (index === 0 || list[index - 1].date !== e.date) ? dayHeading(e.date, list) : ''}<div class="record"><div class="icon ${toneClass(e.type === 'expense' ? e.category : e.type === 'refund' ? 'income' : e.type)}">${iconMarkup(e.type === 'expense' ? e.category : e.type === 'refund' ? 'income' : e.type)}</div><div class="recordtext"><b></b><small></small></div>${e.photoId ? `<img class="record-photo" data-photo-id="${escapeHtml(e.photoId)}" alt="记录图片" hidden>` : ''}<div class="amount ${e.type === 'income' || e.type === 'refund' ? 'income' : e.type === 'excluded' ? 'excluded' : ''}">${e.type === 'income' || e.type === 'refund' ? '+' : e.type === 'excluded' ? '' : '−'}${money(e.amount)}</div><details class="record-menu"><summary aria-label="账目操作">${uiIcon('more')}</summary><div class="actions">${e.type === 'expense' ? `<button data-refund="${escapeHtml(e.id)}" aria-label="为这笔支出记退款">退款</button>` : ''}<button data-edit="${escapeHtml(e.id)}" aria-label="编辑记录">编辑</button><button data-delete="${escapeHtml(e.id)}" aria-label="删除记录">删除</button></div></details></div>`).join('') || `<div class="empty">${emptyText}</div>`;
  [...container.querySelectorAll('.record')].forEach((row, index) => {
    const entry = list[index];
    row.querySelector('b').textContent = entry.note || (entry.transferFrom ? '账户转账' : entry.type === 'income' ? '月度收入' : entry.type === 'refund' ? '退款' : Array.isArray(entry.splits) && entry.splits.length ? '多类别支出' : entry.category);
    const accountName = id => data.accounts.find(account => account.id === id)?.name || '未知账户';
    const accountText = entry.transferFrom ? ` · ${accountName(entry.transferFrom)} → ${accountName(entry.transferTo)}` : entry.accountId ? ` · ${accountName(entry.accountId)}` : '';
    const loanText = entry.receivableId ? ` · ${entry.receivableKind === 'loan' ? '借出' : '收回借款'}` : '';
    const projectText = (entry.projectIds || []).map(id => data.projects.find(project => project.id === id)?.name).filter(Boolean).join('、');
    row.querySelector('small').textContent = entry.date + ' · ' + (entry.transferFrom ? '账户转账' : entry.type === 'income' ? '收入' : entry.type === 'excluded' ? '不计收支' : entry.type === 'refund' ? `${entry.category}退款` : Array.isArray(entry.splits) && entry.splits.length ? entry.splits.map(part => `${part.category}${money(part.amount)}`).join('、') : entry.category) + (entry.merchant ? ` · ${entry.merchant}` : '') + (entry.source ? ` · ${entry.source}` : '') + loanText + accountText + (projectText ? ` · #${projectText}` : '');
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
  const lastSavedAt = [data.lastBackupAt, lastAutoBackupAt].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || '';
  const days = lastSavedAt ? Math.floor((Date.now() - Date.parse(lastSavedAt)) / 86400000) : Infinity;
  const needsBackup = liveEntries().length > 0 && (!Number.isFinite(days) || days >= data.backupIntervalDays);
  $('backupReminder').hidden = !needsBackup;
  $('backupReminder').innerHTML = needsBackup ? `${lastSavedAt ? `已超过 ${days} 天没有保存备份。` : '这个账本还没有保存过加密备份。'}<button type="button" id="backupReminderAction">现在备份</button>` : '';
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
  const projectId = $('recordProject').value;
  const detailList = $('allMonths').checked ? liveEntries().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id) : list;
  const filtered = detailList.filter(e => (detailFilter === 'all' || e.type === detailFilter || detailFilter === 'expense' && e.type === 'refund')
    && (!search || `${e.note || ''} ${e.merchant || ''} ${e.source || ''} ${e.category || ''}`.toLocaleLowerCase().includes(search))
    && (!source || (source === 'manual' ? !e.source : e.source === source))
    && (!category || e.category === category || e.type === 'expense' && JianjiFeatures.expenseParts(e).some(part => part.category === category))
    && (!projectId || (e.projectIds || []).includes(projectId)));
  $('count').textContent = `共 ${filtered.length} 笔`;
  $('filteredTotals').textContent = `筛选合计：收入 ${money(filtered.filter(e => e.type === 'income').reduce((sum,e) => sum + Number(e.amount),0))} · 净支出 ${money(JianjiFeatures.netExpense(filtered))}`;
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
  renderTemplates();
  renderAnnualPlans();
  renderMissingCheck();
  renderCashFlow();
  renderProjects();
  renderReceivables();
  renderTodo();
  renderSavings();
  renderRecordList('recentRecords', list.slice(0, 3), '这个月还没有记录，点「记一笔」开始');
  renderRecordList('records', filtered, filtered.length ? '' : detailFilter === 'all' ? '这个月还没有记录，点「记一笔」开始' : '这个月没有这类记录');
  renderStats(list, income, expense);
  loadVisiblePhotos();
}
function switchPage(page, updateHash = true) {
  activePage = ['home', 'details', 'stats', 'features'].includes(page) ? page : 'home';
  for (const name of ['home', 'details', 'stats', 'features']) $(name + 'Page').hidden = name !== activePage;
  $('add').hidden = activePage === 'home' || activePage === 'features';
  document.querySelectorAll('[data-page]').forEach(button => {
    const selected = button.dataset.page === activePage;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (updateHash) location.hash = activePage;
  window.scrollTo(0, 0);
}
function open(id) { if (id === 'entryModal') renderEntryCategories(); if (id !== 'featureDetailModal') close('featureDetailModal'); $(id).classList.add('show'); }
function close(id) { $(id).classList.remove('show'); }
function setType(type) {
  entryType = type;
  $('expenseTab').classList.toggle('active', type === 'expense');
  $('incomeTab').classList.toggle('active', type === 'income');
  $('excludedTab').classList.toggle('active', type === 'excluded');
  $('categoryField').style.display = type === 'expense' ? 'block' : 'none';
  $('splitField').hidden = type !== 'expense';
  $('merchantField').hidden = type !== 'expense';
  $('rememberMerchantField').hidden = type !== 'expense';
  if (type !== 'expense') $('merchantRuleSuggestion').hidden = true;
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
  $('recognizeImage').hidden = true;
  $('ocrStatus').textContent = '';
}
function selectImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('请选择图片文件');
  if (file.size > 15 * 1024 * 1024) return toast('图片请小于 15 MB');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  $('entryMore').open = true;
  selectedImage = file;
  previewUrl = URL.createObjectURL(file);
  $('photoPreview').src = previewUrl;
  $('photoPreview').hidden = false;
  $('photoName').textContent = file.name || '已选择图片';
  $('recognizeImage').hidden = !onAndroid();
  $('ocrStatus').textContent = '';
}
function preferredCategories() {
  const counts = new Map();
  for (const entry of liveEntries().filter(item => item.type === 'expense').sort((a,b) => b.date.localeCompare(a.date)).slice(0, 100)) {
    for (const part of JianjiFeatures.expenseParts(entry)) counts.set(part.category, (counts.get(part.category) || 0) + 1);
  }
  return [...cats].sort((a,b) => (counts.get(b) || 0) - (counts.get(a) || 0));
}
function dayHeading(date, list) {
  const today = new Date(), yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const label = date === today.toLocaleDateString('en-CA') ? '今天' : date === yesterday.toLocaleDateString('en-CA') ? '昨天' : date;
  const entries = list.filter(entry => entry.date === date);
  return `<div class="day-heading"><b>${escapeHtml(label)}</b><small>收入 ${money(entries.filter(entry => entry.type === 'income').reduce((sum,entry) => sum + Number(entry.amount),0))} · 净支出 ${money(JianjiFeatures.netExpense(entries))}</small></div>`;
}
function refreshCategoryUI() {
  refreshCats();
  for (const id of ['entryCategory', 'budgetCategory', 'recordCategory', 'recurringCategory', 'ruleCategory', 'templateCategory', 'annualPlanCategory', 'subscriptionCategory']) {
    const select = $(id);
    const old = select.value;
    select.innerHTML = (id === 'recordCategory' ? '<option value="">全部类别</option>' : id === 'annualPlanCategory' ? '<option value="">不关联类别</option>' : '') + (id === 'entryCategory' ? preferredCategories() : cats).map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    if (cats.includes(old)) select.value = old;
  }
  $('categoryShortcuts').innerHTML = preferredCategories().map(category => `<button type="button" class="category-shortcut ${toneClass(category)}" data-quick-category="${escapeHtml(category)}" aria-label="记录${escapeHtml(category)}支出"><span class="shortcut-icon">${iconMarkup(category)}</span><span>${escapeHtml(category)}</span></button>`).join('');
  renderEntryCategories();
  $('customCategoryIcon').innerHTML = baseCats.map(category => `<option value="${category}">${category}</option>`).join('');
}
function renderCustomCategories() {
  $('customCategoryList').innerHTML = data.customCategories.map((item, index) => `<div class="settings-row"><span class="category-mini ${toneClass(item.name)}">${iconMarkup(item.name)}</span><input data-category-edit="${index}" maxlength="12" value="${escapeHtml(item.name)}" aria-label="分类名称"><button data-category-rename="${index}">改名</button><button data-category-delete="${index}">删除</button></div>`).join('') || '<div class="empty">还没有自定义分类</div>';
}
function refreshAccountUI() {
  for (const id of ['entryAccount', 'transferFrom', 'transferTo', 'templateAccount', 'reconcileAccount', 'cashFlowAccount', 'cashPlanAccount', 'recurringAccount', 'loanAccount', 'repaymentAccount', 'subscriptionAccount']) {
    const select = $(id);
    const selected = select.value;
    const blank = id === 'cashFlowAccount' ? '<option value="">全部账户</option>' : ['entryAccount', 'templateAccount', 'cashPlanAccount', 'recurringAccount', 'loanAccount', 'repaymentAccount', 'subscriptionAccount'].includes(id) ? '<option value="">未指定账户</option>' : '';
    select.innerHTML = blank + data.accounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
    if (selected && data.accounts.some(account => account.id === selected)) select.value = selected;
  }
}
function refreshProjectUI() {
  const selected = $('recordProject').value;
  $('recordProject').innerHTML = '<option value="">全部项目</option>' + data.projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
  if (data.projects.some(project => project.id === selected)) $('recordProject').value = selected;
  $('entryProjectChoices').innerHTML = data.projects.map(project => `<label><input type="checkbox" value="${escapeHtml(project.id)}"> ${escapeHtml(project.name)}</label>`).join('') || '<span class="muted">还没有项目标签</span>';
}
function selectedProjectIds() { return [...$('entryProjectChoices').querySelectorAll('input:checked')].map(input => input.value); }
function setSelectedProjects(ids = []) { $('entryProjectChoices').querySelectorAll('input').forEach(input => { input.checked = ids.includes(input.value); }); }
function renderProjects() {
  $('projectSummary').innerHTML = data.projects.map(project => `<div class="budgetrow"><div class="rowtop"><b>${escapeHtml(project.name)}</b><span>净支出 ${money(JianjiFeatures.projectNet(project.id, data.entries))}</span></div></div>`).join('') || '<div class="empty">用项目标签汇总旅行、装修等跨类别支出</div>';
  $('projectList').innerHTML = data.projects.map(project => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(project.name)}</b><small>关联 ${data.entries.filter(entry => !entry.deletedAt && (entry.projectIds || []).includes(project.id)).length} 笔 · 净支出 ${money(JianjiFeatures.projectNet(project.id, data.entries))}</small></div><button data-project-edit="${escapeHtml(project.id)}">改名</button><button data-project-delete="${escapeHtml(project.id)}">删除</button></div>`).join('') || '<div class="empty">还没有项目标签</div>';
}
function renderCashFlow() {
  const filter = $('cashFlowAccount').value;
  const forecast = JianjiFeatures.cashFlowForecast(data, new Date(), filter);
  const end = forecast.days.at(-1)?.balance ?? forecast.startBalance ?? 0;
  const scope = filter ? data.accounts.find(account => account.id === filter)?.name || '所选账户' : '全部账户';
  $('cashFlowSummary').textContent = forecast.startBalance === null ? '还没有设置账户；下方只显示计划变动，无法预测账户余额。' : `${scope}当前账面余额 ${money(forecast.startBalance)}；按计划预计 30 天后 ${money(end)}。计划不会自动入账；未指定账户的记录和计划不计入余额预测。`;
  $('cashFlowDays').innerHTML = forecast.days.map(day => `<div class="cash-flow-day${day.balance < 0 && forecast.startBalance !== null ? ' negative' : ''}"><b>${escapeHtml(day.date.slice(5))}</b><span>${day.events.length ? day.events.map(item => `${escapeHtml(item.label)} ${item.delta >= 0 ? '+' : '−'}${money(Math.abs(item.delta))}`).join('；') : '—'}</span><strong>${forecast.startBalance === null ? '' : money(day.balance)}</strong></div>`).join('') || '<div class="empty">暂无未来日期</div>';
  $('cashFlowPlanList').innerHTML = data.cashFlowPlans.map(plan => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(plan.note)}</b><small>${escapeHtml(plan.date)} · ${plan.type === 'income' ? '收入' : '支出'} ${money(plan.amount)} · ${plan.done ? '已完成' : '待发生'}</small></div><button data-cash-edit="${escapeHtml(plan.id)}">编辑</button><button data-cash-toggle="${escapeHtml(plan.id)}">${plan.done ? '重新计划' : '标记完成'}</button><button data-cash-delete="${escapeHtml(plan.id)}">删除</button></div>`).join('') || '<div class="empty">暂无一次性计划收支</div>';
}
function renderReceivables() {
  const openLoans = data.receivables.filter(loan => !loan.archived);
  $('receivableSummary').innerHTML = openLoans.map(loan => `<div class="budgetrow"><div class="rowtop"><b>${escapeHtml(loan.person)}</b><span>待收 ${money(JianjiFeatures.receivableOutstanding(loan, data.entries))}</span></div><small>约定 ${escapeHtml(loan.dueDate)}${loan.dueDate < new Date().toLocaleDateString('en-CA') && JianjiFeatures.receivableOutstanding(loan, data.entries) > 0 ? ' · 已逾期' : ''}</small></div>`).join('') || '<div class="empty">目前没有待收款</div>';
  $('receivableList').innerHTML = data.receivables.map(loan => {
    const payments = data.entries.filter(entry => !entry.deletedAt && entry.receivableId === loan.id && entry.receivableKind === 'repayment');
    return `<div class="annual-plan-row"><div class="settings-row-main"><b>${escapeHtml(loan.person)} · 借出 ${money(loan.amount)}</b><small>待收 ${money(JianjiFeatures.receivableOutstanding(loan, data.entries))} · 到期 ${escapeHtml(loan.dueDate)}${loan.archived ? ' · 已归档' : ''}</small></div><div class="annual-plan-actions"><button data-loan-edit="${escapeHtml(loan.id)}">编辑</button><button data-loan-archive="${escapeHtml(loan.id)}">${loan.archived ? '恢复显示' : '归档'}</button>${payments.length ? '' : `<button data-loan-void="${escapeHtml(loan.id)}">撤销借出</button>`}</div>${payments.map(entry => `<div class="loan-payment"><small>${escapeHtml(entry.date)} 收回 ${money(entry.amount)}</small><button data-loan-payment-undo="${escapeHtml(entry.id)}">撤销</button></div>`).join('')}</div>`;
  }).join('') || '<div class="empty">还没有借出记录</div>';
  $('repaymentLoan').innerHTML = data.receivables.filter(loan => !loan.archived && JianjiFeatures.receivableOutstanding(loan, data.entries) > 0).map(loan => `<option value="${escapeHtml(loan.id)}">${escapeHtml(loan.person)} · 待收 ${money(JianjiFeatures.receivableOutstanding(loan, data.entries))}</option>`).join('');
}
function renderAccounts() {
  $('accountList').innerHTML = data.accounts.map(account => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(account.name)}</b><small>当前余额 ${money(JianjiFeatures.accountBalance(account, data.entries))}${account.lastReconciledAt ? ` · 上次核对 ${escapeHtml(account.lastReconciledAt.slice(0, 10))}` : ''}</small></div><button data-account-edit="${escapeHtml(account.id)}">编辑</button><button data-account-delete="${escapeHtml(account.id)}">删除</button></div>`).join('') || '<div class="empty">还没有账户，可先添加现金、银行卡等</div>';
}
function renderImportRules() {
  $('importRuleList').innerHTML = data.importRules.map(rule => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(rule.keyword)} → ${escapeHtml(rule.category)}</b><small>${escapeHtml(rule.source || '全部来源')}</small></div><button data-rule-remove="${escapeHtml(rule.id)}">删除</button></div>`).join('') || '<div class="empty">还没有分类规则</div>';
}
function renderTemplates() {
  $('templateShortcuts').innerHTML = data.templates.map(template => `<button type="button" data-use-template="${escapeHtml(template.id)}">${escapeHtml(template.name)} · ${money(template.amount)}</button>`).join('') || '<span class="muted">还没有常用模板</span>';
  $('templateList').innerHTML = data.templates.map(template => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(template.name)}</b><small>${template.type === 'income' ? '收入' : escapeHtml(template.category)} · ${money(template.amount)}</small></div><button data-template-edit="${escapeHtml(template.id)}">编辑</button><button data-template-delete="${escapeHtml(template.id)}">删除</button></div>`).join('') || '<div class="empty">还没有模板</div>';
}
function renderAnnualPlans() {
  const summaries = data.annualPlans.map(plan => ({ plan, progress: JianjiFeatures.annualPlanProgress(plan, liveEntries()) }));
  $('annualPlanSummary').innerHTML = summaries.map(({ plan, progress }) => `<div class="budgetrow"><div class="rowtop"><b>${escapeHtml(plan.name)} · ${plan.year} 年</b><span>已预留 ${money(progress.saved)} / ${money(plan.target)}</span></div><small>距目标还差 ${money(progress.remaining)} · ${progress.overdue ? '计划月份已过' : `每月建议预留 ${money(progress.monthly)}`}${plan.category ? ` · ${escapeHtml(plan.category)}已花 ${money(progress.spent)}` : ''}</small></div>`).join('') || '<div class="empty">为年费、保险或旅行设置一个计划</div>';
  $('annualPlanList').innerHTML = summaries.map(({ plan, progress }) => `<div class="annual-plan-row"><div class="settings-row-main"><b>${escapeHtml(plan.name)} · ${plan.year} 年 ${plan.month} 月</b><small>目标 ${money(plan.target)}，已预留 ${money(progress.saved)}，还需 ${money(progress.remaining)}${plan.category ? ` · ${escapeHtml(plan.category)}已花 ${money(progress.spent)}` : ''}</small></div><div class="annual-plan-actions"><input type="number" min="0.01" step="0.01" placeholder="本次预留金额" aria-label="为${escapeHtml(plan.name)}预留金额" data-plan-contribution="${escapeHtml(plan.id)}"><button data-plan-add="${escapeHtml(plan.id)}">预留</button>${plan.contributions?.length ? `<button data-plan-undo="${escapeHtml(plan.id)}">撤销上次预留</button>` : ''}<button data-plan-edit="${escapeHtml(plan.id)}">编辑</button><button data-plan-delete="${escapeHtml(plan.id)}">删除</button></div></div>`).join('') || '<div class="empty">还没有年度计划</div>';
}
function renderMissingCheck() {
  const today = new Date().toLocaleDateString('en-CA');
  const days = JianjiFeatures.daysWithoutEntry(data.entries);
  const show = data.missingCheckEnabled && days >= 3 && data.missingCheckDismissedUntil < today;
  $('missingCheckCard').hidden = !show;
  if (show) $('missingCheckText').textContent = `已 ${days} 天没有记录新的收支。如果最近有付款或收入，可以检查是否漏记。`;
  $('missingCheckEnabled').checked = data.missingCheckEnabled;
}
refreshCategoryUI();
refreshAccountUI();
refreshProjectUI();
setupFeatureMenu();
$('homeFeatures').onclick = () => switchPage('features');
for (const id of ['recordSearch', 'recordCategory', 'recordSource', 'recordProject', 'allMonths']) $(id).addEventListener('input', render);
$('cashFlowAccount').onchange = renderCashFlow;
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
function openNewEntry(category = null) {
  editingId = null;
  paymentDraftId = null;
  $('entryModalTitle').textContent = '记一笔';
  $('entryForm').reset();
  $('entryMore').open = false;
  $('entryAccount').value = data.accounts.some(account => account.id === data.lastEntryAccount) ? data.lastEntryAccount : '';
  $('splitRows').replaceChildren();
  $('removeStoredPhotoField').hidden = true;
  $('entryDate').value = new Date().toLocaleDateString('en-CA');
  setSelectedProjects([]);
  $('merchantRuleSuggestion').hidden = true;
  clearSelectedImage();
  setType('expense');
  $('entryCategory').value = category || preferredCategories()[0];
  open('entryModal');
  $('entryAmount').focus();
}
let suggestedMerchantRule = null;
function updateMerchantRuleSuggestion() {
  const keyword = ($('entryMerchant').value || $('entryNote').value).trim().toLocaleLowerCase();
  suggestedMerchantRule = entryType === 'expense' && keyword ? data.importRules.find(rule => !rule.source && cats.includes(rule.category) && rule.keyword?.trim() && keyword.includes(rule.keyword.trim().toLocaleLowerCase())) : null;
  $('merchantRuleSuggestion').hidden = !suggestedMerchantRule;
  if (suggestedMerchantRule) $('merchantRuleText').textContent = `根据「${suggestedMerchantRule.keyword}」建议：${suggestedMerchantRule.category}`;
}
$('entryMerchant').oninput = updateMerchantRuleSuggestion;
$('entryNote').oninput = updateMerchantRuleSuggestion;
$('applyMerchantRule').onclick = () => { if (suggestedMerchantRule) { $('entryCategory').value = suggestedMerchantRule.category; renderEntryCategories(); $('merchantRuleSuggestion').hidden = true; } };
$('add').onclick = () => openNewEntry();
$('heroAdd').onclick = () => openNewEntry();
$('categoryShortcuts').onclick = event => {
  const button = event.target.closest('[data-quick-category]');
  if (button) openNewEntry(button.dataset.quickCategory);
};
let editingProjectId = null;
function resetProjectForm() { editingProjectId = null; $('projectForm').reset(); $('projectForm').querySelector('button.primary').textContent = '添加项目'; $('cancelProjectEdit').hidden = true; }
$('manageProjects').onclick = () => { resetProjectForm(); renderProjects(); open('projectModal'); };
$('cancelProjectEdit').onclick = resetProjectForm;
$('projectForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('projectName').value.trim();
  if (!name || data.projects.some(project => project.name === name && project.id !== editingProjectId)) return toast('项目名称已存在或无效');
  if (!editingProjectId && data.projects.length >= 100) return toast('项目已达到上限');
  const before = structuredClone(data.projects);
  const existing = data.projects.find(project => project.id === editingProjectId);
  if (existing) existing.name = name; else data.projects.push({ id: crypto.randomUUID(), name });
  try { await save(); } catch { data.projects = before; return toast('项目保存失败'); }
  resetProjectForm(); refreshProjectUI(); render(); toast('项目已保存');
};
$('projectList').onclick = async event => {
  const edit = event.target.closest('[data-project-edit]'), remove = event.target.closest('[data-project-delete]');
  const project = data.projects.find(item => item.id === (edit?.dataset.projectEdit || remove?.dataset.projectDelete));
  if (!project) return;
  if (edit) {
    editingProjectId = project.id; $('projectName').value = project.name;
    $('projectForm').querySelector('button.primary').textContent = '保存项目名称'; $('cancelProjectEdit').hidden = false;
    $('projectForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  if (data.entries.some(entry => (entry.projectIds || []).includes(project.id))) return toast('这个项目仍关联账目，请先移除账目标签');
  const before = data.projects;
  data.projects = before.filter(item => item !== project);
  try { await save(); } catch { data.projects = before; return toast('项目删除失败'); }
  if (editingProjectId === project.id) resetProjectForm();
  refreshProjectUI(); render();
};
let editingCashPlanId = null;
function resetCashPlanForm() { editingCashPlanId = null; $('cashFlowPlanForm').reset(); $('cashPlanDate').value = new Date().toLocaleDateString('en-CA'); $('cashFlowPlanForm').querySelector('button.primary').textContent = '添加计划'; $('cancelCashPlanEdit').hidden = true; }
$('manageCashFlow').onclick = () => { resetCashPlanForm(); renderCashFlow(); open('cashFlowModal'); };
$('cancelCashPlanEdit').onclick = resetCashPlanForm;
$('cashFlowPlanForm').onsubmit = async event => {
  event.preventDefault();
  const amount = Number($('cashPlanAmount').value);
  if (!Number.isFinite(amount) || amount <= 0 || !$('cashPlanNote').value.trim() || !/^\d{4}-\d{2}-\d{2}$/.test($('cashPlanDate').value)) return toast('计划信息无效');
  if (!editingCashPlanId && data.cashFlowPlans.length >= 1000) return toast('计划收支已达到上限');
  const before = structuredClone(data.cashFlowPlans);
  const index = data.cashFlowPlans.findIndex(plan => plan.id === editingCashPlanId);
  const plan = { ...(index >= 0 ? data.cashFlowPlans[index] : { id: crypto.randomUUID(), done: false }), note: $('cashPlanNote').value.trim(), type: $('cashPlanType').value, amount, date: $('cashPlanDate').value, accountId: $('cashPlanAccount').value };
  if (index >= 0) data.cashFlowPlans[index] = plan; else data.cashFlowPlans.push(plan);
  try { await save(); } catch { data.cashFlowPlans = before; return toast('计划保存失败'); }
  resetCashPlanForm(); renderCashFlow(); toast('计划已保存');
};
$('cashFlowPlanList').onclick = async event => {
  const edit = event.target.closest('[data-cash-edit]'), toggle = event.target.closest('[data-cash-toggle]'), remove = event.target.closest('[data-cash-delete]');
  const plan = data.cashFlowPlans.find(item => item.id === (edit?.dataset.cashEdit || toggle?.dataset.cashToggle || remove?.dataset.cashDelete));
  if (!plan) return;
  if (edit) {
    editingCashPlanId = plan.id;
    $('cashPlanNote').value = plan.note; $('cashPlanType').value = plan.type; $('cashPlanAmount').value = plan.amount;
    $('cashPlanDate').value = plan.date; $('cashPlanAccount').value = plan.accountId || '';
    $('cashFlowPlanForm').querySelector('button.primary').textContent = '保存修改'; $('cancelCashPlanEdit').hidden = false;
    $('cashFlowPlanForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  const before = structuredClone(data.cashFlowPlans);
  if (toggle) plan.done = !plan.done;
  else data.cashFlowPlans = data.cashFlowPlans.filter(item => item !== plan);
  try { await save(); } catch { data.cashFlowPlans = before; return toast('计划更新失败'); }
  if (remove && editingCashPlanId === plan.id) resetCashPlanForm();
  renderCashFlow();
};
let editingLoanId = null;
function resetLoanForm() {
  editingLoanId = null;
  $('receivableForm').reset();
  $('loanDate').value = new Date().toLocaleDateString('en-CA');
  $('loanAmount').disabled = false; $('loanDate').disabled = false; $('loanAccount').disabled = false;
  $('receivableForm').querySelector('button.primary').textContent = '记录借出'; $('cancelLoanEdit').hidden = true;
}
$('manageReceivables').onclick = () => { resetLoanForm(); $('repaymentForm').reset(); $('repaymentDate').value = new Date().toLocaleDateString('en-CA'); renderReceivables(); open('receivableModal'); };
$('cancelLoanEdit').onclick = resetLoanForm;
$('receivableForm').onsubmit = async event => {
  event.preventDefault();
  const amount = Number($('loanAmount').value), person = $('loanPerson').value.trim(), date = $('loanDate').value, dueDate = $('loanDue').value;
  if (!person || !Number.isFinite(amount) || amount <= 0 || !date || !dueDate || dueDate < date) return toast('请填写有效借出金额和日期；约定日期不能早于借出日期');
  if (editingLoanId) {
    const loan = data.receivables.find(item => item.id === editingLoanId);
    if (!loan) return toast('借款记录不存在');
    const before = structuredClone(loan);
    loan.person = person; loan.dueDate = dueDate; loan.note = $('loanNote').value.trim();
    try { await save(); } catch { Object.assign(loan, before); return toast('借款修改失败'); }
    resetLoanForm(); renderReceivables(); toast('借款信息已更新'); return;
  }
  if (data.receivables.length >= 1000) return toast('借款记录已达到上限');
  const loan = { id: crypto.randomUUID(), person, amount, date, dueDate, note: $('loanNote').value.trim(), archived: false };
  const entry = { id: crypto.randomUUID(), type: 'excluded', amount, date, category: '', note: `借给${person}${loan.note ? `：${loan.note}` : ''}`, accountId: $('loanAccount').value, accountDelta: $('loanAccount').value ? -amount : 0, receivableId: loan.id, receivableKind: 'loan' };
  data.receivables.push(loan); data.entries.push(entry);
  try { await save(); } catch { data.receivables.pop(); data.entries.pop(); return toast('借出记录保存失败'); }
  resetLoanForm(); renderReceivables(); render(); toast('已记录借出');
};
$('repaymentForm').onsubmit = async event => {
  event.preventDefault();
  const loan = data.receivables.find(item => item.id === $('repaymentLoan').value && !item.archived);
  const amount = Number($('repaymentAmount').value);
  if (!loan || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) > Math.round(JianjiFeatures.receivableOutstanding(loan, data.entries) * 100)) return toast('收回金额超过待收余额');
  const accountId = $('repaymentAccount').value;
  const entry = { id: crypto.randomUUID(), type: 'excluded', amount, date: $('repaymentDate').value, category: '', note: `${loan.person}还款`, accountId, accountDelta: accountId ? amount : 0, receivableId: loan.id, receivableKind: 'repayment' };
  data.entries.push(entry);
  try { await save(); } catch { data.entries.pop(); return toast('收款记录保存失败'); }
  $('repaymentAmount').value = ''; renderReceivables(); render(); toast('已记录收款');
};
$('receivableList').onclick = async event => {
  const edit = event.target.closest('[data-loan-edit]'), archive = event.target.closest('[data-loan-archive]'), voidLoan = event.target.closest('[data-loan-void]'), undoPayment = event.target.closest('[data-loan-payment-undo]');
  if (undoPayment) {
    const entry = data.entries.find(item => String(item.id) === undoPayment.dataset.loanPaymentUndo && item.receivableKind === 'repayment' && !item.deletedAt);
    if (!entry) return;
    entry.deletedAt = new Date().toISOString();
    try { await save(); } catch { delete entry.deletedAt; return toast('撤销还款失败'); }
    renderReceivables(); render(); toast('已撤销这笔还款'); return;
  }
  const loan = data.receivables.find(item => item.id === (edit?.dataset.loanEdit || archive?.dataset.loanArchive || voidLoan?.dataset.loanVoid));
  if (!loan) return;
  if (edit) {
    editingLoanId = loan.id;
    $('loanPerson').value = loan.person; $('loanAmount').value = loan.amount; $('loanDate').value = loan.date;
    $('loanDue').value = loan.dueDate; $('loanNote').value = loan.note || '';
    $('loanAmount').disabled = true; $('loanDate').disabled = true; $('loanAccount').disabled = true;
    $('receivableForm').querySelector('button.primary').textContent = '保存借款信息'; $('cancelLoanEdit').hidden = false;
    $('receivableForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  if (archive) {
    if (!loan.archived && JianjiFeatures.receivableOutstanding(loan, data.entries) > 0) return toast('还有待收余额，不能归档');
    loan.archived = !loan.archived;
    try { await save(); } catch { loan.archived = !loan.archived; return toast('归档失败'); }
    renderReceivables(); render(); return;
  }
  if (data.entries.some(entry => entry.receivableId === loan.id && entry.receivableKind === 'repayment' && !entry.deletedAt)) return toast('已有收款记录，先撤销收款');
  if (!confirm(`撤销借给「${loan.person}」的记录吗？关联的借款及已撤销还款记录会永久移除。`)) return;
  const before = data.receivables;
  const beforeEntries = data.entries;
  data.receivables = before.filter(item => item !== loan);
  data.entries = beforeEntries.filter(entry => entry.receivableId !== loan.id);
  try { await save(); } catch { data.receivables = before; data.entries = beforeEntries; return toast('撤销借出失败'); }
  resetLoanForm(); renderReceivables(); render(); toast('已撤销借出');
};
let editingTemplateId = null;
$('manageTemplates').onclick = () => { editingTemplateId = null; $('templateForm').reset(); $('templateForm').querySelector('button.primary').textContent = '添加模板'; renderTemplates(); open('templateModal'); };
$('templateType').onchange = () => { $('templateCategory').parentElement.hidden = $('templateType').value !== 'expense'; };
$('templateShortcuts').onclick = event => {
  const button = event.target.closest('[data-use-template]');
  const template = data.templates.find(item => item.id === button?.dataset.useTemplate);
  if (!template) return;
  openNewEntry(template.category && cats.includes(template.category) ? template.category : cats[0]);
  setType(template.type);
  $('entryAmount').value = template.amount;
  $('entryNote').value = template.note || '';
  $('entryAccount').value = data.accounts.some(account => account.id === template.accountId) ? template.accountId : '';
  $('entryAmount').focus();
};
$('templateForm').onsubmit = async event => {
  event.preventDefault();
  const amount = Number($('templateAmount').value);
  const name = $('templateName').value.trim();
  if (!name || !Number.isFinite(amount) || amount <= 0 || data.templates.some(item => item.name === name && item.id !== editingTemplateId)) return toast('模板名称已存在或金额无效');
  if (!editingTemplateId && data.templates.length >= 1000) return toast('模板已达到上限');
  const before = structuredClone(data.templates);
  const template = { id: editingTemplateId || crypto.randomUUID(), name, type: $('templateType').value, amount, category: $('templateCategory').value, accountId: $('templateAccount').value, note: $('templateNote').value.trim() };
  const index = data.templates.findIndex(item => item.id === editingTemplateId);
  if (index >= 0) data.templates[index] = template; else data.templates.push(template);
  try { await save(); } catch { data.templates = before; return toast('模板保存失败'); }
  editingTemplateId = null; $('templateForm').reset(); $('templateCategory').parentElement.hidden = false;
  $('templateForm').querySelector('button.primary').textContent = '添加模板';
  renderTemplates(); toast('模板已保存');
};
$('templateList').onclick = async event => {
  const edit = event.target.closest('[data-template-edit]');
  const remove = event.target.closest('[data-template-delete]');
  const template = data.templates.find(item => item.id === (edit?.dataset.templateEdit || remove?.dataset.templateDelete));
  if (!template) return;
  if (edit) {
    editingTemplateId = template.id;
    $('templateName').value = template.name; $('templateType').value = template.type; $('templateAmount').value = template.amount;
    $('templateCategory').value = template.category; $('templateAccount').value = template.accountId || ''; $('templateNote').value = template.note || '';
    $('templateType').onchange(); $('templateForm').querySelector('button.primary').textContent = '保存模板修改';
    $('templateForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const before = data.templates;
  data.templates = before.filter(item => item !== template);
  try { await save(); } catch { data.templates = before; return toast('模板删除失败'); }
  renderTemplates();
};
for (let month = 1; month <= 12; month++) $('annualPlanMonth').add(new Option(`${month} 月`, String(month)));
let editingAnnualPlanId = null;
function resetAnnualPlanForm() {
  editingAnnualPlanId = null;
  $('annualPlanForm').reset();
  $('annualPlanYear').value = new Date().getFullYear();
  $('annualPlanMonth').value = '12';
  $('annualPlanForm').querySelector('button.primary').textContent = '添加计划';
  $('cancelAnnualPlanEdit').hidden = true;
}
$('cancelAnnualPlanEdit').onclick = resetAnnualPlanForm;
$('manageAnnualPlans').onclick = () => { resetAnnualPlanForm(); renderAnnualPlans(); open('annualPlanModal'); };
$('annualPlanForm').onsubmit = async event => {
  event.preventDefault();
  const year = Number($('annualPlanYear').value), month = Number($('annualPlanMonth').value), target = Number($('annualPlanTarget').value);
  const name = $('annualPlanName').value.trim();
  if (!name || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isFinite(target) || target <= 0) return toast('计划信息无效');
  if (data.annualPlans.some(item => item.name === name && item.year === year && item.id !== editingAnnualPlanId)) return toast('这一年的同名计划已存在');
  if (!editingAnnualPlanId && data.annualPlans.length >= 1000) return toast('年度计划已达到上限');
  const before = structuredClone(data.annualPlans);
  const index = data.annualPlans.findIndex(item => item.id === editingAnnualPlanId);
  const plan = { ...(index >= 0 ? data.annualPlans[index] : { id: crypto.randomUUID(), contributions: [] }), name, year, month, target, category: $('annualPlanCategory').value };
  if (index >= 0) data.annualPlans[index] = plan; else data.annualPlans.push(plan);
  try { await save(); } catch { data.annualPlans = before; return toast('计划保存失败'); }
  resetAnnualPlanForm(); renderAnnualPlans(); toast('年度计划已保存');
};
$('annualPlanList').onclick = async event => {
  const add = event.target.closest('[data-plan-add]'), remove = event.target.closest('[data-plan-delete]'), undo = event.target.closest('[data-plan-undo]'), edit = event.target.closest('[data-plan-edit]');
  const plan = data.annualPlans.find(item => item.id === (add?.dataset.planAdd || remove?.dataset.planDelete || undo?.dataset.planUndo || edit?.dataset.planEdit));
  if (!plan) return;
  if (edit) {
    editingAnnualPlanId = plan.id;
    $('annualPlanName').value = plan.name; $('annualPlanYear').value = plan.year; $('annualPlanTarget').value = plan.target;
    $('annualPlanMonth').value = plan.month; $('annualPlanCategory').value = plan.category || '';
    $('annualPlanForm').querySelector('button.primary').textContent = '保存计划修改'; $('cancelAnnualPlanEdit').hidden = false;
    $('annualPlanForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const before = structuredClone(data.annualPlans);
  if (add) {
    const amount = Number(add.parentElement.querySelector('input').value);
    if (!Number.isFinite(amount) || amount <= 0) return toast('请输入有效的预留金额');
    plan.contributions ??= [];
    if (plan.contributions.length >= 10000) return toast('预留记录已达到上限');
    plan.contributions.push({ id: crypto.randomUUID(), amount, date: new Date().toLocaleDateString('en-CA') });
  } else if (undo) plan.contributions.pop();
  else {
    if (!confirm(`删除「${plan.name}」及其预留记录吗？`)) return;
    data.annualPlans = data.annualPlans.filter(item => item !== plan);
    if (editingAnnualPlanId === plan.id) resetAnnualPlanForm();
  }
  try { await save(); } catch { data.annualPlans = before; return toast('计划更新失败'); }
  renderAnnualPlans();
};
$('missingCheckEnabled').onchange = async () => {
  const before = data.missingCheckEnabled;
  data.missingCheckEnabled = $('missingCheckEnabled').checked;
  try { await save(); } catch { data.missingCheckEnabled = before; $('missingCheckEnabled').checked = before; return toast('设置保存失败'); }
  renderMissingCheck();
};
$('dismissMissingCheck').onclick = async () => {
  const before = data.missingCheckDismissedUntil;
  const until = new Date(); until.setDate(until.getDate() + 7);
  data.missingCheckDismissedUntil = until.toLocaleDateString('en-CA');
  try { await save(); } catch { data.missingCheckDismissedUntil = before; return toast('设置保存失败'); }
  renderMissingCheck();
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
    for (const template of data.templates) if (template.category === item.name) template.category = name;
    for (const plan of data.annualPlans) if (plan.category === item.name) plan.category = name;
    for (const budget of Object.values(data.budgets)) if (Object.hasOwn(budget, item.name)) { budget[name] = budget[item.name]; delete budget[item.name]; }
    item.name = name;
    try { await save(); } catch { data = JSON.parse(before); return toast('分类改名失败'); }
    refreshCategoryUI(); renderCustomCategories(); render(); toast('分类已改名');
  } else {
    if (data.entries.some(entry => entry.category === item.name || entry.splits?.some(part => part.category === item.name)) || data.recurring.some(rule => rule.category === item.name) || data.importRules.some(rule => rule.category === item.name) || data.templates.some(template => template.category === item.name) || data.annualPlans.some(plan => plan.category === item.name) || Object.values(data.budgets).some(budget => Number(budget[item.name]) > 0)) return toast('此分类仍被账目、模板、计划或预算使用，请先调整它们');
    data.customCategories.splice(index, 1);
    try { await save(); } catch { data.customCategories.splice(index, 0, item); return toast('分类删除失败'); }
    refreshCategoryUI(); renderCustomCategories(); render(); toast('分类已删除');
  }
};
let editingAccountId = null;
let editingTransferId = null;
$('manageAccounts').onclick = () => { editingAccountId = null; editingTransferId = null; $('accountForm').reset(); $('accountForm').querySelector('button').textContent = '添加账户'; $('transferForm').reset(); $('transferForm').querySelector('button').textContent = '记录转账'; $('transferDate').value = new Date().toLocaleDateString('en-CA'); $('reconcileForm').reset(); resetReconcile(); renderAccounts(); renderReconcileHistory(); open('accountModal'); };
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
  refreshAccountUI(); renderAccounts(); renderReconcileHistory(); render(); toast('账户已保存');
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
  if (data.entries.some(entry => entry.accountId === account.id || entry.transferFrom === account.id || entry.transferTo === account.id) || data.templates.some(template => template.accountId === account.id) || data.cashFlowPlans.some(plan => plan.accountId === account.id) || data.recurring.some(rule => rule.accountId === account.id) || account.reconciliations?.length) return toast('此账户仍有关联账目、模板、计划或对账记录，请先处理');
  const before = data.accounts;
  data.accounts = before.filter(item => item !== account);
  try { await save(); } catch { data.accounts = before; return toast('账户删除失败'); }
  refreshAccountUI(); renderAccounts(); toast('账户已删除');
};
let reconcilePending = '';
function resetReconcile() { reconcilePending = ''; $('reconcileSave').textContent = '核对余额'; $('reconcileResult').textContent = ''; }
function renderReconcileHistory() {
  const account = data.accounts.find(item => item.id === $('reconcileAccount').value);
  $('reconcileHistory').innerHTML = (account?.reconciliations || []).slice(-5).reverse().map((item, index) => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(item.date)} · 校正 ${money(item.delta)}</b><small>当时实际余额 ${money(item.actual)}</small></div>${index === 0 ? `<button data-reconcile-undo="${escapeHtml(item.id)}">撤销</button>` : ''}</div>`).join('') || '<div class="empty">暂无余额校正记录</div>';
}
$('reconcileAccount').onchange = () => { resetReconcile(); renderReconcileHistory(); };
$('reconcileActual').oninput = resetReconcile;
$('reconcileForm').onsubmit = async event => {
  event.preventDefault();
  const account = data.accounts.find(item => item.id === $('reconcileAccount').value);
  if (!account || $('reconcileActual').value.trim() === '') return toast('请选择账户并填写实际余额');
  const actual = Number($('reconcileActual').value);
  if (!Number.isFinite(actual)) return toast('实际余额无效');
  const delta = JianjiFeatures.reconcileDifference(account, data.entries, actual);
  if (!delta) {
    const previous = account.lastReconciledAt;
    account.lastReconciledAt = new Date().toISOString();
    try { await save(); } catch { account.lastReconciledAt = previous; return toast('对账结果保存失败'); }
    resetReconcile(); $('reconcileResult').textContent = '余额一致，已标记为核对完成。'; renderAccounts(); return;
  }
  const signature = `${account.id}|${actual}|${delta}`;
  if (reconcilePending !== signature) {
    reconcilePending = signature;
    $('reconcileResult').textContent = `账本余额 ${money(JianjiFeatures.accountBalance(account, data.entries))}，实际余额 ${money(actual)}，差额 ${money(delta)}。请先检查漏记账目；若确认差额无须逐笔补记，再点一次校正。`;
    $('reconcileSave').textContent = '确认余额校正';
    return;
  }
  const before = structuredClone(account);
  account.reconciliations ??= [];
  if (account.reconciliations.length >= 10000) return toast('对账记录已达到上限');
  account.reconciliations.push({ id: crypto.randomUUID(), date: new Date().toLocaleDateString('en-CA'), actual, delta });
  account.lastReconciledAt = new Date().toISOString();
  try { await save(); } catch { Object.assign(account, before); return toast('余额校正保存失败'); }
  resetReconcile(); $('reconcileResult').textContent = '余额已校正；此差额不计入收支。'; renderAccounts(); renderReconcileHistory();
};
$('reconcileHistory').onclick = async event => {
  const button = event.target.closest('[data-reconcile-undo]');
  if (!button) return;
  const account = data.accounts.find(item => item.id === $('reconcileAccount').value);
  if (!account) return;
  const before = structuredClone(account.reconciliations || []);
  account.reconciliations = before.filter(item => item.id !== button.dataset.reconcileUndo);
  try { await save(); } catch { account.reconciliations = before; return toast('撤销失败'); }
  resetReconcile(); renderAccounts(); renderReconcileHistory(); toast('已撤销余额校正');
};
$('transferForm').onsubmit = async event => {
  event.preventDefault();
  const from = $('transferFrom').value, to = $('transferTo').value, amount = Number($('transferAmount').value);
  if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return toast('请选择不同的转出、转入账户和有效金额');
  const old = editingTransferId === null ? null : data.entries.find(item => String(item.id) === editingTransferId);
  const entry = { ...old, id: old?.id ?? crypto.randomUUID(), type: 'excluded', amount, date: $('transferDate').value, category: '', note: $('transferNote').value.trim() || '账户转账', transferFrom: from, transferTo: to };
  const index = old ? data.entries.indexOf(old) : -1;
  if (index >= 0) data.entries[index] = entry; else data.entries.push(entry);
  rememberEntry(old ? '编辑转账' : '新增转账', old, entry);
  try { await save(); } catch { if (index >= 0) data.entries[index] = old; else data.entries.pop(); data.entryHistory.shift(); return toast('转账保存失败'); }
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
  if (data.importRules.length >= 1000) return toast('商户分类规则已达到上限');
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
let reminderEnabled = false;
async function syncReminders(askPermission = false) {
  if (!onAndroid()) return;
  const rules = data.recurring.map(rule => ({ id: String(rule.id), frequency: rule.frequency, startDate: rule.startDate, active: rule.active !== false }));
  await window.Capacitor.nativePromise('Reminder', 'configure', { rules, enabled: reminderEnabled, askPermission });
}
async function refreshReminderStatus() {
  if (!onAndroid()) return;
  $('reminderControls').hidden = false;
  try {
    const status = await window.Capacitor.nativePromise('Reminder', 'status', {});
    reminderEnabled = Boolean(status.enabled);
    $('toggleReminders').textContent = reminderEnabled ? '关闭系统提醒' : '开启系统提醒';
    $('reminderStatus').textContent = reminderEnabled
      ? status.permission ? '已开启：固定账单到期前一天约 9 点提醒；实际到达时间受系统省电设置影响。' : '提醒已开启，但还没有通知权限；请在系统应用设置中允许简记发送通知。'
      : '系统提醒会在到期前一天约 9 点发出，不会自动记账。';
  } catch { $('reminderStatus').textContent = '暂时无法读取系统提醒设置'; }
}
$('toggleReminders').onclick = async () => {
  reminderEnabled = !reminderEnabled;
  try { await syncReminders(reminderEnabled); await refreshReminderStatus(); }
  catch (error) { reminderEnabled = !reminderEnabled; $('reminderStatus').textContent = error.message || '系统提醒设置失败'; }
};
function resetRecurringForm() {
  editingRecurringId = null;
  $('recurringForm').reset();
  $('recurringStart').value = new Date().toLocaleDateString('en-CA');
  $('recurringAccount').value = '';
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
  $('recurringRules').innerHTML = data.recurring.map(rule => `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(rule.note)}</b><small>${rule.frequency === 'weekly' ? '每周' : rule.frequency === 'yearly' ? '每年' : '每月'} · ${money(rule.amount)} · ${rule.active === false ? '已暂停' : '进行中'}</small></div><button data-rule-edit="${escapeHtml(rule.id)}">编辑</button><button data-rule-toggle="${escapeHtml(rule.id)}">${rule.active === false ? '启用' : '暂停'}</button><button data-rule-delete="${escapeHtml(rule.id)}">删除</button></div>`).join('') || '<div class="empty">还没有周期账目</div>';
}
$('manageRecurring').onclick = () => { resetRecurringForm(); renderRecurringRules(); refreshReminderStatus(); open('recurringModal'); };
$('cancelRecurringEdit').onclick = resetRecurringForm;
$('recurringExpense').onclick = () => setRecurringType('expense');
$('recurringIncome').onclick = () => setRecurringType('income');
$('recurringForm').onsubmit = async event => {
  event.preventDefault();
  const amount = Number($('recurringAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const existing = editingRecurringId === null ? null : data.recurring.find(item => item.id === editingRecurringId);
  if (editingRecurringId !== null && !existing) return toast('周期规则不存在，请重新打开');
  const rule = { ...existing, id: existing?.id || String(Date.now() + Math.random()), type: recurringType, amount, category: recurringType === 'expense' ? $('recurringCategory').value : '', note: $('recurringNote').value.trim(), frequency: $('recurringFrequency').value, startDate: $('recurringStart').value, accountId: $('recurringAccount').value, active: existing?.active !== false };
  const index = existing ? data.recurring.indexOf(existing) : -1;
  if (index >= 0) data.recurring[index] = rule; else data.recurring.push(rule);
  try { await save(); } catch { if (index >= 0) data.recurring[index] = existing; else data.recurring.pop(); return toast('周期账目保存失败'); }
  syncReminders().catch(() => toast('账目已保存，但系统提醒未更新'));
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
    $('recurringAccount').value = rule.accountId || '';
    $('saveRecurringRule').textContent = '保存修改';
    $('cancelRecurringEdit').hidden = false;
    $('recurringForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (toggle) rule.active = rule.active === false;
  else data.recurring = data.recurring.filter(item => item !== rule);
  try { await save(); } catch { if (toggle) rule.active = !rule.active; else data.recurring.push(rule); return toast('保存失败'); }
  syncReminders().catch(() => toast('账目已保存，但系统提醒未更新'));
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
  const entry = post ? { id: Date.now() + Math.random(), type: rule.type, amount: rule.amount, date, category: rule.category, note: rule.note, accountId: rule.accountId || '', recurringKey: occurrenceKey } : null;
  if (entry) data.entries.push(entry);
  data.recurringAcknowledged[occurrenceKey] = post ? 'posted' : 'skipped';
  if (entry) rememberEntry('周期入账', null, entry);
  try { await save(); } catch { if (entry) { data.entries.pop(); data.entryHistory.shift(); } delete data.recurringAcknowledged[occurrenceKey]; return toast('保存失败'); }
  render(); toast(post ? '周期账目已记入' : '已跳过本期');
};
$('expenseTab').onclick = () => setType('expense');
$('incomeTab').onclick = () => setType('income');
$('excludedTab').onclick = () => setType('excluded');
$('cameraButton').onclick = () => $('cameraInput').click();
$('imageButton').onclick = () => $('imageInput').click();
$('recognizeImage').onclick = async () => {
  if (!selectedImage || !onAndroid()) return;
  $('recognizeImage').disabled = true;
  $('ocrStatus').textContent = '正在本机识别图片文字…';
  try {
    const bitmap = await createImageBitmap(selectedImage);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const image = canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
    const result = await window.Capacitor.nativePromise('ImageOcr', 'recognize', { image });
    const suggestion = JianjiOcr.suggest(result.text);
    if (suggestion.amount && !$('entryAmount').value) $('entryAmount').value = suggestion.amount.toFixed(2);
    if (suggestion.merchant && !$('entryNote').value) $('entryNote').value = suggestion.merchant;
    if (suggestion.merchant && !$('entryMerchant').value) $('entryMerchant').value = suggestion.merchant.slice(0, 40);
    updateMerchantRuleSuggestion();
    $('ocrStatus').textContent = suggestion.amount || suggestion.merchant
      ? `已预填${suggestion.amount ? '金额' : ''}${suggestion.amount && suggestion.merchant ? '和' : ''}${suggestion.merchant ? '商户' : ''}，请核对后保存。`
      : suggestion.ambiguous ? '图片中有多个不同金额，未自动填写；请手动核对。' : '未找到明确的金额或商户，请手动填写。';
  } catch (error) { $('ocrStatus').textContent = error.message || '图片识别失败，请手动填写'; }
  finally { $('recognizeImage').disabled = false; }
};
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
    return `<div class="import-item" data-review="${Boolean(entry.reviewReason || duplicate)}" data-duplicate="${duplicate}">${duplicate ? '' : `<input type="checkbox" data-import-index="${index}" aria-label="导入第 ${index + 1} 笔" checked>`}<div class="import-item-main"><b>${escapeHtml(entry.note)}</b><small>${escapeHtml(entry.transactionTime)} · ${entry.source}${entry.reviewReason ? ' · 请核对：' + escapeHtml(entry.reviewReason) : ''}</small>${duplicate ? `<small class="duplicate-hint">可能已记账：${escapeHtml(entry.duplicateHint)}。请选择如何处理。</small><select class="reconcile-choice" data-reconcile-index="${index}" aria-label="疑似重复账目处理方式"><option value="skip">暂不导入</option><option value="merge">关联已有手动账目</option><option value="new">仍新增一笔</option></select>` : ''}<select data-type-index="${index}" aria-label="${escapeHtml(entry.note)}的收支类型"><option value="expense"${entry.type === 'expense' ? ' selected' : ''}>支出</option><option value="income"${entry.type === 'income' ? ' selected' : ''}>收入</option><option value="excluded"${entry.type === 'excluded' ? ' selected' : ''}>不计收支</option></select><select data-category-index="${index}" aria-label="${escapeHtml(entry.note)}的分类"${entry.type !== 'expense' ? ' hidden' : ''}>${cats.map(category => `<option value="${escapeHtml(category)}"${category === entry.category ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select><label class="import-remember"${entry.type !== 'expense' ? ' hidden' : ''}><input type="checkbox" data-remember-index="${index}"> 记住商户分类</label><input data-merchant-keyword-index="${index}" maxlength="40" value="${escapeHtml(entry.note.slice(0, 40))}" aria-label="商户分类关键词"${entry.type !== 'expense' ? ' hidden' : ''}></div><span class="import-item-amount ${entry.type === 'income' ? 'income' : ''}">${entry.type === 'income' ? '+' : entry.type === 'excluded' ? '' : '−'}${money(entry.amount)}</span></div>`;
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
    event.target.parentElement.querySelector('[data-remember-index]').parentElement.hidden = item.type !== 'expense';
    event.target.parentElement.querySelector('[data-merchant-keyword-index]').hidden = item.type !== 'expense';
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
  const rulesBefore = structuredClone(data.importRules);
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
  for (const { entry } of selected) {
    if (entry.type !== 'expense') continue;
    const index = pendingImport.indexOf(entry);
    const remember = $('importPreview').querySelector(`[data-remember-index="${index}"]`);
    if (!remember?.checked) continue;
    const keyword = $('importPreview').querySelector(`[data-merchant-keyword-index="${index}"]`)?.value.trim();
    if (!keyword) { data.entries = before; data.importRules = rulesBefore; return toast('要记住商户分类，请填写关键词'); }
    const existing = data.importRules.find(rule => rule.source === entry.source && rule.keyword.toLocaleLowerCase() === keyword.toLocaleLowerCase());
    if (existing) existing.category = entry.category;
    else data.importRules.unshift({ id: crypto.randomUUID(), keyword, source: entry.source, category: entry.category });
  }
  if (data.importRules.length > 1000) { data.entries = before; data.importRules = rulesBefore; return toast('商户分类规则已达到上限'); }
  const historyBefore = structuredClone(data.entryHistory);
  const oldById = new Map(before.map(entry => [String(entry.id), entry]));
  for (const entry of replacement) {
    const old = oldById.get(String(entry.id));
    if (!old) rememberEntry('导入', null, entry);
    else if (old !== entry) rememberEntry('关联导入', old, entry);
  }
  try { await save(); }
  catch {
    data.entries = before;
    data.importRules = rulesBefore;
    data.entryHistory = historyBefore;
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
async function createVerifiedBackup(password) {
  const snapshot = structuredClone(data);
  const photos = [];
  const ids = [...new Set(snapshot.entries.map(entry => entry.photoId).filter(Boolean))];
  for (const id of ids) {
    const blob = await photoStore('get', id);
    if (!blob) throw new Error('有记录图片无法读取，请检查本机图片存储');
    photos.push({ id, mime: blob.type || 'image/jpeg', base64: JianjiBackup.toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  const content = await JianjiBackup.createBackup(snapshot, photos, password);
  if (content.length > 50 * 1024 * 1024) throw new Error('备份超过 50 MB，请先减少账目图片再备份');
  const checked = await JianjiBackup.readBackup(content, password);
  if (checked.data.entries.length !== snapshot.entries.length || checked.photos.length !== photos.length) throw new Error('备份校验失败，请重试');
  return { content, entryCount: snapshot.entries.length, photoCount: photos.length };
}
let autoBackupRunning = false;
function scheduleAutoBackup(delay = 15000) {
  if (!autoBackupConfigured || !ledgerLoaded) return;
  clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(runAutoBackup, delay);
}
async function refreshAutoBackupStatus() {
  if (!onAndroid()) return;
  const status = await window.Capacitor.nativePromise('AutoBackup', 'status', {});
  autoBackupConfigured = Boolean(status.configured);
  lastAutoBackupAt = status.lastSavedAt || '';
  $('autoBackupStatus').textContent = autoBackupConfigured
    ? `已开启。${status.lastSavedAt ? `最近写入：${status.lastSavedAt.replace('T', ' ').slice(0, 16)}。` : '尚未写入备份。'}请记住密码，并定期检查目录中的文件。`
    : status.hasFolder ? '目录已选择。填写上方密码后开启自动备份。' : '尚未设置自动备份目录。';
  $('disableAutoBackup').hidden = !autoBackupConfigured;
  if (ledgerLoaded) render();
}
async function runAutoBackup() {
  if (!autoBackupConfigured || !ledgerLoaded) return;
  if (autoBackupRunning) { scheduleAutoBackup(); return; }
  autoBackupRunning = true;
  try {
    const { password } = await window.Capacitor.nativePromise('AutoBackup', 'getPassword', {});
    const { content } = await createVerifiedBackup(password);
    await window.Capacitor.nativePromise('AutoBackup', 'write', { contents: content });
    await refreshAutoBackupStatus();
  } catch (error) {
    $('autoBackupStatus').textContent = `自动备份失败：${error.message || '请检查目录权限'}`;
  } finally { autoBackupRunning = false; }
}
if (onAndroid()) {
  $('chooseAutoBackupFolder').hidden = false;
  $('enableAutoBackup').hidden = false;
}
$('chooseAutoBackupFolder').onclick = async () => {
  try { await window.Capacitor.nativePromise('AutoBackup', 'chooseFolder', {}); await refreshAutoBackupStatus(); }
  catch (error) { $('autoBackupStatus').textContent = error.message || '目录选择失败'; }
};
$('enableAutoBackup').onclick = async () => {
  const password = $('backupPassword').value;
  if (password.length < 8) return toast('请先填写至少 8 位的备份密码');
  try {
    const status = await window.Capacitor.nativePromise('AutoBackup', 'status', {});
    if (!status.hasFolder) return toast('请先选择自动备份目录');
    await window.Capacitor.nativePromise('AutoBackup', 'setPassword', { password });
    $('backupPassword').value = '';
    await refreshAutoBackupStatus();
    scheduleAutoBackup(0);
  } catch (error) { $('autoBackupStatus').textContent = error.message || '无法开启自动备份'; }
};
$('disableAutoBackup').onclick = async () => {
  try {
    await window.Capacitor.nativePromise('AutoBackup', 'disable', {});
    autoBackupConfigured = false;
    clearTimeout(autoBackupTimer);
    await refreshAutoBackupStatus();
  } catch (error) { $('autoBackupStatus').textContent = error.message || '无法关闭自动备份'; }
};
$('exportCsv').onclick = async () => {
  $('exportCsv').disabled = true;
  try {
    await saveBackupFile(`简记账目-${new Date().toLocaleDateString('en-CA')}.csv`, JianjiCsv.toCsv(data));
    $('backupStatus').textContent = 'CSV 已保存。表格为明文，请妥善保管。';
  } catch (error) { $('backupStatus').textContent = error.message || 'CSV 导出失败'; }
  finally { $('exportCsv').disabled = false; }
};
$('exportBackup').onclick = async () => {
  const password = $('backupPassword').value;
  if (password.length < 8) return toast('备份密码至少 8 位');
  $('exportBackup').disabled = true;
  $('backupStatus').textContent = '正在收集账目与图片并加密…';
  try {
    const { content, entryCount, photoCount } = await createVerifiedBackup(password);
    await saveBackupFile(`简记备份-${new Date().toLocaleDateString('en-CA')}.jianji`, content);
    data.lastBackupAt = new Date().toISOString();
    try { await save(); } catch { /* The backup file was saved even if the reminder timestamp could not be persisted. */ }
    render();
    $('backupStatus').textContent = `备份已保存：${entryCount} 笔账目（含最近删除）、${photoCount} 张图片。请妥善保管文件和密码。`;
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
        refreshCategoryUI(); refreshAccountUI(); refreshProjectUI(); render(); close('backupModal'); toast('账本已恢复');
        syncReminders().catch(() => toast('账本已恢复，但系统提醒未更新'));
        scheduleAutoBackup();
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
function historySnapshot(entry) {
  if (!entry) return null;
  const snapshot = structuredClone(entry);
  delete snapshot.photoId;
  return snapshot;
}
function rememberEntry(action, before, after) {
  data.entryHistory.unshift({ id: crypto.randomUUID(), recordId: String(after?.id ?? before.id), action, before: historySnapshot(before), after: historySnapshot(after), time: new Date().toISOString(), undone: false });
  data.entryHistory.length = Math.min(data.entryHistory.length, 100);
}
function renderHistory() {
  $('historyList').innerHTML = data.entryHistory.map(item => {
    const latest = data.entryHistory.find(other => String(other.recordId) === String(item.recordId) && !other.undone);
    const entry = data.entries.find(record => String(record.id) === String(item.recordId));
    const canUndo = !item.undone && latest === item && entry && !entry.receivableId;
    const state = item.after || item.before;
    return `<div class="settings-row"><div class="settings-row-main"><b>${escapeHtml(item.action)} · ${escapeHtml(state?.note || state?.category || '未命名账目')}</b><small>${escapeHtml(String(item.time).replace('T', ' ').slice(0, 16))} · ${escapeHtml(state?.date || '')} · ${money(state?.amount || 0)}${item.undone ? ' · 已撤销' : ''}</small></div>${canUndo ? `<button data-history-undo="${escapeHtml(item.id)}">撤销</button>` : ''}</div>`;
  }).join('') || '<div class="empty">还没有账目变更记录</div>';
}
$('openHistory').onclick = () => { renderHistory(); open('historyModal'); };
$('historyList').onclick = async event => {
  const button = event.target.closest('[data-history-undo]');
  if (!button) return;
  const item = data.entryHistory.find(record => record.id === button.dataset.historyUndo && !record.undone);
  if (!item || data.entryHistory.find(record => String(record.recordId) === String(item.recordId) && !record.undone) !== item) return toast('请先撤销这笔账目的最近一次操作');
  const index = data.entries.findIndex(record => String(record.id) === String(item.recordId));
  if (index < 0 || data.entries[index].receivableId) return toast('关联借款请在借还款页面处理');
  const current = data.entries[index];
  if (JSON.stringify(historySnapshot(current)) !== JSON.stringify(item.after)) return toast('账目已被其他操作改变，无法撤销');
  const previous = structuredClone(current);
  const acknowledgement = current.recurringKey ? data.recurringAcknowledged[current.recurringKey] : undefined;
  if (item.before === null) {
    if (data.entries.some(record => record.type === 'refund' && !record.deletedAt && String(record.refundOf) === String(current.id))) return toast('已有关联退款，请先处理退款');
    current.deletedAt = new Date().toISOString();
    if (current.recurringKey) delete data.recurringAcknowledged[current.recurringKey];
  } else {
    const restored = { ...structuredClone(item.before), photoId: current.photoId };
    if (restored.type === 'refund') {
      const original = data.entries.find(record => String(record.id) === String(restored.refundOf) && record.type === 'expense' && !record.deletedAt);
      if (!original || Math.round(restored.amount * 100) > Math.round(JianjiFeatures.refundAvailable(original, restored.category, data.entries, current.id) * 100)) return toast('原支出或可退金额已变化，无法撤销');
    }
    if (restored.type === 'expense') {
      const parts = JianjiFeatures.expenseParts(restored);
      for (const category of new Set(data.entries.filter(record => record.type === 'refund' && !record.deletedAt && String(record.refundOf) === String(restored.id)).map(record => record.category))) {
        const allowed = parts.find(part => part.category === category)?.amount || 0;
        const refunded = data.entries.filter(record => record.type === 'refund' && !record.deletedAt && String(record.refundOf) === String(restored.id) && record.category === category).reduce((sum, record) => sum + Number(record.amount), 0);
        if (Math.round(refunded * 100) > Math.round(allowed * 100)) return toast('关联退款已变化，无法撤销');
      }
    }
    data.entries[index] = restored;
  }
  item.undone = true;
  try { await save(); } catch { data.entries[index] = previous; if (previous.recurringKey && acknowledgement !== undefined) data.recurringAcknowledged[previous.recurringKey] = acknowledgement; item.undone = false; return toast('撤销保存失败'); }
  renderHistory(); render(); renderTrash(); toast('已撤销这次账目操作');
};
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
    if (entry.receivableId) return toast('借还款记录请在借还款页面处理');
    const beforeEntry = structuredClone(entry);
    const old = entry.deletedAt;
    delete entry.deletedAt;
    rememberEntry('恢复', beforeEntry, entry);
    try { await save(); } catch { entry.deletedAt = old; data.entryHistory.shift(); return toast('恢复失败，请检查存储空间'); }
    toast('账目已恢复');
  } else {
    if (entry.receivableId) return toast('借还款记录不能单独永久删除');
    if (entry.type === 'expense' && data.entries.some(item => item.type === 'refund' && String(item.refundOf) === String(entry.id))) return toast('请先永久删除关联退款');
    if (!confirm('永久删除后无法从最近删除恢复，确定继续吗？')) return;
    const old = data.entries;
    data.entries = old.filter(item => item !== entry);
    const oldHistory = data.entryHistory;
    data.entryHistory = oldHistory.filter(item => String(item.recordId) !== String(entry.id));
    try { await save(); } catch { data.entries = old; data.entryHistory = oldHistory; return toast('删除失败，请检查存储空间'); }
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
  const entry = { ...original, id: original?.id ?? Date.now() + Math.random(), type: entryType, amount, date: $('entryDate').value, category: entryType === 'expense' ? $('entryCategory').value : '', note: $('entryNote').value.trim(), merchant: entryType === 'expense' ? $('entryMerchant').value.trim() : '', accountId: $('entryAccount').value || '', projectIds: selectedProjectIds() };
  if (entryType === 'expense' && $('rememberMerchant').checked && !entry.merchant) return toast('请先填写商户名称，再记住分类');
  if (entryType === 'expense' && $('splitEnabled').checked) {
    const parts = splitRows();
    if (!JianjiFeatures.validSplits(amount, parts, cats)) return toast('请让各类别金额相加等于总金额，且类别不重复');
    if ($('rememberMerchant').checked) return toast('多类别支出请取消记住商户分类，或改为单一类别');
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
  const previousRules = structuredClone(data.importRules);
  const previousAccount = data.lastEntryAccount;
  let historyAdded = false;
  try {
    if (index >= 0) data.entries[index] = entry;
    else data.entries.push(entry);
    if (entryType === 'expense' && $('rememberMerchant').checked && !entry.splits?.length) {
      const existingRule = data.importRules.find(rule => !rule.source && rule.keyword.toLocaleLowerCase() === entry.merchant.toLocaleLowerCase());
      if (existingRule) existingRule.category = entry.category;
      else if (data.importRules.length < 1000) data.importRules.unshift({ id: crypto.randomUUID(), keyword: entry.merchant, source: '', category: entry.category });
      else throw new Error('商户分类规则已达到上限');
    }
    if (!original) data.lastEntryAccount = entry.accountId;
    rememberEntry(original ? '编辑' : '新增', original, entry);
    historyAdded = true;
    await save();
  }
  catch {
    if (index >= 0) data.entries[index] = original;
    else data.entries.pop();
    data.importRules = previousRules;
    data.lastEntryAccount = previousAccount;
    if (historyAdded) data.entryHistory.shift();
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
  refreshCategoryUI();
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
  const entry = { ...previous, id: previous?.id ?? Date.now() + Math.random(), type: 'refund', refundOf: original.id, amount, date: $('refundDate').value, category, accountId: $('refundAccount').value, note: $('refundNote').value.trim(), source: original.source || '', projectIds: original.projectIds || [] };
  const index = previous ? data.entries.indexOf(previous) : -1;
  if (index >= 0) data.entries[index] = entry; else data.entries.push(entry);
  rememberEntry(previous ? '编辑退款' : '新增退款', previous, entry);
  try { await save(); } catch { if (index >= 0) data.entries[index] = previous; else data.entries.pop(); data.entryHistory.shift(); return toast('退款保存失败'); }
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
    if (entry.receivableId) { $('manageReceivables').click(); return toast('借还款记录请在这里管理'); }
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
    $('entryMore').open = Boolean(entry.note || entry.merchant || entry.photoId || entry.splits?.length || entry.projectIds?.length);
    setSelectedProjects(entry.projectIds || []);
    $('entryMerchant').value = entry.merchant || '';
    $('rememberMerchant').checked = false;
    updateMerchantRuleSuggestion();
    $('removeStoredPhotoField').hidden = !entry.photoId;
    $('removeStoredPhoto').checked = false;
    $('photoName').textContent = entry.photoId ? '已保存原图片；选择新图片可替换' : '可拍摄物品，也可选择相册里的网购截图';
    open('entryModal');
    return;
  }
  const button = e.target.closest('[data-delete]');
  if (!button) return;
  const entry = data.entries.find(item => String(item.id) === button.dataset.delete && !item.deletedAt);
  if (!entry) return;
  if (entry.receivableId) { $('manageReceivables').click(); return toast('借还款记录请在这里管理'); }
  if (!confirm('确定删除这笔记录吗？')) return;
  if (entry.type === 'expense' && data.entries.some(item => item.type === 'refund' && String(item.refundOf) === String(entry.id))) return toast('请先永久删除关联退款，再删除原支出');
  const beforeEntry = structuredClone(entry);
  entry.deletedAt = new Date().toISOString();
  rememberEntry('删除', beforeEntry, entry);
  try { await save(); } catch { delete entry.deletedAt; data.entryHistory.shift(); return toast('删除失败，请检查存储空间'); }
  render(); toast('已移到最近删除，可在账本设置中恢复');
}
document.querySelectorAll('.record-list').forEach(container => container.onclick = handleRecordClick);
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
    renderTodo();
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshReminderStatus(); });
window.addEventListener('focus', refreshPaymentNotices);
let appLockEnabled = false;
let ledgerLoaded = false;
function showAppLock(locked) {
  $('appLockOverlay').hidden = !locked;
  document.querySelector('main').inert = locked;
  $('add').inert = locked;
  document.querySelector('.bottom-nav').inert = locked;
}
$('unlockApp').onclick = async () => {
  $('unlockApp').disabled = true;
  $('appLockStatus').textContent = '';
  try {
    await window.Capacitor.nativePromise('AppLock', 'authenticate', {});
    showAppLock(false);
    if (!ledgerLoaded) await loadLedger();
  } catch (error) { $('appLockStatus').textContent = error.message || '解锁失败，请重试'; }
  finally { $('unlockApp').disabled = false; }
};
$('appLockSetting').onclick = async () => {
  try {
    await window.Capacitor.nativePromise('AppLock', 'authenticate', {});
    await window.Capacitor.nativePromise('AppLock', 'setEnabled', { enabled: !appLockEnabled });
    appLockEnabled = !appLockEnabled;
    $('appLockSetting').textContent = appLockEnabled ? '关闭应用锁' : '开启应用锁';
    toast(appLockEnabled ? '应用锁已开启，下次打开简记时生效' : '应用锁已关闭');
  } catch (error) { toast(error.message || '应用锁设置失败'); }
};
document.addEventListener('visibilitychange', () => { if (document.hidden && appLockEnabled) showAppLock(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && autoBackupTimer) scheduleAutoBackup(0); });
async function loadLedger() {
  try {
    data = await JianjiStore.initialize();
    normalizeData();
    ledgerLoaded = true;
    refreshCategoryUI();
    refreshAccountUI();
    refreshProjectUI();
    render();
    switchPage(location.hash.slice(1), false);
    refreshPaymentNotices();
    if (onAndroid()) window.Capacitor.nativePromise('Reminder', 'status', {}).then(status => { reminderEnabled = Boolean(status.enabled); return syncReminders(); }).catch(() => {});
    if (onAndroid()) refreshAutoBackupStatus().then(() => {
      if (autoBackupConfigured) window.Capacitor.nativePromise('AutoBackup', 'status', {}).then(status => { if (!status.lastSavedAt) scheduleAutoBackup(0); }).catch(() => {});
    }).catch(() => { $('autoBackupStatus').textContent = '自动备份状态无法读取'; });
  } catch (error) {
    document.querySelector('main').innerHTML = `<section class="card"><h2>账本暂时无法打开</h2><p>${escapeHtml(error.message || '数据库读取失败')}</p><p>请保留应用数据，重新打开应用后重试。</p></section>`;
  }
}
async function start() {
  if (!onAndroid()) { showAppLock(false); return loadLedger(); }
  $('appLockSetting').hidden = false;
  try {
    appLockEnabled = Boolean((await window.Capacitor.nativePromise('AppLock', 'status', {})).enabled);
    $('appLockSetting').textContent = appLockEnabled ? '关闭应用锁' : '开启应用锁';
    if (appLockEnabled) { showAppLock(true); return; }
    showAppLock(false);
    return loadLedger();
  } catch (error) { $('appLockStatus').textContent = error.message || '无法检查应用锁，请重启应用'; }
}
start();
