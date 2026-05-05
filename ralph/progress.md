# Ralph Progress

## Pivot note

- The current local implementation is now treated as pre-pivot prototype work.
- We inspected `redact-core` and decided the honest plan is to use it as the structured-identifier engine instead of continuing to grow a homegrown regex core.
- The backlog, PRD, and GitHub issues were rewritten around a Safe Harbor-oriented `redact-core` architecture.

## What changed in planning

- Added a Safe Harbor coverage matrix at `docs/safe-harbor-coverage.md`.
- Added a pivoted PRD at `docs/redact-core-safe-harbor-prd.md`.
- Created GitHub PRD issue `#11` and rewrote issues `#1` through `#10` around the pivot.

## Iteration 1 (pivoted backlog)

- Selected highest-priority bounded slice: pivot issue-01.
- Added `redact-core` as the primary structured-identifier engine for the single-file tracer bullet.
- Rewired replace, dry-run, and review flows so their structured detections come from `redact-core` rather than the homegrown pattern path.
- Added structured-identifier audit output based on `redact-core` detections.
- Added an explicit coverage note stating that built-in structured detection is not yet full Safe Harbor coverage.
- Verified the tracer bullet on a Markdown sample where email and phone were de-identified through `redact-core`.

## Iteration 2 (pivoted backlog)

- Began issue-02 with a first Safe Harbor policy behavior implemented through the public `run(RunOptions)` interface.
- Added a policy layer that transforms `DATE_TIME` detections into year-only output for structured ISO dates instead of exposing raw `[DATE_TIME]` replacements.
- Preserved `redact-core` as the detection engine while moving replacement semantics for dates into the local Safe Harbor policy boundary.
- Verified the behavior end-to-end on a Markdown sample where `2003-01-02` became `2003` in output and audit artifacts recorded the policy replacement.

## Iteration 3 (pivoted backlog)

- Continued issue-02 with a second public-behavior slice focused on review semantics rather than raw replacement mechanics.
- Changed review summaries to report policy-transformed dates as `policy:DATE_TIME` rather than presenting them as ordinary raw library replacements.
- Kept non-date structured identifiers labeled as `redact-core:*` so review output now begins to distinguish policy-shaped behavior from direct library coverage.

## Iteration 4 (pivoted backlog)

- Continued issue-02 with a third public-behavior slice focused on residual-risk communication.
- Added explicit residual Safe Harbor gap categories to review output instead of relying only on a single generic coverage note.
- Verified that review mode now names unresolved categories such as names, sub-state geography, ages over 89, non-text identifiers, and other unique identifying codes requiring later coverage.

## Iteration 5 (pivoted backlog)

- Continued issue-02 with a fourth public-behavior slice focused on Safe Harbor age handling.
- Added policy behavior so structured `AGE` detections over 89 are transformed to `90 or older` in replace mode.
- Verified the behavior end-to-end on a Markdown sample where `age 94` became `90 or older` while other structured identifiers still flowed through the same engine.

## Iteration 6 (pivoted backlog)

- Continued issue-02 with a fifth public-behavior slice focused on review labeling consistency.
- Updated review summaries so age-over-89 transformations are surfaced as `policy:AGE`, matching the existing policy-vs-library distinction already introduced for dates.
- Verified that review mode now distinguishes both policy-transformed dates and policy-transformed ages from raw `redact-core` structured replacements.

## Iteration 7 (pivoted backlog)

- Continued issue-02 with a sixth public-behavior slice focused on policy coverage communication.
- Added explicit review-summary sections that separate currently policy-shaped Safe Harbor behaviors from currently raw structured `redact-core` coverage.
- Verified that review mode now lists `DATE_TIME` and `AGE` under policy-shaped behavior while keeping `EMAIL_ADDRESS` under raw structured coverage.

## Iteration 8 (pivoted backlog)

