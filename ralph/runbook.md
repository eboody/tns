# Ralph Runbook

## Current initiative

- ML-assisted folder-to-Markdown de-identification CLI for psychologist workflows

## Iteration guardrails

- One logical issue slice per iteration.
- Do not claim support for formats or entity classes that are not yet wired end-to-end.
- Prefer explicit failure over silent skipping.

## Required feedback loops for each implementation slice

1. `cargo fmt --check`
2. `cargo test`
3. `cargo run -- --input <sample.md> --config <sample.toml>` against a tiny local sample when CLI behavior changes

## Current scope note

- Current repo code already has the deterministic/redact-core foundation, Safe Harbor policy shaping, configured supplementation, directory processing, DOCX/PDF extraction, and fixture-based regression coverage.
- The active GitHub-backed backlog now begins at issue `#14`, where the next architectural seam is a provenance-aware finding model that can support optional ONNX NER without forking the rest of the pipeline.
- For PRD/backlog-only iterations, keep the Ralph artifacts synchronized with the GitHub issue stack and avoid inventing implementation progress that has not yet landed in code.
