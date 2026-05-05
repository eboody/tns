# Ralph Runbook

## Current initiative

- Local installable desktop app for clinician-friendly de-identification

## Iteration guardrails

- One logical issue slice per iteration.
- Do not claim support for formats or entity classes that are not yet wired end-to-end.
- Prefer explicit failure over silent skipping.

## Required feedback loops for each implementation slice

1. `cargo fmt --check`
2. `cargo test`
3. `cargo run -- --input <sample.md> --config <sample.toml>` against a tiny local sample when CLI behavior changes

## Current scope note

- Current repo code already has the CLI engine foundation: extraction, redaction, audit generation, review summaries, optional NER, and regression coverage.
- The active GitHub-backed desktop backlog begins at issue `#20` under parent PRD `#28`.
- The highest-value architectural constraint is to keep the CLI engine as the source of truth and introduce a narrow desktop-facing service boundary above it rather than duplicating workflow logic in the UI layer.
- For desktop work, prefer the smallest installable/local-first slices over broad UI polish.
