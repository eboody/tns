# Ralph Runbook

## Guardrails

- Inputs are de-identified markdown documents only.
- Do not add diagnostic interpretation or recommendation authorship.
- Prefer one logical issue-sized slice per iteration.
- HITL slices may be implemented provisionally only when the user explicitly asks to continue; emitted artifacts must still mark confirmation requirements honestly.

## Feedback loops

- `npm test`
- targeted `node --test src/history-report-bootstrap.test.js` while iterating on bootstrap behavior
- targeted `node --test src/history-report-inventory.test.js` while iterating on inventory behavior
- targeted `node --test src/history-report-evidence.test.js` while iterating on evidence behavior
- targeted `node --test src/history-report-planning.test.js` while iterating on planning behavior
- targeted `node --test src/history-report-style-profile.test.js` while iterating on style-profile behavior
- `git status --short` before commit staging

## Current stop condition

- Work issue-by-issue from #70 through #80.
- Commit after each completed issue-sized slice when explicitly requested by the user.
- Pause at remaining HITL doctrine-promotion decisions unless the user explicitly requests provisional forward progress.
