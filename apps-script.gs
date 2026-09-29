/**
 * THE ONE — focus group simulator, server side.
 * Paste this whole file into the Apps Script editor bound to the session spreadsheet,
 * then Deploy -> Manage deployments -> edit -> Version: New version -> Deploy.
 * Saving without a NEW VERSION leaves the old code serving.
 *
 * BEFORE DEPLOYING, set the presenter key:
 *   Project Settings -> Script properties -> Add script property
 *   Property: PRESENTER_KEY    Value: whatever the presenter will type
 * It is deliberately not in this file, because this file is published. Until it is set,
 * the server refuses to close a round, and refuses to show the statistics at all.
 *
 * The key is the presenter's password. It protects four things: reading anyone's
 * answers or survey (the statistics page), releasing a competition, closing the round,
 * and wiping the sheet. Submitting answers needs no key.
 */
const RESPONSES = 'responses';
const SESSION = 'session';
const SURVEY = 'survey';

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); sh.appendRow(headers); }
  return sh;
}

function responses_() {
  return sheet_(RESPONSES, ['receivedAt', 'sessionCode', 'submissionId', 'participant', 'payload']);
}

function session_() { return sheet_(SESSION, ['sessionCode', 'state', 'updatedAt']); }

function survey_() {
  return sheet_(SURVEY, ['receivedAt', 'sessionCode', 'submissionId', 'participant', 'payload']);
}

/**
 * The activity log: every presenter action (release, close, reopen, reset, and any refused for
 * a wrong key), when it happened and which presenter device did it. Reset never wipes this tab,
 * so it also records who reset the sheet. Added 2026-09-29, after a round was found closed and
 * nothing said when or by whom. Players' locks are not logged; they have their own rows.
 */
const LOG = 'log';
function log_() { return sheet_(LOG, ['at', 'what', 'sessionCode', 'detail', 'by']); }

function note_(what, code, detail, by) {
  try {
    log_().appendRow([new Date().toISOString(), what, String(code || ''), String(detail || ''),
                      String(by || '').slice(0, 60)]);
  } catch (err) {} // the log must never stop the action it records
}

function readLog_() {
  const rows = log_().getDataRange().getValues().slice(1).filter(r => r[0] !== '' && r[0] != null);
  return rows.slice(-200).reverse().map(r => ({
    at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    what: String(r[1]), sessionCode: String(r[2]), detail: String(r[3]), by: String(r[4])
  }));
}

/**
 * Appends one row, safely under load.
 *
 * SpreadsheetApp.appendRow is read-then-write: forty phones locking in the same second
 * overwrote each other and 8 of 40 rows were lost (measured 2026-09-26). A script lock
 * prevents that but queues everyone (49s for the last of forty). The Sheets API append
 * is applied on Google's side, one at a time, without the queue on ours: enable it once
 * in the editor under Services -> Google Sheets API -> Add. Without it, this falls back
 * to the lock: slow, never lossy. Every row carries a submissionId, so a retry that
 * lands twice is folded into one when the rows are read back (rowsOf_ below).
 */
