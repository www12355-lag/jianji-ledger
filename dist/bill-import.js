(function (root) {
  'use strict';

  function csvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { field += '"'; index++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(field); field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[index + 1] === '\n') index++;
        row.push(field);
        if (row.some(value => value.trim())) rows.push(row);
        row = []; field = '';
      } else field += char;
    }
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }

  const clean = value => String(value ?? '').replace(/^\uFEFF/, '').replace(/^`/, '').trim();
  const headerName = value => clean(value).replace(/[\s（）()]/g, '').toLowerCase();
  function column(headers, ...names) {
    return headers.findIndex(header => names.some(name => header === headerName(name)));
  }
  function transactionTime(value) {
    const match = clean(value).match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
    const pad = number => String(number).padStart(2, '0');
    return { date: `${year}-${pad(month)}-${pad(day)}`, time: `${year}-${pad(month)}-${pad(day)} ${pad(match[4] || 0)}:${pad(match[5] || 0)}:${pad(match[6] || 0)}` };
  }
  function categoryFor(text) {
    if (/餐|饭|外卖|咖啡|奶茶|食品|超市|水果|零食|美团|饿了么/.test(text)) return '餐饮';
    if (/地铁|公交|打车|滴滴|铁路|火车|机票|高铁|加油|停车|交通|出行/.test(text)) return '交通';
    if (/医院|药|医疗|诊所|体检/.test(text)) return '医疗';
    if (/房租|物业|水费|电费|燃气|宽带|话费|居住/.test(text)) return '居住';
    if (/电影|游戏|演出|娱乐|旅游|景区/.test(text)) return '娱乐';
    if (/购物|淘宝|京东|拼多多|服饰|百货/.test(text)) return '购物';
    return '其他';
  }
  function parseBill(text, filename, existingKeys = []) {
    const rows = csvRows(text);
    const headerIndex = rows.findIndex(row => {
      const headers = row.map(headerName);
      return column(headers, '交易时间', '创建时间') >= 0 && column(headers, '收/支', '收支', '资金变动') >= 0 && column(headers, '金额', '金额(元)', '金额（元）') >= 0;
    });
    if (headerIndex < 0) throw new Error('找不到交易时间、收/支和金额列，请选择个人对账 CSV 明细');
    const headers = rows[headerIndex].map(headerName);
    const sample = `${filename} ${rows.slice(0, headerIndex).flat().join(' ')}`;
    const source = column(headers, '交易订单号', '支付宝交易号') >= 0 || /支付宝/.test(sample) ? '支付宝'
      : column(headers, '交易单号', '微信支付订单号') >= 0 || /微信支付|微信账单/.test(sample) ? '微信' : null;
    if (!source) throw new Error('无法识别账单来源，请选择支付宝或微信导出的个人对账 CSV');
    const timeCol = column(headers, '交易时间', '创建时间');
    const flowCol = column(headers, '收/支', '收支', '资金变动');
    const amountCol = column(headers, '金额', '金额(元)', '金额（元）');
    const statusCol = column(headers, '交易状态', '当前状态');
    const orderCol = column(headers, '交易订单号', '支付宝交易号', '交易单号', '微信支付订单号');
    const merchantCol = column(headers, '交易对方', '对方', '商户名称');
    const productCol = column(headers, '商品说明', '商品', '商品名称');
    const categoryCol = column(headers, '交易分类', '交易类型');
    const remarkCol = column(headers, '备注');
    const seen = new Set(existingKeys);
    const entries = [];
    const skipped = { duplicate: 0, ignored: 0 };
    for (const row of rows.slice(headerIndex + 1)) {
      const value = index => index < 0 ? '' : clean(row[index]);
      const when = transactionTime(value(timeCol));
      const flow = value(flowCol);
      const status = value(statusCol);
      const type = /支出|付款|转出/.test(flow) ? 'expense' : /收入|收款|转入/.test(flow) ? 'income' : null;
      const amount = Number(value(amountCol).replace(/[¥￥元,\s]/g, '').replace(/^\+/, ''));
      if (!when || !type || !Number.isFinite(amount) || amount <= 0 || /失败|关闭|取消|未付款|待支付|已撤销|处理中|退款中/.test(status)) {
        skipped.ignored++;
        continue;
      }
      const merchant = value(merchantCol);
      const product = value(productCol);
      const order = value(orderCol);
      const categoryText = value(categoryCol);
      const note = [merchant, product, value(remarkCol)].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index).join(' · ').slice(0, 60) || categoryText || source;
      const importKey = order ? `${source}|${order}|${type}|${amount.toFixed(2)}` : `${source}|${when.time}|${type}|${amount.toFixed(2)}|${merchant}|${product}`;
      if (seen.has(importKey)) { skipped.duplicate++; continue; }
      seen.add(importKey);
      entries.push({ type, amount, date: when.date, transactionTime: when.time, category: type === 'expense' ? categoryFor(`${categoryText} ${merchant} ${product}`) : '', note, source, importKey });
      if (entries.length > 1000) throw new Error('单次最多预览 1000 笔，请缩小导出时间范围');
    }
    return { source, entries, skipped };
  }

  async function readCsvFile(file) {
    if (!/\.(csv|txt)$/i.test(file.name)) throw new Error('请先解压账单 ZIP，再选择其中的 CSV 文件');
    if (file.size > 10 * 1024 * 1024) throw new Error('账单文件请小于 10 MB');
    const bytes = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    const damaged = (utf8.match(/�/g) || []).length;
    if (!damaged) return utf8;
    try {
      const gb = new TextDecoder('gb18030').decode(bytes);
      return (gb.match(/�/g) || []).length < damaged ? gb : utf8;
    } catch { return utf8; }
  }

  const api = { parseBill, readCsvFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JianjiBillImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
