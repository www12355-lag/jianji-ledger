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
    if (/^\d{5}(?:\.\d+)?$/.test(clean(value))) {
      const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
      if (!Number.isNaN(date.getTime())) return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(0, 19).replace('T', ' ') };
    }
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
  function parseBill(input, filename, existingKeys = []) {
    const rows = Array.isArray(input) ? input : csvRows(input);
    const headerIndex = rows.findIndex(row => {
      const headers = row.map(headerName);
      return column(headers, '交易时间', '创建时间') >= 0 && column(headers, '收/支', '收支', '资金变动') >= 0 && column(headers, '金额', '金额(元)', '金额（元）') >= 0;
    });
    if (headerIndex < 0) throw new Error('找不到交易时间、收/支和金额列，请选择个人对账明细表');
    const headers = rows[headerIndex].map(headerName);
    const sample = `${filename} ${rows.slice(0, headerIndex).flat().join(' ')}`;
    const source = column(headers, '交易订单号', '支付宝交易号') >= 0 || /支付宝/.test(sample) ? '支付宝'
      : column(headers, '交易单号', '微信支付订单号') >= 0 || /微信支付|微信账单/.test(sample) ? '微信' : null;
    if (!source) throw new Error('无法识别账单来源，请选择支付宝或微信导出的个人对账明细');
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
    if (!/\.(csv|txt)$/i.test(file.name)) throw new Error('请选择 CSV 明细文件');
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

  function zipDirectory(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let end = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
      if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
    }
    if (end < 0) throw new Error('Excel 文件不是有效的 XLSX 格式');
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const entries = new Map();
    for (let index = 0; index < count; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Excel 压缩目录已损坏');
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      entries.set(name, {
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        size: view.getUint32(offset + 20, true),
        uncompressed: view.getUint32(offset + 24, true),
        localOffset: view.getUint32(offset + 42, true)
      });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return { view, bytes, entries };
  }
  async function zipText(zip, name) {
    const entry = zip.entries.get(name);
    if (!entry) return null;
    if (entry.flags & 1) throw new Error('Excel 文件已加密，请先解压账单 ZIP');
    if (entry.uncompressed > 25 * 1024 * 1024) throw new Error('Excel 明细太大，请缩小导出时间范围');
    const { view, bytes } = zip;
    const offset = entry.localOffset;
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('Excel 文件内容已损坏');
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const compressed = bytes.slice(start, start + entry.size);
    let output;
    if (entry.method === 0) output = compressed;
    else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('这台设备暂不支持读取此 Excel 压缩格式');
    return new TextDecoder().decode(output);
  }
  function xmlDocument(text) {
    const document = new DOMParser().parseFromString(text, 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('Excel 表格内容已损坏');
    return document;
  }
  const xmlNodes = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  function cellValue(cell, shared) {
    const type = cell.getAttribute('t');
    const value = xmlNodes(cell, 'v')[0]?.textContent || '';
    if (type === 's') return shared[Number(value)] || '';
    if (type === 'inlineStr') return xmlNodes(cell, 't').map(node => node.textContent).join('');
    return value;
  }
  function columnIndex(address) {
    const letters = (address.match(/^[A-Z]+/i) || [''])[0].toUpperCase();
    return [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }
  function normalizePath(path) {
    const parts = [];
    for (const part of path.split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
  }
  async function readXlsxFile(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('账单文件请小于 10 MB');
    const zip = zipDirectory(await file.arrayBuffer());
    const workbookText = await zipText(zip, 'xl/workbook.xml');
    if (!workbookText) throw new Error('Excel 文件缺少工作簿');
    const workbook = xmlDocument(workbookText);
    const firstSheet = xmlNodes(workbook, 'sheet')[0];
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const relationId = firstSheet?.getAttribute('r:id');
    const relationsText = await zipText(zip, 'xl/_rels/workbook.xml.rels');
    if (relationId && relationsText) {
      const relation = xmlNodes(xmlDocument(relationsText), 'Relationship').find(node => node.getAttribute('Id') === relationId);
      const target = relation?.getAttribute('Target');
      if (target) sheetPath = normalizePath(target.startsWith('/') ? target : `xl/${target}`);
    }
    const sheetText = await zipText(zip, sheetPath);
    if (!sheetText) throw new Error('Excel 文件缺少账单工作表');
    const sharedText = await zipText(zip, 'xl/sharedStrings.xml');
    const shared = sharedText ? xmlNodes(xmlDocument(sharedText), 'si').map(node => xmlNodes(node, 't').map(part => part.textContent).join('')) : [];
    const sheet = xmlDocument(sheetText);
    return xmlNodes(sheet, 'row').map(row => {
      const values = [];
      for (const cell of xmlNodes(row, 'c')) {
        const index = columnIndex(cell.getAttribute('r') || '');
        values[index >= 0 ? index : values.length] = cellValue(cell, shared);
      }
      return values;
    }).filter(row => row.some(value => clean(value)));
  }
  async function readBillFile(file) {
    if (/\.xlsx$/i.test(file.name)) return readXlsxFile(file);
    if (/\.(csv|txt)$/i.test(file.name)) return readCsvFile(file);
    if (/\.xls$/i.test(file.name)) throw new Error('旧版 .xls 暂不支持，请在 Excel 中另存为 .xlsx');
    throw new Error('请选择 Excel .xlsx 或 CSV 明细；PDF 不能用于自动识别');
  }

  const api = { parseBill, readBillFile, readCsvFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JianjiBillImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
