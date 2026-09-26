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
 * The key is the presenter's password. It protects three things: reading anyone's
 * answers or survey (the statistics page), closing the round, and wiping the sheet.
 * Submitting answers needs no key.
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
 * Appends one row. No lock and no duplicate check here: with forty phones locking in the
 * same second, a queue made the last one wait 49s (measured 2026-09-26). appendRow is
 * safe to call in parallel, and every row carries a submissionId, so a retry that lands
 * twice is folded into one when the rows are read back (rowsOf_ below).
 */
function append_(sh, body) {
  sh.appendRow([new Date(), body.sessionCode, body.submissionId,
                body.participant, JSON.stringify(body.answers)]);
  return json_({ ok: true, duplicate: false });
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

function readState_(code) {
  const rows = session_().getDataRange().getValues().slice(1);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === String(code)) return String(rows[i][1]);
  }
  return 'open';
}

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
      if (refused) return json_({ ok: false, error: refused });
      wipe_(responses_()); wipe_(survey_()); wipe_(session_());
      return json_({ ok: true, reset: true });
    }
    if (body.kind === 'state') {
      const refused = keyCheck_(body.key);
      if (refused) return json_({ ok: false, error: refused });
      if (String(body.state) !== 'closed' && String(body.state) !== 'revealed') {
        return json_({ ok: false, error: 'the state must be closed or revealed' });
      }
      if (!String(body.sessionCode || '').trim()) {
        return json_({ ok: false, error: 'a session code is needed' });
      }
      session_().appendRow([body.sessionCode, body.state, new Date()]);
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
    return json_({ ok: true, state: readState_(code) });
  }
  // Everything else is the statistics page: every player's answers and survey, the whole
  // sheet unless a code narrows it. The participant link is public, so only the
  // presenter key opens it.
  const refused = keyCheck_((e && e.parameter && e.parameter.key) || '');
  if (refused) return json_({ ok: false, error: refused });
  if (what === 'survey') return json_({ ok: true, rows: rowsOf_(survey_(), code) });
  return json_({ ok: true, rows: rowsOf_(responses_(), code) });
}
