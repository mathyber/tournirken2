Run a full dev → qa cycle for: $ARGUMENTS

## Step 1 — Developer
Spawn a subagent with /dev persona.
Task: implement or fix — $ARGUMENTS
Wait for completion.

## Step 2 — QA
Spawn a separate subagent with /qa persona.
Give them only the final result (no dev reasoning).
Task: find everything wrong with what was just built.
Wait for report.

## Step 3 — Fix loop
If QA found critical or high severity bugs:
- Pass the QA report to a new dev subagent
- Ask them to fix all critical/high issues
- Re-run QA on the fixes
Repeat until QA reports no critical/high bugs.

## Step 4 — Summary
Report what was built, what bugs were found, what was fixed.
```

---

## Как юзать

Просто разраб:
```
/dev добавь валидацию формы регистрации
```

Просто тестировщик (на то что уже есть):
```
/qa
```

Полный цикл:
```
/review-cycle добавить страницу профиля пользователя