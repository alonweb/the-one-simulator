# THE ONE — focus group simulator

A throwaway research instrument for one live session. Twenty people play one round of
THE ONE on their own phones; the presenter closes the round and reveals a scored leaderboard.
None of this is production code.

Spec and plan live in the HumanPatterns project under
`_bmad-output/planning-artifacts/focus-group-sim/`.

## The pieces

| File | What it is |
|---|---|
| `index.html`, `app.js`, `draft.js` | What a participant sees. Answers are held in the browser and sent once, at lock. |
| `presenter.html`, `presenter.js` | What the presenter drives: roster, close, reveal, leaderboard, export. |
| `scoring.js` | Every point in the session. Pure functions, fully tested. |
| `stats.js` | Crowd result, leaderboard, session statistics. Pure functions, fully tested. |
| `store.js` | The only code that touches the network. |
| `config.js` | Everything you change between sessions. |
| `apps-script.gs` | The server side. Paste into Apps Script; see below. |
| `rehearse.mjs` | Submits synthetic participants so the path is proven before the day. |

## Before the session

1. **Set the four categories and ten contestants** in `config.js`. Two category labels
   read `TO BE NAMED`; the presenter console warns while they still do.
   Put the photographs in `photos/`.
2. **Deploy the server.** Paste `apps-script.gs` into the Apps Script editor bound to the
   session spreadsheet, then **Deploy → Manage deployments → edit → Version: New version → Deploy**.
   Saving without a new version leaves the old code serving. This catches everyone.
3. **Verify it** with the commands in `apps-script.test.md`.
4. **Rehearse.** `ENDPOINT="…/exec" CODE=REHEARSAL node rehearse.mjs`, then open the
   presenter console against `REHEARSAL` and check the leaderboard adds up.
   Delete the `REHEARSAL` rows from the sheet afterwards.
5. **Run the tests.** `node --test` from this directory.

## On the day

1. Choose a session code and tell the room. It keeps strangers who find the link out of the data.
2. Participants open the participant link, enter the code and their name, and play.
3. Watch them arrive in the presenter console.
4. When everyone has locked: **Close the round**, then **Reveal results**.
5. **Export raw answers** before you close the laptop. That file is what the session can be
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
