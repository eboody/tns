# Ralph Progress

## Current initiative

- Parent PRD: GitHub issue #37
- Active bounded backlog: GitHub issues #38 through #43
- Stop condition: all six issues are complete and required feedback loops are green for each slice
- Highest-value first slice: issue #38 (canonical extraction fidelity model)

## Carry-forward context

- The previous bounded extraction backlog under issues #30 through #36 is complete.
- Existing extraction work already has one richer extraction boundary, DOCX omission flags, PDF degraded-text signaling, and fixture-driven regression coverage.
- The new initiative deepens that work into a more semantically honest fidelity model, broader reporting, OCR provenance/fallback, and triage surfaces.

## Iteration 0 setup

- Re-scoped Ralph from issue #29 / issues #30-#36 to issue #37 / issues #38-#43.
- Confirmed AFK is now justified because the backlog is explicit, the iteration count is capped, OCR direction is no longer ambiguous, and repo-local feedback loops are named.
- Preserve the Ralph rule of one logical issue slice per iteration even though the overall loop is finite.

## Iteration 1 (issue #38)

- Introduced a canonical extraction fidelity model at the extraction boundary with explicit provenance plus omission, structural-loss suspicion, degraded-text, and low-confidence fields.
- Adapted `ExtractedInput` consumers to derive old booleans and coarse status from that richer fidelity model rather than authoring parallel truth.
- Kept the slice bounded: no new user-facing review-summary wording yet, but representative clean and risky cases now prove the model does not falsely report clean extraction.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Iteration 2 (issue #39)

- Surfaced canonical extraction fidelity in both the review summary and machine-readable audit flags.
- Added provenance labeling plus structural-loss and low-confidence reporting without yet doing the broader directory/desktop triage work.
- Kept audit/reporting aligned by serializing the same fidelity model into review flags.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Iteration 3 (issue #40)

- Upgraded DOCX extraction from text-only output to a richer extraction result that carries omission and structural-loss evidence directly.
- Marked table/list-style constructs as structurally lossy rather than pretending paragraph-flattened text is fully faithful.
- Reused the shared fidelity model instead of adding DOCX-only reporting flags.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Iteration 4 (issue #41)

- Refined PDF extraction so low-confidence review posture comes from explicit hazards rather than simply observing that normalization changed the extracted string.
- Added bounded detection for representative token-fusion damage and repeated page-furniture noise while preserving explicit non-extractable failure for empty/native-text-missing PDFs.
- Kept the slice honest: no claim of full PDF layout reconstruction, only better risk separation for clean vs degraded vs failed extraction.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Iteration 5 (issue #42)

- Added a bounded OCR-backed PDF fallback path using local CLI tools rather than attempting a full OCR platform rewrite in one slice.
- Marked OCR participation explicitly in extraction provenance and review/audit messaging so OCR-backed text cannot be mistaken for native extraction.
- Kept the slice honest by treating OCR as a low-confidence, structurally lossy path and limiting the implementation to fallback when native PDF text is unavailable.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Iteration 6 (issue #43)

- Surfaced extraction provenance, structural-loss suspicion, low-confidence review posture, and OCR involvement in run-level batch summaries, desktop result rows, and preview notes.
- Updated the desktop-facing data contract so processed files are triageable without inferring risk from only replacement counts or coarse omission/degraded flags.
- Verified the backend, desktop preview tests, and frontend build all stay green after the richer file-status contract.
- Feedback loops passed: `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `npm run build`.

## Next likely task

- All bounded issues under parent #37 are complete.
