const cats = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '其他'];
const icons = { 餐饮: '☕', 交通: '🚆', 购物: '🛍', 居住: '⌂', 娱乐: '♫', 医疗: '✚', 其他: '◈' };
const $ = id => document.getElementById(id);
const now = new Date();
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let activePage = 'home';
let detailFilter = 'all';
let entryType = 'expense';
let selectedImage = null;
let previewUrl = null;
let visibleImageUrls = [];
let pendingImport = [];
let data;
try { data = JSON.parse(localStorage.getItem('jianji-v1')) || { entries: [], budgets: {} }; }
catch { data = { entries: [], budgets: {} }; }
if (!Array.isArray(data.entries)) data.entries = [];
if (!data.budgets || typeof data.budgets !== 'object') data.budgets = {};
const money = n => '¥ ' + Number(n || 0).toFixed(2);
const key = () => `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}`;
const save = () => localStorage.setItem('jianji-v1', JSON.stringify(data));
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
  container.innerHTML = list.map(e => `<div class="record"><div class="icon">${e.type === 'income' ? '¥' : icons[e.category] || icons.其他}</div><div class="recordtext"><b></b><small>${escapeHtml(e.date)} · ${escapeHtml(e.type === 'income' ? '收入' : e.category)}</small></div>${e.photoId ? `<img class="record-photo" data-photo-id="${escapeHtml(e.photoId)}" alt="记录图片" hidden>` : ''}<div class="amount ${e.type === 'income' ? 'income' : ''}">${e.type === 'income' ? '+' : '−'}${money(e.amount)}</div><div class="actions"><button data-delete="${escapeHtml(e.id)}" aria-label="删除记录">×</button></div></div>`).join('') || `<div class="empty">${emptyText}</div>`;
  [...container.querySelectorAll('.record')].forEach((row, index) => {
    row.querySelector('b').textContent = list[index].note || (list[index].type === 'income' ? '月度收入' : list[index].category);
  });
}
function renderStats(list, income, expense) {
  $('statsIncome').textContent = money(income);
  $('statsExpense').textContent = money(expense);
  $('statsBalance').textContent = money(income - expense);
  const categoryTotals = cats.map(category => ({
    category,
    total: list.filter(e => e.type === 'expense' && e.category === category).reduce((sum, e) => sum + Number(e.amount), 0)
  })).filter(item => item.total > 0).sort((a, b) => b.total - a.total);
  $('categoryStats').innerHTML = categoryTotals.map(item => `<div class="category-row"><div class="rowtop"><b>${icons[item.category]} ${item.category}</b><span>${money(item.total)}</span></div><small>占本月支出 ${Math.round(item.total / expense * 100)}%</small><div class="track"><div class="fill" style="width:${Math.min(100, item.total / expense * 100)}%"></div></div></div>`).join('') || '<div class="empty">本月还没有支出记录</div>';
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(view.getFullYear(), view.getMonth() - 5 + index, 1);
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entries = data.entries.filter(e => e.date && e.date.startsWith(ym));
    return {
      label: `${date.getMonth() + 1}月`,
      income: entries.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0),
      expense: entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
    };
  });
  const maximum = Math.max(...months.flatMap(month => [month.income, month.expense]));
  $('trendStats').innerHTML = maximum > 0 ? `<div class="trend-chart">${months.map(month => `<div class="trend-col" aria-label="${month.label}收入${money(month.income)}，支出${money(month.expense)}"><div class="trend-bars"><div class="trend-bar income" style="height:${month.income / maximum * 100}%"></div><div class="trend-bar expense" style="height:${month.expense / maximum * 100}%"></div></div><label>${month.label}</label></div>`).join('')}</div>` : '<div class="empty">近 6 个月还没有收支记录</div>';
}
function render() {
  visibleImageUrls.forEach(url => URL.revokeObjectURL(url));
  visibleImageUrls = [];
  const ym = key();
  const list = data.entries.filter(e => e.date && e.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('month').textContent = `${view.getFullYear()}年${view.getMonth() + 1}月`;
  const income = list.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0);
  const expense = list.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0);
  $('income').textContent = money(income);
  $('expense').textContent = money(expense);
  $('balance').textContent = money(income - expense);
  const filtered = detailFilter === 'all' ? list : list.filter(e => e.type === detailFilter);
  $('count').textContent = `共 ${filtered.length} 笔`;
  const budgets = data.budgets[ym] || {};
  $('budgets').innerHTML = cats.filter(c => Number(budgets[c]) > 0).map(c => {
    const used = list.filter(e => e.type === 'expense' && e.category === c).reduce((sum, e) => sum + Number(e.amount), 0);
    const limit = Number(budgets[c]);
    const percent = used / limit * 100;
    return `<div class="budgetrow"><div class="rowtop"><b>${icons[c]} ${c}</b><span>${money(used)} <span class="muted">/ ${money(limit)}</span></span></div><div class="track"><div class="fill ${percent >= 100 ? 'over' : percent >= 80 ? 'warn' : ''}" style="width:${Math.min(100, percent)}%"></div></div></div>`;
  }).join('') || '<div class="empty">还没有设置预算，点右上角开始设置</div>';
  renderRecordList('recentRecords', list.slice(0, 3), '这个月还没有记录，点「记一笔」开始');
  renderRecordList('records', filtered, filtered.length ? '' : detailFilter === 'all' ? '这个月还没有记录，点「记一笔」开始' : '这个月没有这类记录');
  renderStats(list, income, expense);
  loadVisiblePhotos();
}
function switchPage(page, updateHash = true) {
  activePage = ['home', 'details', 'stats'].includes(page) ? page : 'home';
  for (const name of ['home', 'details', 'stats']) $(name + 'Page').hidden = name !== activePage;
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
  $('categoryField').style.display = type === 'income' ? 'none' : 'block';
}
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
$('entryCategory').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
$('budgetCategory').innerHTML = cats.map(c => `<option>${c}</option>`).join('');
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
$('add').onclick = () => {
  $('entryForm').reset();
  $('entryDate').value = new Date().toLocaleDateString('en-CA');
  clearSelectedImage();
  setType('expense');
  open('entryModal');
  $('entryAmount').focus();
};
$('setbudget').onclick = () => {
  $('budgetCategory').value = cats[0];
  $('budgetAmount').value = (data.budgets[key()] || {})[cats[0]] ?? '';
  open('budgetModal');
};
$('budgetCategory').onchange = () => { $('budgetAmount').value = (data.budgets[key()] || {})[$('budgetCategory').value] ?? ''; };
$('expenseTab').onclick = () => setType('expense');
$('incomeTab').onclick = () => setType('income');
$('cameraButton').onclick = () => $('cameraInput').click();
$('imageButton').onclick = () => $('imageInput').click();
$('cameraInput').onchange = e => selectImage(e.target.files[0]);
$('imageInput').onchange = e => selectImage(e.target.files[0]);
$('removePhoto').onclick = clearSelectedImage;
$('openImport').onclick = () => {
  pendingImport = [];
  $('billFile').value = '';
  $('billFileName').textContent = '尚未选择文件';
  $('importSummary').textContent = '选择文件后会先预览，不会立即入账。';
  $('importPreview').replaceChildren();
  $('confirmImport').disabled = true;
  open('importModal');
};
$('chooseBillFile').onclick = () => $('billFile').click();
function updateImportSelection() {
  const selected = $('importPreview').querySelectorAll('input[type="checkbox"]:checked').length;
  $('confirmImport').disabled = selected === 0;
  $('confirmImport').textContent = selected ? `确认导入 ${selected} 笔` : '确认导入';
}
$('billFile').onchange = async event => {
  pendingImport = [];
  $('importPreview').replaceChildren();
  $('confirmImport').disabled = true;
  const file = event.target.files[0];
  if (!file) return;
  $('billFileName').textContent = file.name;
  $('importSummary').textContent = '正在识别账单…';
  try {
    const text = await JianjiBillImport.readCsvFile(file);
    const result = JianjiBillImport.parseBill(text, file.name, data.entries.map(entry => entry.importKey).filter(Boolean));
    pendingImport = result.entries;
    $('importSummary').textContent = `识别为${result.source}账单：${result.entries.length} 笔可导入，${result.skipped.duplicate} 笔重复，${result.skipped.ignored} 行未计入。请核对金额与分类。`;
    $('importPreview').innerHTML = result.entries.map((entry, index) => `<div class="import-item"><input type="checkbox" data-import-index="${index}" aria-label="导入第 ${index + 1} 笔" checked><div class="import-item-main"><b>${escapeHtml(entry.note)}</b><small>${escapeHtml(entry.transactionTime)} · ${entry.source} · ${entry.type === 'income' ? '收入' : '支出'}</small>${entry.type === 'expense' ? `<select data-category-index="${index}" aria-label="${escapeHtml(entry.note)}的分类">${cats.map(category => `<option${category === entry.category ? ' selected' : ''}>${category}</option>`).join('')}</select>` : ''}</div><span class="import-item-amount ${entry.type === 'income' ? 'income' : ''}">${entry.type === 'income' ? '+' : '−'}${money(entry.amount)}</span></div>`).join('');
    updateImportSelection();
  } catch (error) {
    $('importSummary').textContent = error.message || '账单识别失败';
  }
};
$('importPreview').onchange = event => {
  if (event.target.matches('[data-category-index]')) pendingImport[Number(event.target.dataset.categoryIndex)].category = event.target.value;
  updateImportSelection();
};
$('confirmImport').onclick = () => {
  const selected = [...$('importPreview').querySelectorAll('[data-import-index]:checked')].map(box => pendingImport[Number(box.dataset.importIndex)]);
  if (!selected.length) return;
  const before = data.entries.length;
  data.entries.push(...selected.map(entry => ({ ...entry, id: Date.now() + Math.random() })));
  try { save(); }
  catch {
    data.entries.length = before;
    toast('导入保存失败，请缩小账单时间范围');
    return;
  }
  const latest = selected.reduce((date, entry) => entry.date > date ? entry.date : date, '');
  view = new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1);
  close('importModal');
  render();
  switchPage('details');
  toast(`已导入 ${selected.length} 笔记录`);
};
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => close(button.dataset.close));
document.querySelectorAll('.modalback').forEach(modal => modal.onclick = e => { if (e.target === modal) close(modal.id); });
$('entryForm').onsubmit = async e => {
  e.preventDefault();
  const amount = Number($('entryAmount').value);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const entry = { id: Date.now() + Math.random(), type: entryType, amount, date: $('entryDate').value, category: entryType === 'expense' ? $('entryCategory').value : '', note: $('entryNote').value.trim() };
  if (selectedImage) {
    entry.photoId = String(entry.id);
    try { await photoStore('put', entry.photoId, selectedImage); }
    catch { toast('图片保存失败，请检查浏览器存储空间'); return; }
  }
  try { data.entries.push(entry); save(); }
  catch {
    data.entries.pop();
    if (entry.photoId) photoStore('delete', entry.photoId).catch(() => {});
    toast('记录保存失败，请检查浏览器存储空间');
    return;
  }
  close('entryModal');
  clearSelectedImage();
  render();
  toast('已保存记录');
};
$('budgetForm').onsubmit = e => {
  e.preventDefault();
  const amount = Number($('budgetAmount').value);
  if (!Number.isFinite(amount) || amount < 0) return;
  data.budgets[key()] ??= {};
  data.budgets[key()][$('budgetCategory').value] = amount;
  save(); close('budgetModal'); render(); toast('预算已更新');
};
function handleRecordClick(e) {
  if (e.target.matches('.record-photo')) { window.open(e.target.src, '_blank'); return; }
  const button = e.target.closest('[data-delete]');
  if (!button || !confirm('确定删除这笔记录吗？')) return;
  const entry = data.entries.find(item => String(item.id) === button.dataset.delete);
  data.entries = data.entries.filter(item => String(item.id) !== button.dataset.delete);
  save();
  if (entry?.photoId) photoStore('delete', entry.photoId).catch(() => {});
  render(); toast('记录已删除');
}
document.querySelectorAll('.record-list').forEach(container => container.onclick = handleRecordClick);
render();
switchPage(location.hash.slice(1), false);
