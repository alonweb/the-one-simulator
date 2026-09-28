/**
 * Both games and the survey page are served from alonweb.github.io, so they share one
 * browser storage. Each game records here that this phone finished it; the survey is
 * offered once every game on the list is finished.
 */
export const GAME_DONE_KEYS = ['theone.done.women', 'theone.done.devices'];

const store = () => (typeof localStorage === 'undefined' ? null : localStorage);

function read(key, storage) {
  try {
    const v = JSON.parse(storage.getItem(key) || 'null');
    return v && typeof v === 'object' && typeof v.at === 'number' ? v : null;
  } catch (e) { return null; }
}

export function markDone(key, name, storage = store(), at = Date.now()) {
  try { storage.setItem(key, JSON.stringify({ name: String(name || ''), at })); } catch (e) {}
}

/** "Start again on this phone": the next player has not finished this game. */
export function clearDone(key, storage = store()) {
  try { storage.removeItem(key); } catch (e) {}
}

export function finishedAll(storage = store()) {
  if (!storage) return false;
  return GAME_DONE_KEYS.every(k => read(k, storage));
}

/** The name the player typed in whichever game they finished last. */
export function lastName(storage = store()) {
  if (!storage) return '';
  const recs = GAME_DONE_KEYS.map(k => read(k, storage)).filter(Boolean).sort((a, b) => b.at - a.at);
  return recs.length ? recs[0].name : '';
}
