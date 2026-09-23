// Session configuration. Everything a run of the session needs to change lives here.
export const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzuWOwMRpYABdBa3q3MYHlR_jQaiXm5j7EQ3VJOjy3-SDDD6ckSH7sBAUo0Xg0RFNP_/exec';

// The specification's four categories. Confidence and Sense of Humour are judged from
// video in the real product, and there is no video for this session, so they carry
// `needsReplacement` until Mati and Avishai supply two photo-judgeable categories.
// The presenter console shows a warning while any remain.
export const CATEGORIES = [
  { key: 'smile',      label: 'Best Smile' },
  { key: 'style',      label: 'Style' },
  { key: 'confidence', label: 'Confidence',       needsReplacement: true },
  { key: 'humour',     label: 'Sense of Humour',  needsReplacement: true }
];

// Ten contestants in five matchups. Replace names and photo paths when Avishai delivers.
export const MATCHUPS = [
  { id: 'm1', a: { id: 'c1', name: 'Contestant 1', photo: 'photos/c1.jpg' }, b: { id: 'c2',  name: 'Contestant 2',  photo: 'photos/c2.jpg' } },
  { id: 'm2', a: { id: 'c3', name: 'Contestant 3', photo: 'photos/c3.jpg' }, b: { id: 'c4',  name: 'Contestant 4',  photo: 'photos/c4.jpg' } },
  { id: 'm3', a: { id: 'c5', name: 'Contestant 5', photo: 'photos/c5.jpg' }, b: { id: 'c6',  name: 'Contestant 6',  photo: 'photos/c6.jpg' } },
  { id: 'm4', a: { id: 'c7', name: 'Contestant 7', photo: 'photos/c7.jpg' }, b: { id: 'c8',  name: 'Contestant 8',  photo: 'photos/c8.jpg' } },
  { id: 'm5', a: { id: 'c9', name: 'Contestant 9', photo: 'photos/c9.jpg' }, b: { id: 'c10', name: 'Contestant 10', photo: 'photos/c10.jpg' } }
];
