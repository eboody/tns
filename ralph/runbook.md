# Ralph runbook

## Scope

Execute GitHub issues #45-#52 one at a time as bounded slices for PRD #44.

## Guardrails

- Prefer frontend-first changes unless a backend contract change is required.
- Preserve persisted preview edit correctness.
- Keep one logical issue per iteration.

## Feedback loops

- `npm run build`
- `cargo test`
- Targeted browser/UI verification for shell changes when practical

## Commit/close policy

- Commit after each completed issue.
- Close the corresponding GitHub issue after verification and commit.
