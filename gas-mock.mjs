// Runs apps-script.gs in node against in-memory stand-ins for the Google services it
// uses, so the server's rules can be tested before Alon pastes and deploys it.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadServer({ key = 'k', now = () => Date.now() } = {}) {
  const sheets = new Map();
  const sheet = (name) => {
    const rows = [];
    return {
      getName: () => name,
      appendRow: (r) => { rows.push(r.slice()); },
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
      getLastRow: () => rows.length,
      getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
      getRange: (row, col, n, m) => ({
        clearContent: () => { for (let i = row - 1; i < row - 1 + n; i++) rows[i] = rows[i].map(() => ''); }
      }),
      rows
    };
  };
  const ss = {
    getId: () => 'sheet-id',
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = sheet(n); sheets.set(n, s); return s; }
  };
  const cache = new Map();
  const ctx = {
    JSON, Date, String, Math, Object, Array, Number,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (p) => (p === 'PRESENTER_KEY' ? key : null) }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => { const e = cache.get(k); return e && e.until > now() ? e.v : null; },
      put: (k, v, s) => { cache.set(k, { v, until: now() + s * 1000 }); },
      remove: (k) => { cache.delete(k); }
    }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('./apps-script.gs', import.meta.url), 'utf8'), ctx);
  return {
    post: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body,
    get: (params) => ctx.doGet({ parameter: params }).body,
    sheets
  };
}
