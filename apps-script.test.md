# Apps Script endpoint — verification

Run these after deploying a **new version** of `apps-script.gs`. Editing the script
without creating a new version leaves the previous code serving, and every check below
will pass against the old behaviour while proving nothing.

```bash
URL="https://script.google.com/macros/s/AKfycbzuWOwMRpYABdBa3q3MYHlR_jQaiXm5j7EQ3VJOjy3-SDDD6ckSH7sBAUo0Xg0RFNP_/exec"

# 1. a submission is accepted
curl -sS -L --data '{"kind":"submission","sessionCode":"T1","submissionId":"s-1","participant":"Ana","answers":{"m1":{}}}' -H 'Content-Type: text/plain' "$URL"
# expect {"ok":true,"duplicate":false}

# 2. the same submissionId is rejected as a duplicate, no second row
curl -sS -L --data '{"kind":"submission","sessionCode":"T1","submissionId":"s-1","participant":"Ana","answers":{"m1":{}}}' -H 'Content-Type: text/plain' "$URL"
# expect {"ok":true,"duplicate":true}

# 3. rows are filtered by session code
curl -sS -L "$URL?what=rows&code=T1"
# expect exactly one row

# 4. the presenter can change state
curl -sS -L --data '{"kind":"state","sessionCode":"T1","state":"closed"}' -H 'Content-Type: text/plain' "$URL"
curl -sS -L "$URL?what=state&code=T1"
# expect {"ok":true,"state":"closed"}

# 5. an unknown session reads as open
curl -sS -L "$URL?what=state&code=NOPE"
# expect {"ok":true,"state":"open"}
```

Delete the `T1` rows from both sheets afterwards.

## Result

Not yet run. The deployment is a manual step in the spreadsheet owner's Google account.