function append_(sh, body) {
  const row = [new Date().toISOString(), body.sessionCode, body.submissionId,
               body.participant, JSON.stringify(body.answers)];
  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values) {
    Sheets.Spreadsheets.Values.append({ values: [row] }, ss_().getId(), sh.getName() + '!A:E',
      { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    return json_({ ok: true, duplicate: false, via: 'api' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try { sh.appendRow(row); } finally { lock.releaseLock(); }
  return json_({ ok: true, duplicate: false, via: 'lock' });
}

/** Every row in the tab, or only one session's when a code is given; one per submissionId. */
function rowsOf_(sh, code) {
  const seen = {};
  const out = [];
  const rows = sh.getDataRange().getValues().slice(1);
  for (const r of rows) {
    if (String(code || '').trim() && String(r[1]) !== String(code)) continue;
    if (r[4] === '' || r[4] == null) continue;
    const id = String(r[2]);
    if (seen[id]) continue;
    seen[id] = true;
    out.push({ receivedAt: r[0], submissionId: r[2], participant: r[3], answers: JSON.parse(r[4] || 'null') });
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// A release is a session row whose state reads "released:<matchupId>". It never changes
// whether the round is open or closed; only the other rows do.
const RELEASED = 'released:';

/** The round state (open until closed) and every competition released, in release order. */
function readSession_(code) {
  const rows = session_().getDataRange().getValues().slice(1);
  let state = 'open';
  const released = [];
  for (const r of rows) {
    if (String(r[0]) !== String(code)) continue;
    const s = String(r[1]);
    if (s.indexOf(RELEASED) === 0) {
      const id = s.slice(RELEASED.length);
      if (released.indexOf(id) < 0) released.push(id);
    } else {
      state = s;
    }
  }
  return { state: state, released: released };
}

function readState_(code) { return readSession_(code).state; }

// Every waiting phone reads the session every few seconds. Caching the answer briefly
// keeps forty phones from each reading the sheet; a write clears it at once.
const SESSION_CACHE_SECONDS = 4;
function cacheKey_(code) { return 'session:' + String(code); }

function cachedSession_(code) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey_(code));
  if (hit) return JSON.parse(hit);
  const fresh = readSession_(code);
  cache.put(cacheKey_(code), JSON.stringify(fresh), SESSION_CACHE_SECONDS);
  return fresh;
}

function forget_(code) { CacheService.getScriptCache().remove(cacheKey_(code)); }

/** The secret that separates the presenter from everyone holding the same link. */
function presenterKey_() {
  return String(PropertiesService.getScriptProperties().getProperty('PRESENTER_KEY') || '').trim();
}

const NO_KEY = 'No presenter key is set on the server. Project Settings -> Script properties -> PRESENTER_KEY.';

/** Fail closed: with no key configured nobody gets in, including the presenter. */
function keyCheck_(key) {
  const expected = presenterKey_();
  if (!expected) return NO_KEY;
  if (String(key == null ? '' : key).trim() !== expected) return 'wrong presenter key';
  return null;
}

/** Empties a tab below its header row. */
function wipe_(sh) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).clearContent();
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    // Closing a round and wiping the sheet cannot be undone, and the endpoint URL is in
    // every participant's browser, so both need the key. Fail closed: with no key
    // configured, nobody can do either, including the presenter.
    if (body.kind === 'reset') {
      const refused = keyCheck_(body.key);
      if (refused) { note_('refused', body.sessionCode, 'reset: ' + refused, body.by); return json_({ ok: false, error: refused }); }
      wipe_(responses_()); wipe_(survey_()); wipe_(session_());
      note_('reset', body.sessionCode, '', body.by);
      // the presenter sends its own label; any other code's cached state expires within seconds
      if (body.sessionCode) forget_(body.sessionCode);
      return json_({ ok: true, reset: true });
    }
    if (body.kind === 'release') {
      const refused = keyCheck_(body.key);
      if (refused) { note_('refused', body.sessionCode, 'release: ' + refused, body.by); return json_({ ok: false, error: refused }); }
      if (!String(body.sessionCode || '').trim()) {
        return json_({ ok: false, error: 'a session code is needed' });
      }
      const id = String(body.matchupId || '').trim();
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) return json_({ ok: false, error: 'a matchup id is needed' });
      session_().appendRow([body.sessionCode, RELEASED + id, new Date()]);
      forget_(body.sessionCode);
      note_('release', body.sessionCode, id, body.by);
      return json_({ ok: true, released: id });
    }
    if (body.kind === 'state') {
      const refused = keyCheck_(body.key);
      if (refused) { note_('refused', body.sessionCode, String(body.state) + ': ' + refused, body.by); return json_({ ok: false, error: refused }); }
      // 'open' reopens a closed round (2026-09-29): the latest state row wins, and the
      // releases and every locked answer stay as they were
      if (['open', 'closed', 'revealed'].indexOf(String(body.state)) < 0) {
        return json_({ ok: false, error: 'the state must be open, closed or revealed' });
      }
      if (!String(body.sessionCode || '').trim()) {
        return json_({ ok: false, error: 'a session code is needed' });
      }
      session_().appendRow([body.sessionCode, body.state, new Date()]);
      forget_(body.sessionCode);
      note_(String(body.state) === 'open' ? 'reopen' : String(body.state), body.sessionCode, '', body.by);
      return json_({ ok: true, state: body.state });
    }
    if (!String(body.sessionCode || '').trim()) {
      return json_({ ok: false, error: 'a session code is needed' });
    }
    if (!String(body.submissionId || '').trim()) {
      return json_({ ok: false, error: 'a submissionId is needed' });
    }
    // the survey comes after locking, and often after the presenter has closed the
    // round, so it is accepted whatever the state
    if (body.kind === 'survey') return append_(survey_(), body);
    // a round the presenter has closed must not accept more submissions, or a late
    // lock joins the crowd result after the leaderboard has been announced
    if (readState_(body.sessionCode) !== 'open') {
      return json_({ ok: false, error: 'the round is closed' });
    }
    return append_(responses_(), body);
  } catch (err) {
    // Google answers "too many simultaneous invocations" above ~30 at once; the phone
    // treats any non-JSON or ok:false reply as retryable and tries again shortly
    return json_({ ok: false, error: String(err), retryable: true });
  }
}

function doGet(e) {
  const code = (e && e.parameter && e.parameter.code) || '';
  const what = (e && e.parameter && e.parameter.what) || 'rows';
  if (what === 'state') {
    if (!String(code).trim()) return json_({ ok: false, error: 'a session code is needed' });
    const s = cachedSession_(code);
    return json_({ ok: true, state: s.state, released: s.released });
  }
  // Everything else is the statistics page: every player's answers and survey, the whole
  // sheet unless a code narrows it. The participant link is public, so only the
  // presenter key opens it.
  const refused = keyCheck_((e && e.parameter && e.parameter.key) || '');
  if (refused) return json_({ ok: false, error: refused });
  if (what === 'survey') return json_({ ok: true, rows: rowsOf_(survey_(), code) });
  if (what === 'log') return json_({ ok: true, log: readLog_() });
  return json_({ ok: true, rows: rowsOf_(responses_(), code) });
}