- Continued issue-02 with a seventh public-behavior slice focused on explicit Safe Harbor category mapping.
- Added a review-summary section that maps currently covered behaviors to Safe Harbor category numbers rather than only listing raw entity types.
- Verified that review mode now reports covered category-level claims such as Category 3 for dates/ages and Category 6 for email addresses when those detections are present.

## Iteration 9 (pivoted backlog)

- Began issue-03 with a first configured-known-entity supplementation slice through the public interface.
- Wired optional config loading back into the main pipeline so configured client-name replacement can run alongside `redact-core` structured detection.
- Verified end-to-end that a configured client name is replaced with `CLIENT` while email detection still flows through `redact-core` in the same output and audit artifact.

## Iteration 10 (pivoted backlog)

- Continued issue-03 with a second public-behavior slice focused on review-surface honesty.
- Updated review mode so configured client-name supplementation is labeled as `configured:client` rather than being blended into raw `redact-core` coverage.
- Verified that review output now distinguishes configured name replacement from structured library-driven email replacement in the same sample.

## Iteration 11 (pivoted backlog)

- Continued issue-03 with a third public-behavior slice focused on summary correctness rather than replacement mechanics.
- Fixed the review coverage summary so configured entities are no longer listed under raw `redact-core` structured coverage.
- Verified that review mode now reports configured client replacement separately while keeping only `EMAIL_ADDRESS` under raw structured coverage for the sample.

## Iteration 12 (pivoted backlog)

- Continued issue-03 with a fourth public-behavior slice that expands configured supplementation beyond the client.
- Verified end-to-end that configured provider replacement works alongside `redact-core` structured detection in replace mode.
- Updated review mode so configured provider replacement is labeled as `configured:provider`, keeping it clearly separate from raw `redact-core` coverage.

## Iteration 13 (pivoted backlog)

- Closed out issue-03 by extending the same configured supplementation path to `institution` and `location`.
- Verified deterministic end-to-end replacement for configured client, provider, institution, and location entities alongside `redact-core` structured detection.
- Verified review output distinguishes configured replacements from raw structured coverage and still surfaces residual unknown contextual identifiers as review-sensitive gaps.

## Issue-04 completion check

- Verified that replace mode writes outputs and audit artifacts while dry-run and review modes remain non-writing.
- Verified that dry-run and review summaries are source-aware, distinguishing configured supplementation, policy-shaped behavior, and raw `redact-core` structured coverage.
- Marked issue-04 complete because its acceptance criteria are now satisfied by the current public CLI behavior.

## Issue-05 completion

- Added directory input support so the CLI can process all supported files under a directory rather than only one file at a time.
- Added include/exclude glob filtering at the CLI boundary.
- Implemented parallel-directory style replace-mode outputs with mirrored Markdown paths plus per-file audit artifacts.
- Added run-level summaries reporting processed, skipped, unsupported, and review-sensitive files.
- Verified both replace-mode batch processing and filtered review-mode batch processing through the public CLI.

## Iteration 14 (pivoted backlog)

- Began issue-07 with a first bounded custom-gap slice instead of trying to solve all residual gaps at once.
- Added deterministic fax-number classification layered on top of `redact-core` phone detection when nearby context indicates `fax`.
- Verified that review output now surfaces fax numbers as `custom:FAX_NUMBER` and maps them to Safe Harbor Category 5, while ordinary structured detections still remain distinct.

## Iteration 15 (pivoted backlog)

- Continued issue-07 with a second custom-gap slice for address/sub-state geography handling.
- Added deterministic custom address classification that redacts address-like spans and maps them to Safe Harbor Category 2.
- Added an explicit overlap-resolution test showing custom fax classification suppresses the overlapping generic phone detection rather than duplicating it.
- Marked issue-07 complete because custom gap recognizers now exist, overlap behavior is exercised explicitly, and residual unresolved categories remain surfaced for review.

## Issue-06 completion

