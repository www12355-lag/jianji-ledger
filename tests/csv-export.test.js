const assert = require('node:assert/strict');
const { toCsv } = require('../csv-export.js');
const csv = toCsv({ accounts: [{ id: 'a', name: '现金' }], entries: [
  { id: 1, date: '2026-10-12', type: 'expense', amount: 30, splits: [{ category: '餐饮', amount: 20 }, { category: '购物', amount: 10 }], note: '午餐,"零食"', accountId: 'a' },
  { id: 2, date: '2026-10-13', type: 'refund', amount: 10, category: '购物', refundOf: 1 },
  { id: 3, date: '2026-10-13', type: 'income', amount: 5, deletedAt: '2026-10-14' }
] });
assert(csv.startsWith('\ufeff'));
assert(csv.includes('"20.00","餐饮","现金","午餐,""零食"""'));
assert(csv.includes('"10.00","购物"'));
assert(csv.includes('"退款","10.00","购物"'));
assert(!csv.includes('"3"'));
console.log('CSV export: passed');
