/**
 * THE ONE — focus group simulator, server side.
 * Paste this whole file into the Apps Script editor bound to the session spreadsheet,
 * then Deploy -> Manage deployments -> edit -> Version: New version -> Deploy.
 * Saving without a NEW VERSION leaves the old code serving.
 */
const RESPONSES = 'responses';
const SESSION = 'session';

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

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.kind === 'state') {
      session_().appendRow([body.sessionCode, body.state, new Date()]);
      return json_({ ok: true, state: body.state });
    }
    const sh = responses_();
    const existing = sh.getDataRange().getValues().slice(1);
    for (const r of existing) {
      if (String(r[2]) === String(body.submissionId)) {
        return json_({ ok: true, duplicate: true });
      }
    }
    sh.appendRow([new Date(), body.sessionCode, body.submissionId,
                  body.participant, JSON.stringify(body.answers)]);
    return json_({ ok: true, duplicate: false });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const code = (e && e.parameter && e.parameter.code) || '';
  const what = (e && e.parameter && e.parameter.what) || 'rows';
  if (what === 'state') return json_({ ok: true, state: readState_(code) });
  const rows = responses_().getDataRange().getValues().slice(1)
    .filter(r => !code || String(r[1]) === String(code))
    .map(r => ({ receivedAt: r[0], submissionId: r[2], participant: r[3], answers: JSON.parse(r[4] || 'null') }));
  return json_({ ok: true, rows: rows });
}
