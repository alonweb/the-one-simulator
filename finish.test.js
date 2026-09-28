import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markDone, clearDone, finishedAll, lastName, GAME_DONE_KEYS } from './finish.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: (k) => m.delete(k) };
}

test('starting a game again on the phone un-finishes that game only', () => {
  const s = memory();
  markDone('theone.done.women', 'Ana', s);
  markDone('theone.done.devices', 'Ana', s);
  clearDone('theone.done.women', s);
  assert.equal(finishedAll(s), false);
  assert.equal(lastName(s), 'Ana');
});

test('both games are listed, so the survey can wait for the pair', () => {
  assert.deepEqual(GAME_DONE_KEYS, ['theone.done.women', 'theone.done.devices']);
});

test('one finished game is not enough for the survey', () => {
  const s = memory();
  markDone('theone.done.women', 'Ana', s);
  assert.equal(finishedAll(s), false);
});

test('finishing the second game, in either order, opens the survey', () => {
  const s = memory();
  markDone('theone.done.devices', 'Ana', s);
  assert.equal(finishedAll(s), false);
  markDone('theone.done.women', 'Ana', s);
  assert.equal(finishedAll(s), true);
});

test('the survey takes the name the player last used', () => {
  const s = memory();
  markDone('theone.done.women', 'ana', s, 1000);
  markDone('theone.done.devices', 'Ana B', s, 2000);
  assert.equal(lastName(s), 'Ana B');
});

test('a phone that played neither game has no name to offer', () => {
  assert.equal(lastName(memory()), '');
  assert.equal(finishedAll(memory()), false);
});

test('storage that throws, as in a private window, reads as not finished', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  markDone('theone.done.women', 'Ana', broken);
  assert.equal(finishedAll(broken), false);
  assert.equal(lastName(broken), '');
});

test('a garbled record is ignored rather than trusted', () => {
  const s = memory();
  s.setItem('theone.done.women', 'not json');
  s.setItem('theone.done.devices', JSON.stringify({ name: 'Bo', at: 5 }));
  assert.equal(finishedAll(s), false);
  assert.equal(lastName(s), 'Bo');
});
