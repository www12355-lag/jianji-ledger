(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const toBase64 = bytes => {
    let text = '';
    for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return btoa(text);
  };
  const fromBase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));
  async function keyFor(password, salt) {
    const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, passwordKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function validateData(value) {
    if (!value || !Array.isArray(value.entries) || !value.budgets || typeof value.budgets !== 'object' || Array.isArray(value.budgets)) throw new Error('备份内容缺少账目或预算');
    if (value.entries.length > 100000 || value.entries.some(entry => !entry || !['expense', 'income', 'excluded', 'refund'].includes(entry.type) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Number(entry.amount)) || Number(entry.amount) <= 0 || entry.type === 'refund' && (entry.refundOf === undefined || typeof entry.category !== 'string') || entry.accountDelta !== undefined && !Number.isFinite(Number(entry.accountDelta)) || entry.projectIds && (!Array.isArray(entry.projectIds) || entry.projectIds.length > 100 || entry.projectIds.some(id => typeof id !== 'string')) || entry.splits && (!Array.isArray(entry.splits) || entry.type !== 'expense' || entry.splits.length < 2 || entry.splits.some(part => !part || typeof part.category !== 'string' || !Number.isFinite(Number(part.amount)) || Number(part.amount) <= 0) || Math.round(entry.splits.reduce((sum, part) => sum + Number(part.amount), 0) * 100) !== Math.round(Number(entry.amount) * 100)))) throw new Error('备份中的账目格式不正确');
    const originals = new Map(value.entries.filter(entry => entry.type === 'expense').map(entry => [String(entry.id), entry]));
    const returned = new Map();
    for (const refund of value.entries.filter(entry => entry.type === 'refund')) {
      const original = originals.get(String(refund.refundOf));
      const part = original && (original.splits?.length ? original.splits : [{ category: original.category, amount: original.amount }]).find(item => item.category === refund.category);
      if (!part) throw new Error('备份中的退款缺少原支出');
      if (refund.deletedAt) continue;
      const key = `${refund.refundOf}\u0000${refund.category}`;
      const total = (returned.get(key) || 0) + Math.round(Number(refund.amount) * 100);
      if (total > Math.round(Number(part.amount) * 100)) throw new Error('备份中的退款超过原支出');
      returned.set(key, total);
    }
    if (value.customCategories && (!Array.isArray(value.customCategories) || value.customCategories.length > 100)) throw new Error('备份中的分类格式不正确');
    if (value.recurring && (!Array.isArray(value.recurring) || value.recurring.length > 1000)) throw new Error('备份中的周期账目格式不正确');
    if (value.accounts && (!Array.isArray(value.accounts) || value.accounts.length > 1000 || value.accounts.some(account => !account || typeof account.id !== 'string' || typeof account.name !== 'string' || !Number.isFinite(Number(account.openingBalance))))) throw new Error('备份中的账户格式不正确');
    if (value.importRules && (!Array.isArray(value.importRules) || value.importRules.length > 1000 || value.importRules.some(rule => !rule || typeof rule.keyword !== 'string' || typeof rule.category !== 'string'))) throw new Error('备份中的分类规则格式不正确');
    if (value.accounts?.some(account => account.reconciliations && (!Array.isArray(account.reconciliations) || account.reconciliations.length > 10000 || account.reconciliations.some(item => !item || typeof item.id !== 'string' || !Number.isFinite(Number(item.actual)) || !Number.isFinite(Number(item.delta)))))) throw new Error('备份中的对账记录格式不正确');
    if (value.templates && (!Array.isArray(value.templates) || value.templates.length > 1000 || value.templates.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !['expense', 'income'].includes(item.type) || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0))) throw new Error('备份中的速记模板格式不正确');
    if (value.annualPlans && (!Array.isArray(value.annualPlans) || value.annualPlans.length > 1000 || value.annualPlans.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isInteger(Number(item.year)) || Number(item.month) < 1 || Number(item.month) > 12 || !Number.isFinite(Number(item.target)) || Number(item.target) <= 0 || !Array.isArray(item.contributions) || item.contributions.length > 10000 || item.contributions.some(part => !part || !Number.isFinite(Number(part.amount)) || Number(part.amount) <= 0)))) throw new Error('备份中的年度计划格式不正确');
    if (value.cashFlowPlans && (!Array.isArray(value.cashFlowPlans) || value.cashFlowPlans.length > 1000 || value.cashFlowPlans.some(item => !item || typeof item.id !== 'string' || typeof item.note !== 'string' || !['income', 'expense'].includes(item.type) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0))) throw new Error('备份中的现金流计划格式不正确');
    if (value.projects && (!Array.isArray(value.projects) || value.projects.length > 100 || value.projects.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string'))) throw new Error('备份中的项目格式不正确');
    if (value.receivables && (!Array.isArray(value.receivables) || value.receivables.length > 1000 || value.receivables.some(item => !item || typeof item.id !== 'string' || typeof item.person !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0))) throw new Error('备份中的借款格式不正确');
    if (value.entryHistory && (!Array.isArray(value.entryHistory) || value.entryHistory.length > 100 || value.entryHistory.some(item => !item || typeof item.id !== 'string' || typeof item.recordId !== 'string' || typeof item.action !== 'string' || typeof item.time !== 'string'))) throw new Error('备份中的修改历史格式不正确');
  }
  async function createBackup(data, photos, password) {
    if (password.length < 8) throw new Error('备份密码至少 8 位');
    validateData(data);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = encoder.encode(JSON.stringify({ data, photos }));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(password, salt), payload);
    return JSON.stringify({ format: 'jianji-backup', version: 1, salt: toBase64(salt), iv: toBase64(iv), payload: toBase64(new Uint8Array(ciphertext)) });
  }
  async function readBackup(text, password) {
    let envelope;
    try { envelope = JSON.parse(text); } catch { throw new Error('不是有效的简记备份文件'); }
    if (envelope?.format !== 'jianji-backup' || envelope.version !== 1 || !envelope.salt || !envelope.iv || !envelope.payload) throw new Error('备份格式或版本不受支持');
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, await keyFor(password, fromBase64(envelope.salt)), fromBase64(envelope.payload)); }
    catch { throw new Error('密码错误或备份文件已损坏'); }
    const parsed = JSON.parse(decoder.decode(plain));
    validateData(parsed.data);
    if (!Array.isArray(parsed.photos) || parsed.photos.length > 10000 || parsed.photos.some(photo => typeof photo.id !== 'string' || typeof photo.mime !== 'string' || typeof photo.base64 !== 'string')) throw new Error('备份中的图片格式不正确');
    return parsed;
  }
  const api = { createBackup, readBackup, toBase64, fromBase64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiBackup = api;
})(typeof window !== 'undefined' ? window : globalThis);
