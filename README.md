# THE ONE — focus group simulator

A throwaway research instrument for one live session. Twenty people play one round of
THE ONE on their own phones, answer a short survey, and are done; the presenter alone sees the
scored leaderboard, every player's answers and the survey.
None of this is production code.

Spec and plan live in the HumanPatterns project under
`_bmad-output/planning-artifacts/focus-group-sim/`.

## The pieces

| File | What it is |
|---|---|
| `index.html`, `app.js`, `draft.js` | What a participant sees. Answers are held in the browser and sent once, at lock. |
| `presenter.html`, `presenter.js` | The statistics page, opened with the presenter key: leaderboard, every player's answers, survey, close, export. |
| `survey.js` | The end-of-game survey: validity and the presenter's table. Pure functions, fully tested. |
| `scoring.js` | Every point in the session. Pure functions, fully tested. |
| `stats.js` | Crowd result, leaderboard, session statistics. Pure functions, fully tested. |
| `store.js` | The only code that touches the network. |
| `config.js` | Everything you change between sessions: the categories, the matchups, the survey questions and the session label. |
| `apps-script.gs` | The server side. Paste into Apps Script; see below. |
| `rehearse.mjs` | Submits synthetic participants so the path is proven before the day. |

## Before the session

1. **Set the four categories and ten contestants** in `config.js`, and put the
   photographs in `photos/`. The categories shipped here are the pilot mockup's:
   best smile, style, best body, take to Mama.
2. **Set the presenter key.** In the Apps Script editor: **Project Settings → Script
   properties → Add script property**, name `PRESENTER_KEY`, value whatever the
   presenter will type. It is not in this repository, because this repository is public.
   Until it is set the server refuses to close a round or show the statistics page at
   all — which is the intended failure, not a fault.
3. **Deploy the server.** Paste `apps-script.gs` into the Apps Script editor bound to the
   session spreadsheet, then **Deploy → Manage deployments → edit → Version: New version → Deploy**.
   Saving without a new version leaves the old code serving. This catches everyone.
4. **Verify it** with the commands in `apps-script.test.md`.
5. **Rehearse.** `ENDPOINT="…/exec" CODE=REHEARSAL node rehearse.mjs`, then open
   `presenter.html?code=REHEARSAL`, enter the key, and check the leaderboard adds up.
   Delete the `REHEARSAL` rows from the sheet afterwards.
6. **Run the tests.** `node --test` from this directory.

## Session label

Nobody types a session code any more. Every row this build writes carries `SESSION_LABEL`
from `config.js`, and the presenter page shows that label's rows only, so the build-time
test sessions in the same sheet never mix in. Before a second focus group, change the label.
To look at an older session, open `presenter.html?code=DEMO`.

## The survey

After locking, a player answers the questions in `SURVEY` (`config.js`), then sees a
thank-you screen. The menu also offers **Answer the survey** at any point; the game
resumes where it was, and a survey is sent once per device. Players never see results. Answers land in a `survey` tab the script
creates on first use, and appear in the presenter page under "The survey". Three question
types: `scale` (min..max with end labels), `choice` (one of `options`), `text`.
`required: false` makes a question optional.

## What the key protects, and what it does not

The endpoint URL is in `config.js`, so it reaches every participant's browser. That is
unavoidable: the page has to write to it. What the presenter key adds is that only the
presenter can **close a round** and only the presenter can **read anyone's answers** — the
statistics page is refused without it. Submitting answers needs no key.

Nothing here is real security. The key travels in the request to our own endpoint and
sits in the presenter's browser storage. It would not stop someone determined, and the
data is a focus group's opinions about photographs, not anything that needs to.

## On the day

1. Open `presenter.html`, enter the presenter key and press **Load**.
2. Participants open the participant link, enter their name, and play. After locking they
   answer the survey and see a thank-you screen. They never see results.
3. Watch the lock count and the survey count in the presenter page. Nothing appears until a
   person **locks**, because the page sends one request at lock and nothing before it.
   The page cannot tell you who has joined and is still playing, so count the room.
4. When everyone has locked: **Close the round**. The ranking, every player's answers and
   the survey are on the page and refresh every 15 seconds.
5. **Export raw answers** before you close the laptop. The export holds the survey too. Do not edit `config.js` once the
   first person has locked: category keys and matchup ids are the join between a stored
   answer and the reveal, and changing one strands the answers already in the sheet. That file is what the session can be
   re-scored from afterwards, and it is the only copy that does not need the sheet.

## Afterwards

The export holds every raw answer, so the same session can be scored again under the other
readings of the open scoring questions. Ask for that comparison; it is the evidence that
decision has never had.

**One distortion to know about.** With twenty voters a crowd share can only land on a
multiple of five, so exact hits are far more likely than in a real league, and the exact
bonus is worth five of the six points in a category. The leaderboard will reward round-number
guessing more than skill. The presenter console reports the exact-hit rate so you can see it.

## Local development

`python3 -m http.server 8099` then open `http://localhost:8099`. ES modules do not load over
`file://`, so opening the HTML directly fails with an error that has nothing to do with Google.
