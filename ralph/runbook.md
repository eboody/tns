# Ralph runbook

## Scope

Execute GitHub issues #54-#60 one at a time as bounded slices for PRD #53.

## Guardrails

- Prefer the smallest honest slice that makes the profile-versus-case-context boundary explicit.
- Keep one logical issue per iteration even if the working tree already contains adjacent groundwork.
- Preserve current review/replace behavior unless the issue explicitly changes user-visible semantics.
- Do not store case-specific facts in reusable profile persistence.

## Feedback loops

- `npm test`
- `npm run build`
- `cargo test`

## Commit/close policy

- Commit after each completed issue.
- Close the corresponding GitHub issue after verification and commit.
