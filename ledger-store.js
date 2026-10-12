(function (root) {
  'use strict';
  const legacyKey = 'jianji-v1';
  const native = () => root.Capacitor?.getPlatform?.() === 'android' && root.Capacitor.nativePromise;
  function openWebDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('jianji-ledger', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('entries', { keyPath: 'id' });
        request.result.createObjectStore('state');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  async function webRead() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['entries', 'state'], 'readonly');
      const entries = transaction.objectStore('entries').getAll();
      const state = transaction.objectStore('state').get('ledger');
      transaction.oncomplete = () => { db.close(); resolve(state.result ? { ...state.result, entries: entries.result } : null); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  }
  async function webWrite(value) {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['entries', 'state'], 'readwrite');
      const entries = transaction.objectStore('entries');
      entries.clear();
      for (const entry of value.entries) entries.put(entry);
      const { entries: ignored, ...state } = value;
      transaction.objectStore('state').put(state, 'ledger');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('数据库事务已取消')); };
    });
  }
  const read = async () => native() ? (await root.Capacitor.nativePromise('LedgerStore', 'load', {})).data || null : webRead();
  const write = async value => {
    if (!Array.isArray(value.entries)) throw new Error('账目格式不正确');
    if (native()) await root.Capacitor.nativePromise('LedgerStore', 'save', { data: value });
    else await webWrite(value);
  };
  async function initialize() {
    const current = await read();
    if (current) return current;
    const legacy = localStorage.getItem(legacyKey);
    if (!legacy) return { entries: [], budgets: {} };
    let parsed;
    try { parsed = JSON.parse(legacy); } catch { throw new Error('旧账本数据无法读取，请先保留应用数据'); }
    if (!parsed || !Array.isArray(parsed.entries) || !parsed.budgets) throw new Error('旧账本格式不正确，请先保留应用数据');
    await write(parsed);
    const verified = await read();
    if (!verified || verified.entries.length !== parsed.entries.length) throw new Error('账本迁移校验失败，请保留应用数据');
    localStorage.removeItem(legacyKey);
    return verified;
  }
  const api = { initialize, read, write };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.JianjiStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
