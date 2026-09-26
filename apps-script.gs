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
 * The key protects two things: closing the round (a write) and reading anyone's answers
 * or survey (the presenter's statistics page). Submitting answers needs no key.
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

/** Appends one row unless its submissionId is already there, so a retry never doubles. */
function appendOnce_(sh, body) {
  const existing = sh.getDataRange().getValues().slice(1);
  for (const r of existing) {
    if (String(r[2]) === String(body.submissionId)) return json_({ ok: true, duplicate: true });
  }
  sh.appendRow([new Date(), body.sessionCode, body.submissionId,
                body.participant, JSON.stringify(body.answers)]);
  return json_({ ok: true, duplicate: false });
}

function rowsOf_(sh, code) {
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[1]) === String(code))
    .map(r => ({ receivedAt: r[0], submissionId: r[2], participant: r[3], answers: JSON.parse(r[4] || 'null') }));
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

function doPost(e) {
  // Twenty simultaneous locks queue here. The wait must be inside the try, or a
  // timeout escapes as an HTML error page instead of JSON the client can act on.
  const lock = LockService.getScriptLock();
  try {
    try {
      lock.waitLock(120000);
    } catch (busy) {
      return json_({ ok: false, error: 'busy', retryable: true });
    }
    const body = JSON.parse(e.postData.contents);
    // Closing a round and revealing the results are the two irreversible acts in a
    // session, and the endpoint URL is in every participant's browser. Fail closed:
    // with no key configured, nobody can do either, including the presenter.
    if (body.kind === 'state') {
      var expected = presenterKey_();
      if (!expected) {
        return json_({ ok: false, error: 'No presenter key is set on the server. ' +
          'Project Settings -> Script properties -> PRESENTER_KEY.' });
      }
      if (String(body.key == null ? '' : body.key).trim() !== expected) {
        return json_({ ok: false, error: 'wrong presenter key' });
      }
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
    // the survey comes after locking, and often after the presenter has closed the
    // round, so it is accepted whatever the state
    if (body.kind === 'survey') return appendOnce_(survey_(), body);
    // a round the presenter has closed must not accept more submissions, or a late
    // lock joins the crowd result after the leaderboard has been announced
    if (readState_(body.sessionCode) !== 'open') {
      return json_({ ok: false, error: 'the round is closed' });
    }
    return appendOnce_(responses_(), body);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function doGet(e) {
  const code = (e && e.parameter && e.parameter.code) || '';
  const what = (e && e.parameter && e.parameter.what) || 'rows';
  // A read without a session code used to return every row of every session. One is
  // always available to anyone entitled to read, so requiring it costs nothing.
  if (!String(code).trim()) return json_({ ok: false, error: 'a session code is needed' });
  if (what === 'state') return json_({ ok: true, state: readState_(code) });
  // Everything else is the statistics page: every player's answers and survey. The
  // participant link is public, so only the presenter key opens it. Fail closed.
  const expected = presenterKey_();
  if (!expected) {
    return json_({ ok: false, error: 'No presenter key is set on the server. ' +
      'Project Settings -> Script properties -> PRESENTER_KEY.' });
  }
  const key = (e && e.parameter && e.parameter.key) || '';
  if (String(key).trim() !== expected) return json_({ ok: false, error: 'wrong presenter key' });
  if (what === 'survey') return json_({ ok: true, rows: rowsOf_(survey_(), code) });
  return json_({ ok: true, rows: rowsOf_(responses_(), code) });
}
