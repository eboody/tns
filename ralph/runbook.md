# Ralph Runbook

## Guardrails

- Inputs are de-identified markdown documents only.
- Do not add diagnostic interpretation or recommendation authorship.
- Prefer one logical issue-sized slice per iteration.
- Stop at HITL issues that require clinician doctrine confirmation.

## Feedback loops

- `npm test`
- targeted `node --test src/history-report-bootstrap.test.js` while iterating on bootstrap behavior
- targeted `node --test src/history-report-inventory.test.js` while iterating on inventory behavior
- `git status --short` before staging a commit

## Current stop condition

- Work issue-by-issue from #70 through #80.
- Commit after each completed issue-sized slice when explicitly requested by the user.
- Pause at HITL slices unless human confirmation has been supplied.
