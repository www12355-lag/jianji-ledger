const assert = require('node:assert/strict');
const { parseBill } = require('../bill-import.js');

const wechat = [
  '微信支付账单明细列表',
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2026-10-08 12:31:00,商户消费,咖啡店,"咖啡,中杯",支出,¥12.50,零钱,支付成功,WX001,,午餐',
  '2026-10-08 13:00:00,转账,朋友,转账,收入,20.00,零钱,已收钱,WX002,,',
  '2026-10-08 13:10:00,商户消费,商店,订单,支出,10.00,零钱,已关闭,WX003,,',
  '总交易单数：3笔'
].join('\r\n');
const first = parseBill(wechat, '微信支付账单.csv');
assert.equal(first.source, '微信');
assert.equal(first.entries.length, 2);
assert.equal(first.entries[0].amount, 12.5);
assert.equal(first.entries[0].category, '餐饮');
assert.equal(first.entries[0].date, '2026-10-08');
assert.match(first.entries[0].note, /咖啡,中杯/);
assert.equal(first.entries[1].type, 'income');
assert.equal(first.skipped.ignored, 2);
const again = parseBill(wechat, '微信支付账单.csv', first.entries.map(entry => entry.importKey));
assert.equal(again.entries.length, 0);
assert.equal(again.skipped.duplicate, 2);

const alipay = [
  '支付宝交易流水',
  '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注',
  '2026-09-01 09:00:00,交通出行,地铁公司,,地铁,支出,4.00,余额,交易成功,ALI001,,',
  '2026-09-01 10:00:00,退款,商家,,退款,收入,4.00,余额,退款成功,ALI001,,',
  '2026-09-01 11:00:00,理财,余额宝,,转入,不计收支,100.00,余额,交易成功,ALI002,,'
].join('\n');
const second = parseBill(alipay, '支付宝账单.csv');
assert.equal(second.source, '支付宝');
assert.equal(second.entries.length, 2);
assert.equal(second.entries[0].category, '交通');
assert.equal(second.entries[1].type, 'income');
assert.notEqual(second.entries[0].importKey, second.entries[1].importKey);
assert.throws(() => parseBill('a,b,c\n1,2,3', '账单.csv'), /找不到/);
console.log('bill import parser: passed');
