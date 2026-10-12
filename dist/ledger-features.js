(function (root) {
  'use strict';

  const dateText = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function possibleDuplicates(candidate, entries) {
    return entries.filter(entry => entry.date === candidate.date
      && entry.type === candidate.type
      && Math.abs(Number(entry.amount) - Number(candidate.amount)) < 0.005
      && !entry.importKey);
  }
  const cents = value => Math.round(Number(value) * 100);
  function expenseParts(entry) {
    if (entry.type !== 'expense') return [];
    return Array.isArray(entry.splits) && entry.splits.length
      ? entry.splits.map(part => ({ category: part.category, amount: Number(part.amount) }))
      : [{ category: entry.category, amount: Number(entry.amount) }];
  }
  function categoryNet(entry, category) {
    if (entry.type === 'refund') return entry.category === category ? -Number(entry.amount) : 0;
    return expenseParts(entry).filter(part => part.category === category).reduce((total, part) => total + part.amount, 0);
  }
  function netExpense(entries) {
    return entries.reduce((total, entry) => total + (entry.type === 'expense' ? Number(entry.amount) : entry.type === 'refund' ? -Number(entry.amount) : 0), 0);
  }
  function validSplits(amount, splits, categories) {
    return Array.isArray(splits) && splits.length >= 2
      && splits.every(part => categories.includes(part.category) && Number.isFinite(Number(part.amount)) && cents(part.amount) > 0)
      && new Set(splits.map(part => part.category)).size === splits.length
      && splits.reduce((sum, part) => sum + cents(part.amount), 0) === cents(amount);
  }
  function refundAvailable(original, category, entries, excludeId = null) {
    const part = expenseParts(original).find(item => item.category === category);
    if (!part) return 0;
    const returned = entries.filter(item => item.type === 'refund' && !item.deletedAt && String(item.refundOf) === String(original.id) && String(item.id) !== String(excludeId) && item.category === category)
      .reduce((sum, item) => sum + cents(item.amount), 0);
    return Math.max(0, cents(part.amount) - returned) / 100;
  }
  function accountBalance(account, entries) {
    return entries.filter(entry => !entry.deletedAt).reduce((balance, entry) => {
      const amount = Number(entry.amount) || 0;
      if (entry.transferFrom === account.id) return balance - amount;
      if (entry.transferTo === account.id) return balance + amount;
      if (entry.accountId !== account.id) return balance;
      return balance + (entry.type === 'income' || entry.type === 'refund' ? amount : entry.type === 'expense' ? -amount : 0);
    }, (Number(account.openingBalance) || 0) + (account.reconciliations || []).reduce((sum, item) => sum + (Number(item.delta) || 0), 0));
  }
  function reconcileDifference(account, entries, actual) {
    if (!Number.isFinite(Number(actual))) throw new Error('实际余额无效');
    return (cents(actual) - cents(accountBalance(account, entries))) / 100;
  }
  function annualPlanProgress(plan, entries) {
    const target = Number(plan.target) || 0;
    const saved = (plan.contributions || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const remaining = Math.max(0, target - saved);
    const today = new Date();
    const deadline = new Date(Number(plan.year), Number(plan.month), 0);
    const months = (deadline.getFullYear() - today.getFullYear()) * 12 + deadline.getMonth() - today.getMonth() + 1;
    const spent = entries.filter(entry => !entry.deletedAt && entry.date?.startsWith(String(plan.year)))
      .reduce((sum, entry) => sum + (plan.category ? categoryNet(entry, plan.category) : 0), 0);
    return { saved, remaining, monthly: months > 0 ? remaining / months : 0, overdue: months <= 0, spent };
  }
  function daysWithoutEntry(entries, today = new Date()) {
    const current = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const last = entries.filter(entry => !entry.deletedAt && entry.type !== 'excluded' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date || ''))
      .map(entry => entry.date).sort().at(-1);
    if (!last) return 0;
    const [year, month, day] = last.split('-').map(Number);
    return Math.max(0, Math.floor((current - Date.UTC(year, month - 1, day)) / 86400000));
  }
  function classifyImport(entry, rules) {
    if (entry.type !== 'expense') return entry;
    const note = `${entry.merchant || ''} ${entry.note || ''}`.toLocaleLowerCase();
    const match = rules.find(rule => (!rule.source || rule.source === entry.source)
      && String(rule.keyword || '').trim()
      && note.includes(rule.keyword.trim().toLocaleLowerCase()));
    return match ? { ...entry, category: match.category, matchedRuleId: match.id } : entry;
  }
  function recurringOccurrences(rules, acknowledged, today = new Date()) {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const result = [];
    for (const rule of rules) {
      if (rule.active === false || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)) continue;
      const [year, month, day] = rule.startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      if (Number.isNaN(start.getTime()) || start > end) continue;
      if (rule.frequency === 'weekly') {
        for (let due = new Date(start); due <= end; due.setDate(due.getDate() + 7)) {
          const date = dateText(due);
          if (!acknowledged[`${rule.id}|${date}`]) result.push({ rule, date });
        }
      } else {
        const months = (end.getFullYear() - year) * 12 + end.getMonth() - (month - 1);
        for (let offset = 0; offset <= months; offset++) {
          const due = new Date(year, month - 1 + offset, Math.min(day, new Date(year, month + offset, 0).getDate()));
          if (due < start || due > end) continue;
          const date = dateText(due);
          if (!acknowledged[`${rule.id}|${date}`]) result.push({ rule, date });
        }
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }
  const api = { possibleDuplicates, recurringOccurrences, accountBalance, reconcileDifference, annualPlanProgress, daysWithoutEntry, classifyImport, expenseParts, categoryNet, netExpense, validSplits, refundAvailable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis);
