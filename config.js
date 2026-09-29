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

// Ten contestants in five matchups, the set Alon supplied on 2026-09-29 (one folder per
// game). Each has five photographs: `photo` is the general one, used for "who is the one"
// and everywhere a contestant is only named; `photos` holds one per category, shown on
// that category's question. Keep the c1..c10 ids so stored answers still resolve.
const contestant = (id, name) => ({
  id, name, photo: `photos/${id}-general.jpg`,
  photos: Object.fromEntries(CATEGORIES.map(c => [c.key, `photos/${id}-${c.key}.jpg`]))
});

export const MATCHUPS = [
  { id: 'm1', a: contestant('c1', 'Anna'), b: contestant('c2', 'Michelle') },
  { id: 'm2', a: contestant('c3', 'Karin'), b: contestant('c4', 'Maya') },
  { id: 'm3', a: contestant('c5', 'Ingrid'), b: contestant('c6', 'Tamara') },
  { id: 'm4', a: contestant('c7', 'Emilie'), b: contestant('c8', 'Sofia') },
  { id: 'm5', a: contestant('c9', 'Kate'), b: contestant('c10', 'Sasha') }
];

// Every row this build writes carries this label; closing the round applies to it. The
// presenter page shows the whole sheet regardless, and Reset wipes it. Nobody types it.
export const SESSION_LABEL = 'LIVE1';

// The survey is its own page, offered once a phone has finished both games (finish.js).
// This game marks itself done under DONE_KEY; SURVEY_URL is where the button leads.
export const DONE_KEY = 'theone.done.women';
export const SURVEY_URL = 'survey.html';

// The survey, on survey.html, answered after both games: THE ONE Final Survey, which Alon
// supplied in English and Hebrew on 2026-09-29 (THE_ONE_Final_Survey_EN.docx / _HE.docx).
// Each player picks a language on the page. Whatever the language, an answer is stored as
// the English option, so the presenter's table reads the same for everyone; `he` holds the
// Hebrew wording and must list the options in the same order as `options`.
// type: 'scale' (min..max; `low`/`high` explain the two ends), 'choice' (one of options),
// or 'text'. required defaults to true. `short` is the column heading on the presenter page.
// The intro names questions 2 and 5 as the 1-10 ones: keep them there if you reorder.
export const SURVEY = [
  { key: 'priorPlay', type: 'choice', short: 'Played before',
    label: 'Have you previously played games or used apps involving betting, collecting points, or winning prizes?',
    options: ['I have never participated', 'I participate occasionally', 'I participate often', 'I am active in them all the time'],
    he: { label: 'האם השתתפת בעבר במשחקים או באפליקציות שכללו הימורים, צבירת נקודות או זכייה בפרסים?',
          options: ['לא השתתפתי מעולם', 'משתתף פה ושם', 'משתתף הרבה', 'פעיל בזה כל הזמן'] } },
  { key: 'influence', type: 'scale', min: 1, max: 10, short: 'Vote should count (1-10)',
    label: 'How important was it to you that your choice contributed to the final result?',
    low: 'I only wanted to see the result', high: 'I felt my vote should influence it',
    he: { label: 'כמה היה לך חשוב שהבחירה שלך תהיה חלק מהתוצאה הסופית?',
          low: 'רק רציתי לראות את התוצאה', high: 'הרגשתי שהקול שלי צריך להשפיע עליה' } },
  { key: 'firstGame', type: 'choice', short: 'Tomorrow, first',
    label: 'If eight more matchups opened tomorrow, which game would you enter first?',
    options: ['The contestants', 'Comparisons of products, designs, and everyday things',
              'I would only come back to see today’s results', 'I probably would not come back'],
    he: { label: 'אם מחר ייפתחו עוד שמונה השוואות, לאיזה משחק תיכנס קודם?',
          options: ['המתמודדות', 'השוואות של מוצרים, עיצובים ודברים יומיומיים',
                    'אכנס רק כדי לראות את התוצאות של היום', 'כנראה שלא אכנס'] } },
  { key: 'anotherRound', type: 'choice', short: 'Wanted another round',
    label: 'Which of the two games made you want to keep playing another round?',
    options: ['The contestants', 'The general comparisons', 'Both equally', 'Neither'],
    he: { label: 'באיזה משני המשחקים הרגשת יותר צורך להמשיך לעוד סיבוב?',
          options: ['המתמודדות', 'ההשוואות הכלליות', 'בשניהם באותה מידה', 'באף אחד מהם'] } },
  { key: 'brandChoice', type: 'scale', min: 1, max: 10, short: 'Brand designs (1-10)',
    label: 'Suppose a brand showed two designs for a product that has not launched yet. How much would you want to take part in a choice that influences what gets made?',
    low: 'I am not interested', high: 'I would come back specifically to choose',
    he: { label: 'נניח שמחר מותג יציג כאן שני עיצובים למוצר שעוד לא הושק. עד כמה היית רוצה להשתתף בבחירה שתשפיע על מה שייוצר?',
          low: 'לא מעניין אותי', high: 'הייתי נכנס במיוחד כדי לבחור' } },
  { key: 'outvoted', type: 'choice', short: 'When 80% chose the other',
    label: 'Suppose you chose one option, then found out that 80% of people chose the other. What would you want to do at that moment?',
    options: ['See why they chose differently', 'Defend my choice to others', 'Change my vote',
              'Try again with a similar matchup', 'Move on to the next result'],
    he: { label: 'נניח שבחרת אפשרות אחת, ואז גילית ש־80% מהאנשים בחרו דווקא בשנייה. מה היית רוצה לעשות באותו רגע?',
          options: ['לראות למה הם בחרו אחרת', 'להגן על הבחירה שלי מול אחרים', 'לשנות את ההצבעה שלי',
                    'לנסות שוב בהשוואה דומה', 'לעבור לתוצאה הבאה'] } },
  { key: 'area', type: 'choice', short: 'Area to influence',
    label: 'If you could choose just one area where you would want to have an influence through the game, which would it be?',
    options: ['Women and men', 'Food', 'Products and technology', 'Entertainment and content', 'Design and fashion', 'Another area'],
    he: { label: 'אילו יכולת לבחור רק תחום אחד שבו היית רוצה להשפיע דרך המשחק, מה היית בוחר?',
          options: ['נשים וגברים', 'אוכל', 'מוצרים וטכנולוגיה', 'בידור ותוכן', 'עיצוב ואופנה', 'תחום אחר'] } },
  { key: 'friendChallenge', type: 'choice', short: 'Challenge for a friend',
    label: 'If you could invite one friend to play against you, which challenge would you most want to send them?',
    options: ['Who knows the other person’s taste better', 'Who predicts the crowd’s choice better',
              'Pick opposite sides and see who is right', 'Compare our choices without competing', 'I would not invite a friend'],
    he: { label: 'אם היית יכול להזמין חבר אחד לשחק מולך, מה היה האתגר שהכי היית רוצה לשלוח לו?',
          options: ['מי מכיר טוב יותר את הטעם של השני', 'מי מנחש טוב יותר את בחירת הקהל',
                    'לבחור צדדים מנוגדים ולראות מי צודק', 'להשוות את הבחירות שלנו בלי תחרות', 'לא הייתי מזמין חבר'] } },
  { key: 'noPrize', type: 'choice', short: 'Back without a prize',
    label: 'If there were no prize at the end, what would still make you come back to play tomorrow?',
    options: ['Find out the results', 'Influence a real choice', 'Compete with friends',
              'Learn something about my taste', 'Nothing — without a prize, I would not come back'],
    he: { label: 'אם לא היה פרס בסוף, מה עדיין היה גורם לך לחזור לשחק מחר?',
          options: ['לגלות את התוצאות', 'להשפיע על בחירה אמיתית', 'להתחרות בחברים',
                    'לגלות משהו על הטעם שלי', 'שום דבר — בלי פרס לא הייתי חוזר'] } },
  { key: 'wouldPay', type: 'choice', short: 'Would pay for',
    label: 'Suppose the game itself stays free. Which of these, if any, would you consider paying for?',
    options: ['A one-on-one challenge with a friend to predict the result', 'A way to contact a contestant or creator',
              'Having my opinion appear more prominently in the chat', 'A bigger prize for the winner', 'I would not pay for any of these'],
    he: { label: 'נניח שהמשחק עצמו נשאר בחינם. על איזו אפשרות, אם בכלל, היית שוקל להוציא כסף?',
          options: ['אתגר אישי מול חבר על ניחוש התוצאה', 'אפשרות לפנות למתמודדת או ליוצר',
                    'שהדעה שלי תופיע בצורה בולטת יותר בצ׳אט', 'פרס גדול יותר למנצח', 'לא הייתי משלם על אף אחת מהן'] } }
];

