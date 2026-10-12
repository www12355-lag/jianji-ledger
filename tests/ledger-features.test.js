const assert = require('node:assert/strict');
const { possibleDuplicates, recurringOccurrences, accountBalance, classifyImport } = require('../ledger-features.js');
const { createBackup, readBackup } = require('../backup-tools.js');

const existing = [
  { type: 'expense', amount: 12.5, date: '2026-10-12', note: '午餐' },
  { type: 'expense', amount: 12.5, date: '2026-10-11', note: '昨天午餐' },
  { type: 'income', amount: 12.5, date: '2026-10-12', note: '收入' },
  { type: 'expense', amount: 12.5, date: '2026-10-12', importKey: 'wx-1' }
];
assert.equal(possibleDuplicates({ type: 'expense', amount: 12.5, date: '2026-10-12' }, existing).length, 1);
assert.equal(possibleDuplicates({ type: 'expense', amount: 13, date: '2026-10-12' }, existing).length, 0);

const rules = [
  { id: 'rent', frequency: 'monthly', startDate: '2026-01-31' },
  { id: 'weekly', frequency: 'weekly', startDate: '2026-02-01' }
];
const due = recurringOccurrences(rules, { 'rent|2026-01-31': 'posted' }, new Date(2026, 1, 28));
assert(due.some(item => item.rule.id === 'rent' && item.date === '2026-02-28'));
assert(!due.some(item => item.rule.id === 'rent' && item.date === '2026-01-31'));
assert(due.some(item => item.rule.id === 'weekly' && item.date === '2026-02-22'));
const accountEntries = [
  { id: 1, type: 'income', amount: 100, accountId: 'cash' },
  { id: 2, type: 'expense', amount: 30, accountId: 'cash' },
  { id: 3, type: 'excluded', amount: 20, transferFrom: 'cash', transferTo: 'bank' },
  { id: 4, type: 'expense', amount: 5, accountId: 'cash', deletedAt: '2026-10-12' }
];
assert.equal(accountBalance({ id: 'cash', openingBalance: 10 }, accountEntries), 60);
assert.equal(accountBalance({ id: 'bank', openingBalance: 0 }, accountEntries), 20);
const rule = { id: 'metro', keyword: '地铁', source: '支付宝', category: '交通' };
assert.equal(classifyImport({ type: 'expense', note: '地铁公司', source: '支付宝', category: '其他' }, [rule]).category, '交通');
assert.equal(classifyImport({ type: 'expense', note: '地铁公司', source: '微信', category: '其他' }, [rule]).category, '其他');

(async () => {
  const ledger = { entries: [{ id: 1, type: 'expense', amount: 12.5, date: '2026-10-12', category: '餐饮', accountId: 'cash' }], budgets: {}, customCategories: [], recurring: [], recurringAcknowledged: {}, accounts: [{ id: 'cash', name: '现金', openingBalance: 20 }], importRules: [rule] };
  const file = await createBackup(ledger, [{ id: 'photo-1', mime: 'image/png', base64: 'AAE=' }], 'test-password');
  assert(!file.includes('餐饮'));
  assert.deepEqual(await readBackup(file, 'test-password'), { data: ledger, photos: [{ id: 'photo-1', mime: 'image/png', base64: 'AAE=' }] });
  await assert.rejects(readBackup(file, 'wrong-password'), /密码错误/);
  console.log('ledger features and encrypted backup: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
