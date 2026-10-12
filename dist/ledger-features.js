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
      if (entry.type === 'excluded' && Number.isFinite(Number(entry.accountDelta))) return balance + Number(entry.accountDelta);
      return balance + (entry.type === 'income' || entry.type === 'refund' ? amount : entry.type === 'expense' ? -amount : 0);
    }, (Number(account.openingBalance) || 0) + (account.reconciliations || []).reduce((sum, item) => sum + (Number(item.delta) || 0), 0));
  }
  function accountBalanceAsOf(account, entries, date) {
    return accountBalance({ ...account, reconciliations: (account.reconciliations || []).filter(item => item.date <= date) }, entries.filter(entry => entry.date <= date));
  }
  function projectNet(projectId, entries) {
    return entries.filter(entry => !entry.deletedAt && (entry.projectIds || []).includes(projectId)).reduce((sum, entry) => sum + (entry.type === 'expense' ? Number(entry.amount) : entry.type === 'refund' ? -Number(entry.amount) : 0), 0);
  }
  function receivableOutstanding(loan, entries) {
    const paid = entries.filter(entry => !entry.deletedAt && entry.receivableId === loan.id && entry.receivableKind === 'repayment')
      .reduce((sum, entry) => sum + cents(entry.amount), 0);
    return Math.max(0, (cents(loan.amount) - paid) / 100);
  }
  function cashFlowForecast(ledger, today = new Date(), accountId = '') {
    const todayText = dateText(today);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
    const selectedAccounts = accountId ? (ledger.accounts || []).filter(account => account.id === accountId) : ledger.accounts || [];
    const startBalance = selectedAccounts.length ? selectedAccounts.reduce((sum, account) => sum + accountBalanceAsOf(account, ledger.entries || [], todayText), 0) : null;
    const events = [];
    for (const entry of ledger.entries || []) {
      if (entry.deletedAt || entry.date <= todayText || entry.date > dateText(end)) continue;
      let delta = entry.type === 'income' || entry.type === 'refund' ? Number(entry.amount) : entry.type === 'expense' ? -Number(entry.amount) : Number(entry.accountDelta) || 0;
      if (entry.transferFrom && entry.transferTo) delta = accountId ? (entry.transferFrom === accountId ? -Number(entry.amount) : entry.transferTo === accountId ? Number(entry.amount) : 0) : 0;
      else if (accountId && entry.accountId !== accountId) delta = 0;
      else if (!accountId && selectedAccounts.length && !selectedAccounts.some(account => account.id === entry.accountId)) delta = 0;
      if (delta) events.push({ date: entry.date, label: entry.note || '已记账', delta, kind: 'recorded' });
    }
    for (const plan of ledger.cashFlowPlans || []) {
      if (plan.done || plan.date <= todayText || plan.date > dateText(end) || accountId && plan.accountId !== accountId || !accountId && selectedAccounts.length && !selectedAccounts.some(account => account.id === plan.accountId)) continue;
      events.push({ date: plan.date, label: plan.note || '计划收支', delta: plan.type === 'income' ? Number(plan.amount) : -Number(plan.amount), kind: 'plan' });
    }
    for (const rule of ledger.recurring || []) {
      if (rule.active === false || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate || '') || accountId && rule.accountId !== accountId || !accountId && selectedAccounts.length && !selectedAccounts.some(account => account.id === rule.accountId)) continue;
      const [year, month, day] = rule.startDate.split('-').map(Number);
      const first = new Date(year, month - 1, day);
      if (rule.frequency === 'weekly') {
        for (let due = new Date(first); due <= end; due.setDate(due.getDate() + 7)) {
          const date = dateText(due);
          if (date > todayText && !ledger.recurringAcknowledged?.[`${rule.id}|${date}`]) events.push({ date, label: rule.note || '周期账目', delta: rule.type === 'income' ? Number(rule.amount) : -Number(rule.amount), kind: 'recurring' });
        }
      } else {
        for (let offset = 0; offset <= (end.getFullYear() - year) * 12 + end.getMonth() - (month - 1); offset += rule.frequency === 'yearly' ? 12 : 1) {
          const due = new Date(year, month - 1 + offset, Math.min(day, new Date(year, month + offset, 0).getDate()));
          const date = dateText(due);
          if (date > todayText && !ledger.recurringAcknowledged?.[`${rule.id}|${date}`]) events.push({ date, label: rule.note || '周期账目', delta: rule.type === 'income' ? Number(rule.amount) : -Number(rule.amount), kind: 'recurring' });
        }
      }
    }
    let running = startBalance ?? 0;
    const days = [];
    for (let date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); date <= end; date.setDate(date.getDate() + 1)) {
      const day = dateText(date);
      const items = events.filter(event => event.date === day);
      running += items.reduce((sum, item) => sum + item.delta, 0);
      days.push({ date: day, events: items, balance: running });
    }
    return { startBalance, days };
  }
  function nextRecurringDate(rule, acknowledged = {}, today = new Date()) {
    if (rule.active === false || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate || '')) return null;
    const [year, month, day] = rule.startDate.split('-').map(Number);
    const current = dateText(today);
    if (rule.frequency === 'weekly') {
      const due = new Date(year, month - 1, day);
      const gap = Math.max(0, Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - due) / 604800000));
      due.setDate(due.getDate() + gap * 7);
      for (let i = 0; i < 10000; i++, due.setDate(due.getDate() + 7)) if (dateText(due) >= current && !acknowledged[`${rule.id}|${dateText(due)}`]) return dateText(due);
    } else {
      const step = rule.frequency === 'yearly' ? 12 : 1;
      const elapsed = Math.max(0, (today.getFullYear() - year) * 12 + today.getMonth() - month + 1);
      for (let offset = Math.floor(elapsed / step) * step; offset < elapsed + 12000; offset += step) {
        const due = new Date(year, month - 1 + offset, Math.min(day, new Date(year, month + offset, 0).getDate()));
        if (dateText(due) >= current && !acknowledged[`${rule.id}|${dateText(due)}`]) return dateText(due);
      }
    }
    return null;
  }
  function subscriptionMonthly(rules) {
    return rules.filter(rule => rule.subscription && rule.active !== false).reduce((sum, rule) => sum + Number(rule.amount) * (rule.frequency === 'yearly' ? 1 / 12 : rule.frequency === 'weekly' ? 52 / 12 : 1), 0);
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
        for (let offset = 0; offset <= months; offset += rule.frequency === 'yearly' ? 12 : 1) {
          const due = new Date(year, month - 1 + offset, Math.min(day, new Date(year, month + offset, 0).getDate()));
          if (due < start || due > end) continue;
          const date = dateText(due);
          if (!acknowledged[`${rule.id}|${date}`]) result.push({ rule, date });
        }
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }
  const api = { nextRecurringDate, subscriptionMonthly, possibleDuplicates, recurringOccurrences, accountBalance, accountBalanceAsOf, projectNet, receivableOutstanding, cashFlowForecast, reconcileDifference, annualPlanProgress, daysWithoutEntry, classifyImport, expenseParts, categoryNet, netExpense, validSplits, refundAvailable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis);
