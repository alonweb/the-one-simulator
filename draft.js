export function emptyDraft(matchups, categories) {
  const d = {};
  for (const m of matchups) d[m.id] = { overall: null, categories: {} };
  return d;
}

export const DEFAULT_SHARE = 51;

export function setAnswer(draft, matchupId, key, value) {
  const next = JSON.parse(JSON.stringify(draft));
  if (key === 'overall') next[matchupId].overall = value;
  else next[matchupId].categories[key] = { share: DEFAULT_SHARE, ...value };
  return next;
}

export function isComplete(draft, matchups, categories) {
  for (const m of matchups) {
    const entry = draft[m.id];
    if (!entry || !entry.overall || !entry.overall.vote || !entry.overall.predicted) return false;
    for (const c of categories) {
      const a = entry.categories[c.key];
      if (!a || !a.vote || !a.contestant || typeof a.share !== 'number') return false;
    }
  }
  return true;
}

const KEY = 'theone.draft.v1';

export function saveDraft(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

/** True only for an explicit ?reset= flag, so a participant never resets by accident. */
export function wantsReset(search) {
  const v = new URLSearchParams(search || '').get('reset');
  return v !== null && v !== '0' && v !== 'false' && v !== '';
}
