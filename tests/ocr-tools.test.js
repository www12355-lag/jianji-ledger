const assert = require('node:assert/strict');
const { suggest } = require('../ocr-tools.js');
assert.deepEqual(suggest('订单详情\n店铺：小城书店\n商品价格 ￥36.00\n实付 ¥28.00'), { amount: 28, merchant: '小城书店', ambiguous: false });
assert.deepEqual(suggest('价格 ¥36.00\n优惠 ¥8.00').amount, null);
assert.equal(suggest('付款金额 19.90元').amount, 19.9);
console.log('OCR suggestions: passed');
