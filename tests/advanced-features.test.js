const assert = require('node:assert/strict');
const { accountBalance, accountBalanceAsOf, projectNet, receivableOutstanding, cashFlowForecast } = require('../ledger-features.js');
const { toCsv } = require('../csv-export.js');
const { createBackup, readBackup } = require('../backup-tools.js');

const account = { id: 'cash', openingBalance: 100 };
const entries = [
  { id: 'e1', date: '2026-10-10', type: 'expense', amount: 20, accountId: 'cash', projectIds: ['trip'], category: '餐饮' },
  { id: 'e2', date: '2026-10-11', type: 'refund', amount: 5, accountId: 'cash', projectIds: ['trip'], refundOf: 'e1', category: '餐饮' },
  { id: 'loan', date: '2026-10-12', type: 'excluded', amount: 30, accountId: 'cash', accountDelta: -30, receivableId: 'r1', receivableKind: 'loan' },
  { id: 'payment', date: '2026-10-13', type: 'excluded', amount: 10, accountId: 'cash', accountDelta: 10, receivableId: 'r1', receivableKind: 'repayment' }
];
assert.equal(accountBalance(account, entries), 65);
assert.equal(accountBalanceAsOf(account, entries, '2026-10-11'), 85);
assert.equal(projectNet('trip', entries), 15);
assert.equal(receivableOutstanding({ id: 'r1', amount: 30 }, entries), 20);
assert.equal(receivableOutstanding({ id: 'r1', amount: 30 }, [...entries, { id: 'deleted', type: 'excluded', amount: 10, receivableId: 'r1', receivableKind: 'repayment', deletedAt: '2026-10-14' }]), 20);

const forecast = cashFlowForecast({
  accounts: [account], entries, recurringAcknowledged: {},
  recurring: [{ id: 'salary', type: 'income', amount: 50, frequency: 'monthly', startDate: '2026-10-15', note: '工资', accountId: 'cash' }],
  cashFlowPlans: [{ id: 'rent', type: 'expense', amount: 20, date: '2026-10-16', note: '房租', accountId: 'cash' }]
}, new Date(2026, 9, 13));
assert.equal(forecast.startBalance, 65);
assert.equal(forecast.days.find(day => day.date === '2026-10-15').balance, 115);
assert.equal(forecast.days.find(day => day.date === '2026-10-16').balance, 95);
assert.equal(cashFlowForecast({ accounts: [account], entries, cashFlowPlans: [{ id: 'other', type: 'expense', amount: 99, date: '2026-10-14', accountId: 'bank' }] }, new Date(2026, 9, 13), 'cash').days.find(day => day.date === '2026-10-14').balance, 65);
const csv = toCsv({ accounts: [account], projects: [{ id: 'trip', name: '旅行' }], entries });
assert.match(csv, /项目标签/);
assert.match(csv, /旅行/);
assert.match(csv, /r1/);
const backupData = { entries, budgets: {}, projects: [{ id: 'trip', name: '旅行' }], cashFlowPlans: [{ id: 'rent', note: '房租', type: 'expense', amount: 20, date: '2026-10-16' }], receivables: [{ id: 'r1', person: '小王', amount: 30, date: '2026-10-12', dueDate: '2026-11-12' }], entryHistory: [{ id: 'h1', recordId: 'e1', action: '编辑', time: '2026-10-13T10:00:00', before: entries[0], after: entries[0] }] };
(async () => {
  const encrypted = await createBackup(backupData, [], 'test-password');
  const restored = await readBackup(encrypted, 'test-password');
  assert.deepEqual(restored.data.projects, backupData.projects);
  assert.deepEqual(restored.data.receivables, backupData.receivables);
  console.log('advanced features: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
