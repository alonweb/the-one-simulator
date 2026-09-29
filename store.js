import { ENDPOINT } from './config.js';

export function normalizeCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase();
}

export function buildSubmission({ sessionCode, participant, answers, submissionId }) {
  return { kind: 'submission', sessionCode, participant, answers, submissionId };
}

/** The survey travels the same way as a lock, under its own id, so a retry never doubles. */
export function buildSurveySubmission({ sessionCode, participant, answers, submissionId }) {
  return { kind: 'survey', sessionCode, participant, answers, submissionId };
}

/** Well-formed rows, one per submissionId: the first wins, so a retried lock counts once. */
export function parseRows(response) {
  if (!response || !response.ok || !Array.isArray(response.rows)) return [];
  const seen = new Set();
  return response.rows.filter(r => {
    if (!r || !r.answers || typeof r.answers !== 'object') return false;
    const id = String(r.submissionId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Each competition is locked on its own, as its own row: the player's id, then the matchup.
const LOCK_SEP = '~';
export function lockIdOf(playerId, matchupId) { return `${playerId}${LOCK_SEP}${matchupId}`; }
export function playerIdOf(submissionId) { return String(submissionId).split(LOCK_SEP)[0]; }

/**
 * One row per player again, for scoring: a player's competition rows are joined under
 * the player's id. If a competition somehow arrives twice, the first answer stands.
 */
export function mergeByPlayer(rows) {
  const byPlayer = new Map();
  for (const r of rows || []) {
    const id = playerIdOf(r.submissionId);
    if (!byPlayer.has(id)) byPlayer.set(id, { submissionId: id, participant: r.participant, answers: {} });
    const p = byPlayer.get(id);
    for (const [matchupId, a] of Object.entries(r.answers || {})) {
      if (!(matchupId in p.answers)) p.answers[matchupId] = a;
    }
  }
  return [...byPlayer.values()];
}

async function post(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  // a busy server answers with an HTML error page rather than JSON; res.json() throws,
  // which this treats as retryable rather than fatal
  return res.json();
}

/**
 * Sends one submission and keeps trying until it is durably stored.
 *
 * The server writes in parallel and Google refuses requests above about thirty at
 * once with an HTML error page, which reads here as retryable. Retrying is safe at any
 * length because the submissionId folds a repeat into one row when the rows are read,
 * so patience costs nothing and impatience loses a participant's whole set.
 */
export async function submit(payload, opts = {}) {
  return send(buildSubmission(payload), opts);
}

/** Same patience as a lock: the answers are worth as much and the server is as busy. */
export async function submitSurvey(payload, opts = {}) {
  return send(buildSurveySubmission(payload), opts);
}

async function send(body, opts = {}) {
  // twelve tries is about two minutes: long enough to outlast Google's limit of roughly 60
  // sheet writes a minute when a room locks two released matchups in the same moment
  const attempts = opts.attempts ?? 12;
  const base = opts.baseDelayMs ?? 2000;
  const onAttempt = opts.onAttempt || (() => {});
  let lastError;
  for (let n = 1; n <= attempts; n++) {
    onAttempt(n);
    try {
      const r = await post(body);
      if (!r || r.ok !== true) throw new Error((r && r.error) || 'rejected by the server');
      return r;
    } catch (err) {
      lastError = err;
      if (n === attempts) break;
      const wait = Math.min(base * Math.pow(1.6, n - 1), 15000) + Math.random() * 500;
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastError;
}

/** The only two states a presenter sets. A round starts open; nobody sets it back. */
export const PRESENTER_STATES = ['closed', 'revealed'];

/**
 * A state write, checked before it leaves the page.
 *
 * Closing a round and revealing the results are the two irreversible acts in a session,
 * and the endpoint is in every participant's browser. The key is what separates the
 * presenter from everyone holding the same link. It lives in the server's Script
 * Properties and on the presenter's own device, never in this repository.
 */
export function buildStateWrite(sessionCode, state, key) {
  const code = normalizeCode(sessionCode);
  if (!code) throw new Error('A session code is needed.');
  if (!PRESENTER_STATES.includes(state)) throw new Error('The state must be closed or revealed.');
  if (!String(key == null ? '' : key).trim()) throw new Error('The presenter key is needed.');
  return { kind: 'state', sessionCode: code, state, key: String(key).trim() };
}

export async function setState(sessionCode, state, key) {
  return post(buildStateWrite(sessionCode, state, key));
}

/** A release, checked before it leaves the page. Releasing cannot be taken back. */
export function buildReleaseWrite(sessionCode, matchupId, key) {
  const code = normalizeCode(sessionCode);
  if (!code) throw new Error('A session code is needed.');
  if (!String(matchupId == null ? '' : matchupId).trim()) throw new Error('A matchup is needed.');
  if (!String(key == null ? '' : key).trim()) throw new Error('The presenter key is needed.');
  return { kind: 'release', sessionCode: code, matchupId: String(matchupId).trim(), key: String(key).trim() };
}

export async function release(sessionCode, matchupId, key) {
  return post(buildReleaseWrite(sessionCode, matchupId, key));
}

/** The round state and the released competitions. A server without releases has none. */
export function parseSession(data) {
  return {
    state: (data && data.state) || 'open',
    released: data && Array.isArray(data.released) ? data.released.map(String) : []
  };
}

/** Public on purpose: every phone reads it while it waits. It carries no answers. */
export async function fetchSession(sessionCode) {
  const res = await fetch(`${ENDPOINT}?what=state&code=${encodeURIComponent(normalizeCode(sessionCode))}`);
  return parseSession(await res.json());
}

/**
 * Wakes a server and times it. An idle Apps Script took up to 11 s to answer its first request
 * (measured 2026-09-29), and a lock sent to a sleeping server looked stuck. This is the state
 * read every waiting phone makes: it writes nothing and needs no key. It never throws.
 */
export async function wake(endpoint, sessionCode, now = () => Date.now()) {
  const t0 = now();
  try {
    const res = await fetch(`${endpoint}?what=state&code=${encodeURIComponent(normalizeCode(sessionCode))}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error((data && data.error) || 'no answer');
    return { ok: true, ms: now() - t0 };
  } catch (err) {
    return { ok: false, ms: now() - t0, error: String((err && err.message) || err) };
  }
}

/**
 * The statistics page. The server only answers with the presenter key, because the
 * participant link is public and these are everyone's answers. A refusal is thrown,
 * not swallowed, so the presenter sees "wrong presenter key" rather than an empty room.
 */
async function fetchGated(what, sessionCode, key) {
  // no session code means the whole sheet
  const q = `what=${what}&code=${encodeURIComponent(normalizeCode(sessionCode))}&key=${encodeURIComponent(String(key == null ? '' : key).trim())}`;
  const res = await fetch(`${ENDPOINT}?${q}`);
  const data = await res.json();
  if (!data || data.ok !== true) throw new Error((data && data.error) || 'the server refused it');
  return parseRows(data);
}

export async function fetchRows(sessionCode, key) { return fetchGated('rows', sessionCode, key); }
export async function fetchSurvey(sessionCode, key) { return fetchGated('survey', sessionCode, key); }

/** The wipe, checked before it leaves the page. It empties every tab of the sheet. */
export function buildResetWrite(key, sessionCode) {
  if (!String(key == null ? '' : key).trim()) throw new Error('The presenter key is needed.');
  const w = { kind: 'reset', key: String(key).trim() };
  // the label lets the server drop its cached releases at once instead of seconds later
  if (normalizeCode(sessionCode)) w.sessionCode = normalizeCode(sessionCode);
  return w;
}

export async function resetSheet(key, sessionCode) {
  return post(buildResetWrite(key, sessionCode));
}