// Everything else the survey page says, in both languages. `intro` is the survey's own
// opening line; the rest is the page around it.
export const SURVEY_TEXT = {
  en: {
    pageTitle: 'THE ONE — End of Game Survey',
    heading: 'Survey',
    intro: 'Choose one answer for each question. For questions 2 and 5, select a number from 1 to 10.',
    name: 'Your name', namePlaceholder: 'The name you played under',
    scaleHint: (min, max) => `Choose a number from ${min} to ${max}`,
    optional: 'optional', textPlaceholder: 'A few words', textOptional: 'Optional',
    send: 'Send my answers', incomplete: 'Answer everything first',
    sending: 'Sending…', retrying: (n) => `Still sending… (try ${n})`,
    failed: 'Did not save. Tap to try again; it cannot double-count.',
    thanks: 'Thank you', thanksBody: (name) => `Your survey is in${name ? ', ' + name : ''}. That is everything.`,
    language: 'Language'
  },
  he: {
    pageTitle: 'THE ONE — שאלון סיום המשחק',
    heading: 'שאלון',
    intro: 'בחר תשובה אחת בכל שאלה. בשאלות 2 ו־5 בחר מספר מ־1 עד 10.',
    name: 'השם שלך', namePlaceholder: 'השם שבו שיחקת',
    scaleHint: (min, max) => `בחר מספר מ־${min} עד ${max}`,
    optional: 'לא חובה', textPlaceholder: 'כמה מילים', textOptional: 'לא חובה',
    send: 'שליחת התשובות', incomplete: 'יש לענות על כל השאלות',
    sending: 'שולח…', retrying: (n) => `עדיין שולח… (ניסיון ${n})`,
    failed: 'התשובות לא נשמרו. אפשר ללחוץ שוב, הן לא ייספרו פעמיים.',
    thanks: 'תודה', thanksBody: (name) => `השאלון שלך התקבל${name ? ', ' + name : ''}. זה הכול.`,
    language: 'שפה'
  }
};
