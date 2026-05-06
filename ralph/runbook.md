# Ralph Runbook

## Current initiative

- Improve text extraction fidelity and honesty (GitHub parent issue #37)

## Iteration guardrails

- One logical issue slice per iteration.
- Prefer invariant-shaping work before source-specific heuristics or UI polish.
- Do not collapse "text exists" into "clean extraction".
- Keep normalization separate from quality judgment.
- Keep offsets aligned with the final extracted-text surface shown to the user.
- Treat OCR as a real supported direction for this initiative, including fallback and redundancy, but keep provenance explicit.
- Do not claim full semantic layout reconstruction for PDF, DOCX tables, or OCR transcripts.

## Required feedback loops for each implementation slice

1. `cargo test --manifest-path src-tauri/Cargo.toml`
2. `cargo check --manifest-path src-tauri/Cargo.toml`
3. `npm run build` only if a slice changes desktop UI or frontend assets

## Current scope note

- Issue #38 is the first active AFK slice.
- Issues #40, #41, and #42 should reuse the same canonical fidelity model rather than invent source-local flags.
- Issue #43 is the final triage/UI integration slice after the core fidelity and provenance work is in place.
