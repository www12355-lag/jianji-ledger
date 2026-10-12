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
    }, Number(account.openingBalance) || 0);
  }
  function classifyImport(entry, rules) {
    if (entry.type !== 'expense') return entry;
    const note = String(entry.note || '').toLocaleLowerCase();
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
  const api = { possibleDuplicates, recurringOccurrences, accountBalance, classifyImport, expenseParts, categoryNet, netExpense, validSplits, refundAvailable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis);