- Added DOCX input support by extracting `word/document.xml` into Markdown paragraphs before running the existing de-identification pipeline.
- Ensured DOCX inputs write Markdown outputs (`*.deidentified.md`) rather than pretending to preserve binary document structure.
- Surfaced unsupported/non-text DOCX content explicitly with `[OMITTED_NON_TEXT_CONTENT]` instead of silently preserving it.
- Verified end-to-end DOCX extraction plus de-identification through the public CLI and added regression tests for both readable text and non-text placeholder behavior.

## Issue-09 completion

- Added first-release support for text-extractable PDF ingestion using `lopdf` text extraction.
- Wired extracted PDF text into the same Markdown-first de-identification pipeline used by other formats.
- Added explicit failure behavior for PDFs with no extractable text or invalid PDF structure instead of silently claiming success.
- Verified both extractable and non-extractable PDF flows through the public CLI.

## Issue-10 completion

- Added a fixture-driven integration harness under `tests/safe_harbor_fixture_matrix.rs`.
- Added reusable fixture cases covering Markdown, plain text, DOCX, extractable PDF, invalid PDF, configured supplementation, policy-shaped behavior, and custom gap classification.
- Verified the harness covers both success cases and explicit failure behavior through the public `run(RunOptions)` interface.

## Issue-08 completion

- Added deterministic de-identification of output filenames and audit artifact names in batch workflows using the same configured replacement rules used for content supplementation.
- Added run-summary reporting for renamed outputs so the operator can see which file paths changed during batch processing.
- Verified filename and artifact-name de-identification through tests and batch CLI execution.

## Issue-02 completion

- Marked the Safe Harbor policy mapping issue complete based on the accumulated policy slices already implemented earlier in the loop.
- The current public behavior now distinguishes raw structured coverage, policy-shaped behavior, covered Safe Harbor categories, and residual unresolved gaps.

## Next likely task

- The planned backlog is complete. Remaining work is now optional hardening: false-positive reduction, packaging/distribution, or broader policy refinement beyond the current issue set.

## Iteration 16 (GitHub issue #13)

- Selected the smallest honest slice for the new GitHub issue backlog: change only the default directory-output contract for batch runs.
- Ran impact analysis on the public `run` entrypoint; blast radius was high because the change affects `main` and many run-level tests, so the implementation stayed tightly bounded to batch default path logic.
- Changed default directory runs to write Markdown outputs under `input/redacted` and default audit artifacts under `input/redacted/.audit`.
- Added a traversal guard that skips generated output and audit paths so reruns do not accidentally reprocess prior generated artifacts when the default output folder lives under the input tree.
- Verified the slice with `cargo fmt --check`, `cargo test`, and a sample CLI directory run that printed the new default output/audit paths.

## Next likely task

- Issue #13 appears complete. The next highest-value work in the new GitHub backlog is issue #14: unify structured/configured/policy detections behind one provenance-aware finding model.

## Iteration 17 (PRD scaffolding completion)

- Completed the repo-local Ralph backlog so it now matches the GitHub PRD stack under parent issue #12 instead of stopping at the legacy deterministic slices plus issue #13.
- Added explicit pending backlog items for issues #14 through #19 in `ralph/prd.json`, keeping verification criteria and notes concise so future iterations can pick the next bounded slice honestly.
- Updated `ralph/runbook.md` to reflect the current initiative and to state that the next architectural boundary is issue #14's provenance-aware finding model.
- Treated this as scaffolding work only: no runtime behavior changed, and no new implementation claims were added to product code.

## Next likely task

- Begin issue #14 with the smallest honest architectural slice that introduces a unified provenance-aware finding shape without yet adding ML behavior.

## Iteration 18 (GitHub issue #14)

- Began issue #14 with the smallest honest architectural slice instead of trying to unify the entire redaction pipeline in one pass.
- Ran impact analysis on the public `run` entrypoint; blast radius remained high because provenance modeling flows through `main` and many run-level tests, so the implementation stayed strictly at the finding-model boundary.
- Added an explicit provenance field to audit records with stable source labels: `redact_core`, `policy`, `configured`, and `custom`.
- Rewired current structured/policy/configured/custom record creation paths to populate that source explicitly, and changed review-summary classification to read the explicit source instead of reverse-engineering provenance from free-form reason strings.
- Verified the slice with `cargo fmt --check`, `cargo test`, and a sample CLI directory run; tests now also assert the audit JSON includes stable source values.

