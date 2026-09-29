import test from 'node:test';
import assert from 'node:assert/strict';
import { setSurveyAnswer, isSurveyComplete, surveyTable } from './survey.js';

const Q = [
  { key: 'clear', label: 'How clear was it?', type: 'scale', min: 1, max: 5 },
  { key: 'hardest', label: 'Hardest question?', type: 'choice', options: ['Smile', 'Style'] },
  { key: 'why', label: 'What would bring you back?', type: 'text' },
  { key: 'extra', label: 'Anything else?', type: 'text', required: false }
];

test('setSurveyAnswer returns a new object and keeps the others', () => {
  const a = setSurveyAnswer({ clear: 3 }, 'why', 'the photos');
  assert.deepEqual(a, { clear: 3, why: 'the photos' });
});

test('a survey is complete only when every required question has a valid answer', () => {
  assert.equal(isSurveyComplete({}, Q), false);
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: 'fun' }, Q), true);
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: '   ' }, Q), false, 'blank text does not count');
  assert.equal(isSurveyComplete({ clear: 9, hardest: 'Smile', why: 'fun' }, Q), false, 'scale out of range');
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Nope', why: 'fun' }, Q), false, 'choice not offered');
  assert.equal(isSurveyComplete({ clear: 3, hardest: 'Smile', why: 'fun', extra: '' }, Q), true, 'optional may be empty');
});

test('surveyTable lays every participant out in question order, blank where unanswered', () => {
  const rows = [
    { receivedAt: '2026-09-26T10:00:00Z', submissionId: 's1', participant: 'Ana', answers: { clear: 4, hardest: 'Style', why: 'fun' } },
    { receivedAt: '2026-09-26T10:01:00Z', submissionId: 's2', participant: 'Bo', answers: { clear: 2 } }
  ];
  const t = surveyTable(rows, Q);
  assert.deepEqual(t.header, ['How clear was it?', 'Hardest question?', 'What would bring you back?', 'Anything else?']);
  assert.deepEqual(t.rows, [
    { participant: 'Ana', cells: ['4', 'Style', 'fun', ''] },
    { participant: 'Bo', cells: ['2', '', '', ''] }
  ]);
});

test('surveyTable ignores rows without answers', () => {
  const t = surveyTable([{ participant: 'X', answers: null }, { participant: 'Y' }], Q);
  assert.deepEqual(t.rows, []);
});

test('surveyTable heads a column with the short name when the question has one', () => {
  const t = surveyTable([], [{ key: 'a', label: 'A very long question indeed?', short: 'Long q', type: 'text' }, Q[0]]);
  assert.deepEqual(t.header, ['Long q', 'How clear was it?']);
});

// ---- two languages: English and Hebrew ----
import { localize, pickLanguage, LANGUAGES } from './survey.js';
import { SURVEY, SURVEY_TEXT } from './config.js';

const BI = [
  { key: 'q', type: 'choice', label: 'Pick one', options: ['Yes', 'No'], he: { label: 'בחר אחת', options: ['כן', 'לא'] } },
  { key: 's', type: 'scale', min: 1, max: 10, label: 'How much?', low: 'Not at all', high: 'Very',
    he: { label: 'כמה?', low: 'בכלל לא', high: 'מאוד' } }
];

test('localize shows the English wording in English, the value being the option itself', () => {
  assert.deepEqual(localize(BI[0], 'en'), { label: 'Pick one', low: undefined, high: undefined,
    options: [{ value: 'Yes', text: 'Yes' }, { value: 'No', text: 'No' }] });
});

test('localize shows the Hebrew wording in Hebrew but keeps the English value for storage', () => {
  assert.deepEqual(localize(BI[0], 'he').options, [{ value: 'Yes', text: 'כן' }, { value: 'No', text: 'לא' }]);
  assert.equal(localize(BI[0], 'he').label, 'בחר אחת');
  const s = localize(BI[1], 'he');
  assert.deepEqual([s.label, s.low, s.high], ['כמה?', 'בכלל לא', 'מאוד']);
});

test('localize falls back to English for a question with no Hebrew, or an unknown language', () => {
  const plain = { key: 'x', type: 'choice', label: 'Only English', options: ['A'] };
  assert.equal(localize(plain, 'he').label, 'Only English');
  assert.deepEqual(localize(plain, 'he').options, [{ value: 'A', text: 'A' }]);
  assert.equal(localize(BI[0], 'fr').label, 'Pick one');
});

test('answers given in Hebrew are stored in English, so they complete the survey', () => {
  const answers = { q: localize(BI[0], 'he').options[0].value, s: 7 };
  assert.deepEqual(answers, { q: 'Yes', s: 7 });
  assert.equal(isSurveyComplete(answers, BI), true);
});

test('pickLanguage: a link, then the saved choice, then the phone, then English', () => {
  assert.deepEqual(LANGUAGES, ['en', 'he']);
  assert.equal(pickLanguage({ url: 'he', saved: 'en', browser: ['en-US'] }), 'he');
  assert.equal(pickLanguage({ url: 'xx', saved: 'he', browser: ['en-US'] }), 'he', 'an unknown link value is ignored');
  assert.equal(pickLanguage({ saved: 'en', browser: ['he-IL'] }), 'en', 'a choice the player made wins over the phone');
  assert.equal(pickLanguage({ browser: ['he-IL', 'en'] }), 'he');
  assert.equal(pickLanguage({ browser: ['iw'] }), 'he', 'the old code for Hebrew');
  assert.equal(pickLanguage({ browser: ['en-GB', 'he'] }), 'en', 'the first language the phone knows wins');
  assert.equal(pickLanguage({ browser: ['ru'] }), 'en');
  assert.equal(pickLanguage({}), 'en');
});

test('every survey question has its Hebrew wording, option for option', () => {
  const keys = SURVEY.map(q => q.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  assert.ok(!keys.includes('lang'), 'lang is taken: the page stores the reading language under it');
  for (const q of SURVEY) {
    assert.ok(q.he && q.he.label, `${q.key}: Hebrew question`);
    if (q.type === 'choice') assert.equal(q.he.options.length, q.options.length, `${q.key}: one Hebrew option per English one`);
    if (q.type === 'scale') assert.ok(q.low && q.high && q.he.low && q.he.high, `${q.key}: both ends explained in both languages`);
    assert.ok(q.short, `${q.key}: a column heading for the presenter`);
  }
});

test('the intro says questions 2 and 5 take a number from 1 to 10; they do', () => {
  const scales = SURVEY.map((q, i) => q.type === 'scale' ? `${i + 1}:${q.min}-${q.max}` : null).filter(Boolean);
  assert.deepEqual(scales, ['2:1-10', '5:1-10']);
});

test('the page text exists in both languages, line for line', () => {
  assert.deepEqual(Object.keys(SURVEY_TEXT.he).sort(), Object.keys(SURVEY_TEXT.en).sort());
  for (const lang of LANGUAGES) {
    for (const [k, v] of Object.entries(SURVEY_TEXT[lang])) {
      const s = typeof v === 'function' ? v(2, 10) : v;
      assert.ok(typeof s === 'string' && s.trim(), `${lang}.${k}`);
    }
  }
});
