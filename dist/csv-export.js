(function (root) {
  'use strict';
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  function toCsv(data) {
    const accounts = new Map((data.accounts || []).map(account => [account.id, account.name]));
    const projects = new Map((data.projects || []).map(project => [project.id, project.name]));
    const rows = [['日期', '类型', '金额', '类别', '账户', '备注', '商户', '来源', '关联原支出ID', '记录ID', '项目标签', '关联借款ID', '借还款类型', '账户变动']];
    for (const entry of data.entries || []) {
      if (entry.deletedAt) continue;
      const type = entry.type === 'expense' ? '支出' : entry.type === 'income' ? '收入' : entry.type === 'refund' ? '退款' : entry.transferFrom ? '转账' : '不计收支';
      const parts = entry.type === 'expense' && entry.splits?.length ? entry.splits : [{ category: entry.category || '', amount: entry.amount }];
      for (const part of parts) rows.push([
        entry.date || '', type, Number(part.amount).toFixed(2), part.category || '',
        entry.transferFrom ? `${accounts.get(entry.transferFrom) || ''} → ${accounts.get(entry.transferTo) || ''}` : accounts.get(entry.accountId) || '',
        entry.note || '', entry.merchant || '', entry.source || '', entry.refundOf ?? '', entry.id ?? '',
        (entry.projectIds || []).map(id => projects.get(id) || id).join('；'), entry.receivableId || '', entry.receivableKind || '', entry.accountDelta ?? ''
      ]);
    }
    return '\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }
  const api = { toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiCsv = api;
})(typeof window !== 'undefined' ? window : globalThis);
