// Session configuration. Everything a run of the session needs to change lives here.
export const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzuWOwMRpYABdBa3q3MYHlR_jQaiXm5j7EQ3VJOjy3-SDDD6ckSH7sBAUo0Xg0RFNP_/exec';

// The four categories, taken from the pilot mockup (Pilot mockup.pdf, 2026-09-23).
// The mockup answers the question the design left open: Confidence and Sense of Humour
// need video, and the pilot replaces them with two categories that can be judged from a
// photograph. `question` is the wording on the yellow banner; `label` is the short name
// used on the review, results and presenter screens.
export const CATEGORIES = [
  { key: 'smile', label: 'Best smile', question: 'the best smile?', media: 'image',
    hint: 'Expression, smile, eyes, overall look.' },
  { key: 'style', label: 'Style', question: 'the best style?', media: 'image',
    hint: 'Fashion, grooming, hair, accessories.' },
  { key: 'body',  label: 'Body', question: 'the best body?', media: 'image',
    hint: 'Posture, presence, the whole frame.' },
  { key: 'mama',  label: 'Take to Mama', question: 'Take to Mama?', media: 'image',
    hint: 'Who would you introduce at home?' }
];

// Ten contestants in five matchups. These are the AI demo portraits already used in the
// mockups, labelled as such there; they are not real contestants. Swap in the real set
// when Avishai delivers it, keeping the c1..c10 ids so stored answers still resolve.
export const MATCHUPS = [
  { id: 'm1', a: { id: 'c1', name: 'Ana', photo: 'photos/c1.jpg' }, b: { id: 'c2', name: 'Camila', photo: 'photos/c2.jpg' } },
  { id: 'm2', a: { id: 'c3', name: 'Carolina', photo: 'photos/c3.jpg' }, b: { id: 'c4', name: 'Daniela', photo: 'photos/c4.jpg' } },
  { id: 'm3', a: { id: 'c5', name: 'Gabriela', photo: 'photos/c5.jpg' }, b: { id: 'c6', name: 'Isabella', photo: 'photos/c6.jpg' } },
  { id: 'm4', a: { id: 'c7', name: 'Juliana', photo: 'photos/c7.jpg' }, b: { id: 'c8', name: 'Laura', photo: 'photos/c8.jpg' } },
  { id: 'm5', a: { id: 'c9', name: 'Luciana', photo: 'photos/c9.jpg' }, b: { id: 'c10', name: 'Manuela', photo: 'photos/c10.jpg' } }
];

// Every row this build writes carries this label; closing the round applies to it. The
// presenter page shows the whole sheet regardless, and Reset wipes it. Nobody types it.
export const SESSION_LABEL = 'LIVE1';

// The survey is its own page, offered once a phone has finished both games (finish.js).
// This game marks itself done under DONE_KEY; SURVEY_URL is where the button leads.
export const DONE_KEY = 'theone.done.women';
export const SURVEY_URL = 'survey.html';

// The survey, on survey.html, answered after both games. From Mati's
// focus-group brief (2026-09-26): record choices and behaviour, not only "yes I would pay".
// type: 'scale' (min..max), 'choice' (one of options), or 'text'. required defaults to true.
// `short` is the column heading on the presenter page. Edit freely before the day.
export const SURVEY = [
  { key: 'challenge', type: 'text', short: 'Challenge whom',
    label: 'Would you challenge another fan on a result? Who, and why?' },
  { key: 'return', type: 'choice', short: 'Come back',
    label: 'Would you come back to see who won the challenge?', options: ['Yes', 'Maybe', 'No'] },
  { key: 'choose', type: 'choice', short: 'Would choose',
    label: 'Now that you have seen the screens, what would you choose?',
    options: ['A free matchup', 'A matchup with stars I bought', 'A reply from the contestant', 'Something in the results', 'Nothing'] },
  { key: 'chooseWhy', type: 'text', short: 'Why', label: 'Why that one?' },
  { key: 'maxPrice', type: 'text', short: 'Max price',
    label: 'What is the most you would pay for a first pack of stars?' },
  { key: 'packSize', type: 'text', short: 'Pack size',
    label: 'What pack size feels like fun, without putting you off?' },
  { key: 'buyAgain', type: 'choice', short: 'Buy after loss',
    label: 'Would you buy again after losing?', options: ['Yes', 'Maybe', 'No'] },
  { key: 'firstUse', type: 'choice', short: 'First use of stars',
    label: 'If you won stars, what would you do first?',
    options: ['Play again', 'Get a personal reply from the contestant', 'Be seen by the crowd', 'Save them for a prize'] },
  { key: 'prize', type: 'text', short: 'Prize wanted', label: 'Which prize would really interest you?' },
  { key: 'trust', type: 'choice', short: 'Trust hurt',
    label: 'You vote, and you also play matchups on the result. Does that hurt your trust in the game?',
    options: ['Yes', 'A little', 'No'] },
  { key: 'trustFix', type: 'text', short: 'What builds trust',
    label: 'What would make you believe the votes are counted properly?' },
  { key: 'other', type: 'text', short: 'Other', label: 'Anything else?', required: false }
];
