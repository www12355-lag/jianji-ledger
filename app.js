const cats = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '其他'];
const icons = { 餐饮: '☕', 交通: '🚆', 购物: '🛍', 居住: '⌂', 娱乐: '♫', 医疗: '✚', 其他: '◈' };
const $ = id => document.getElementById(id);
const now = new Date();
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let entryType = 'expense';
let selectedImage = null;
let previewUrl = null;
let visibleImageUrls = [];
let data;
try { data = JSON.parse(localStorage.getItem('jianji-v1')) || { entries: [], budgets: {} }; }
catch { data = { entries: [], budgets: {} }; }
if (!Array.isArray(data.entries)) data.entries = [];
if (!data.budgets || typeof data.budgets !== 'object') data.budgets = {};
const money = n => '¥ ' + Number(n || 0).toFixed(2);
const key = () => `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}`;
const save = () => localStorage.setItem('jianji-v1', JSON.stringify(data));
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
  $('count').textContent = `共 ${list.length} 笔`;
  const budgets = data.budgets[ym] || {};
  $('budgets').innerHTML = cats.filter(c => Number(budgets[c]) > 0).map(c => {
    const used = list.filter(e => e.type === 'expense' && e.category === c).reduce((sum, e) => sum + Number(e.amount), 0);
    const limit = Number(budgets[c]);
    const percent = used / limit * 100;
    return `<div class="budgetrow"><div class="rowtop"><b>${icons[c]} ${c}</b><span>${money(used)} <span class="muted">/ ${money(limit)}</span></span></div><div class="track"><div class="fill ${percent >= 100 ? 'over' : percent >= 80 ? 'warn' : ''}" style="width:${Math.min(100, percent)}%"></div></div></div>`;
  }).join('') || '<div class="empty">还没有设置预算，点右上角开始设置</div>';
  $('records').innerHTML = list.map(e => `<div class="record"><div class="icon">${e.type === 'income' ? '¥' : icons[e.category] || icons.其他}</div><div class="recordtext"><b></b><small>${e.date} · ${e.type === 'income' ? '收入' : e.category}</small></div>${e.photoId ? `<img class="record-photo" data-photo-id="${e.photoId}" alt="记录图片" hidden>` : ''}<div class="amount ${e.type === 'income' ? 'income' : ''}">${e.type === 'income' ? '+' : '−'}${money(e.amount)}</div><div class="actions"><button data-delete="${e.id}" aria-label="删除记录">×</button></div></div>`).join('') || '<div class="empty">这个月还没有记录，点「记一笔」开始</div>';
  [...$('records').querySelectorAll('.record')].forEach((row, index) => row.querySelector('b').textContent = list[index].note || (list[index].type === 'income' ? '月度收入' : list[index].category));
  loadVisiblePhotos();
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
$('records').onclick = e => {
  if (e.target.matches('.record-photo')) { window.open(e.target.src, '_blank'); return; }
  const button = e.target.closest('[data-delete]');
  if (!button || !confirm('确定删除这笔记录吗？')) return;
  const entry = data.entries.find(item => String(item.id) === button.dataset.delete);
  data.entries = data.entries.filter(item => String(item.id) !== button.dataset.delete);
  save();
  if (entry?.photoId) photoStore('delete', entry.photoId).catch(() => {});
  render(); toast('记录已删除');
};
render();
