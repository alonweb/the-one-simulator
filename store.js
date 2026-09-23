import { ENDPOINT } from './config.js';

export function buildSubmission({ sessionCode, participant, answers, submissionId }) {
  return { kind: 'submission', sessionCode, participant, answers, submissionId };
}

export function parseRows(response) {
  if (!response || !response.ok || !Array.isArray(response.rows)) return [];
  return response.rows.filter(r => r && r.answers && typeof r.answers === 'object');
}

async function post(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function submit(payload) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await post(buildSubmission(payload)); }
    catch (err) { lastError = err; await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
  }
  throw lastError;
}

export async function setState(sessionCode, state) {
  return post({ kind: 'state', sessionCode, state });
}

export async function fetchState(sessionCode) {
  const res = await fetch(`${ENDPOINT}?what=state&code=${encodeURIComponent(sessionCode)}`);
  const data = await res.json();
  return data.state || 'open';
}

export async function fetchRows(sessionCode) {
  const res = await fetch(`${ENDPOINT}?what=rows&code=${encodeURIComponent(sessionCode)}`);
  return parseRows(await res.json());
}