## Next likely task

- Continue issue #14 by introducing a deeper shared finding shape earlier in the pipeline so output writing, audit generation, and review summaries all consume the same abstraction rather than just sharing explicit source labels at the audit-record boundary.

## Iteration 19 (GitHub issue #14)

- Continued issue #14 with the next bounded architectural slice: move the shared provenance-aware model earlier in the pipeline instead of keeping it only at the serialized audit-record boundary.
- Kept the blast radius contained to the existing public `run` path even though impact remained high, because the change still preserved the same CLI behavior and only deepened the internal abstraction boundary.
- Introduced a shared `Finding` model that now carries the redaction data through safe-harbor policy application, configured replacement results, review summaries, and audit-report construction.
- Narrowed `AuditRecord` to its honest role as the final serialized audit artifact, produced from the shared `Finding` model rather than being the pipeline’s internal working representation.
- Verified the slice with `cargo fmt --check`, `cargo test`, and a sample CLI directory run.

## Next likely task

- Continue issue #14 by unifying the remaining orchestration logic around the shared finding model, especially the replace-count / summary boundary, and then reassess whether issue #14 is complete enough to unblock issue #15.

## Iteration 20 (GitHub issue #15)

- Reassessed the architectural state after the issue-14 finding-model work and treated issue #14 as complete enough to unblock the first issue-15 slice.
- Fetched current `redact-ner` docs and used that boundary to add optional local NER configuration through the existing config-file path rather than widening the CLI surface immediately.
- Added optional `[ner]` config support with `enabled`, `model_path`, `tokenizer_path`, and `min_confidence`.
- Wired analyzer construction so deterministic fallback remains the default when NER is not configured, while enabled NER now attempts recognizer initialization and fails explicitly when model/tokenizer assets are missing.
- Verified the slice with `cargo fmt --check`, `cargo test`, and preserved fallback behavior through the existing sample CLI run.

## Next likely task

- Continue issue #15 with the first positive model-backed detection slice, ideally by introducing a bounded way to verify successful contextual recognition without yet widening scope into psychology-specific policy behavior.

## Iteration 21 (GitHub issue #15)

- Continued issue #15 with the next bounded slice: prove a positive ML-style contextual detection path without requiring a real ONNX model in every test run.
- Kept the blast radius narrow despite the high-risk public `run` boundary by introducing a recognizer-loading seam under the existing analyzer construction path rather than widening the CLI or policy surface.
- Added a shared recognizer-injection path and a test-only fake NER recognizer that emits a `PERSON` detection.
- Updated source classification so NER-style recognizers surface as `ml` findings rather than being mislabeled as generic pattern detections.
- Verified that injected contextual detections flow through the same finding model, replacement logic, and review-summary path as the rest of the pipeline.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Continue issue #15 with a real-model-facing slice, ideally the smallest honest path that proves positive contextual detection with actual local model assets or otherwise makes the remaining gap explicit enough to decide whether issue #15 can close before issue #16 begins.

## Iteration 22 (GitHub issue #15)

- Continued issue #15 with a small operator-visible slice rather than widening detection scope further.
- Added review-summary accounting that separates ML-assisted contextual coverage from raw structured `redact-core` coverage and policy-shaped behavior.
- Verified the new reporting path through the injected fake-NER test seam so ML-assisted `PERSON` detections now surface both as `[ml:PERSON] ...` records and under a dedicated `Currently ML-assisted contextual coverage:` section.
- Kept the runtime CLI behavior unchanged for deterministic runs while strengthening the review surface for future real-model-backed detections.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Continue issue #15 with the smallest honest real-model-facing path, or explicitly decide that the remaining real-model proof belongs outside this repo if no model assets can be checked in or provisioned locally.
