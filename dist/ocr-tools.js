(function (root) {
  'use strict';
  const amountPattern = /(?:[¥￥]\s*((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)|((?:\d{1,3}(?:,\d{3})+|\d{1,8})(?:\.\d{1,2})?)\s*元)/g;
  function suggest(text) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const found = [];
    for (const line of lines) {
      for (const match of line.matchAll(amountPattern)) {
        const amount = Number((match[1] || match[2]).replaceAll(',', ''));
        if (amount > 0) found.push({ amount, strong: /实付|实际支付|实际付款|支付金额|付款金额|总计支付|合计实付/.test(line) });
      }
    }
    const strong = [...new Set(found.filter(item => item.strong).map(item => item.amount))];
    const unique = [...new Set(found.map(item => item.amount))];
    const amount = strong.length === 1 ? strong[0] : strong.length === 0 && unique.length === 1 ? unique[0] : null;
    const merchantLine = lines.find(line => /^(?:商户|收款方|店铺|商家)\s*[:：]/.test(line));
    const merchant = merchantLine ? merchantLine.replace(/^(?:商户|收款方|店铺|商家)\s*[:：]\s*/, '').slice(0, 60) : '';
    return { amount, merchant, ambiguous: found.length > 0 && amount === null };
  }
  const api = { suggest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiOcr = api;
})(typeof window !== 'undefined' ? window : globalThis);
