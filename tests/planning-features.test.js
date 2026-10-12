const assert = require('node:assert/strict');
const { accountBalance, reconcileDifference, annualPlanProgress, daysWithoutEntry, classifyImport } = require('../ledger-features.js');
const { createBackup, readBackup } = require('../backup-tools.js');

const account = { id: 'cash', name: '现金', openingBalance: 100, reconciliations: [{ id: 'r1', date: '2026-10-10', actual: 75, delta: -5 }] };
const entries = [{ id: 'e1', type: 'expense', amount: 20, category: '交通', accountId: 'cash', date: '2026-10-10' }];
assert.equal(accountBalance(account, entries), 75);
assert.equal(reconcileDifference(account, entries, 73.5), -1.5);
assert.equal(reconcileDifference(account, entries, 75), 0);

const plan = { id: 'p1', name: '旅行', year: 2026, month: 12, target: 1200, category: '交通', contributions: [{ amount: 300 }] };
const progress = annualPlanProgress(plan, entries);
assert.equal(progress.saved, 300);
assert.equal(progress.remaining, 900);
assert.equal(progress.spent, 20);
assert.equal(annualPlanProgress(plan, [...entries, { id: 'r2', type: 'refund', category: '交通', amount: 5, date: '2026-10-11' }]).spent, 15);
assert.equal(daysWithoutEntry(entries, new Date(2026, 9, 14)), 4);
assert.equal(daysWithoutEntry([], new Date(2026, 9, 14)), 0);
assert.equal(classifyImport({ type: 'expense', merchant: '常去的咖啡店', note: '', source: '微信', category: '其他' }, [{ id: 'm1', keyword: '咖啡店', source: '', category: '餐饮' }]).category, '餐饮');

(async () => {
  const ledger = { entries, budgets: {}, accounts: [account], templates: [{ id: 't1', name: '公交', type: 'expense', amount: 2, category: '交通' }], annualPlans: [plan], missingCheckEnabled: true, importRules: [] };
  const file = await createBackup(ledger, [], 'test-password');
  assert.deepEqual((await readBackup(file, 'test-password')).data, ledger);
  console.log('planning features: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
