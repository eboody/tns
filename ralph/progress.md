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

## Iteration 23 (GitHub issue #15)

- Continued issue #15 with a run-level observability slice rather than widening detection semantics.
- Added explicit `ml-assisted contextual recognition: enabled` reporting to review summaries when the NER path is active, so operators can tell that contextual ML was actually enabled for the run rather than inferring it only from individual findings.
- Kept the slice narrow by plumbing the activation state through the existing structured-run summary path without changing deterministic fallback behavior.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Decide whether issue #15 needs a real local-model acceptance path inside this repo, or whether the remaining gap should be documented explicitly so work can move honestly to issue #16.

## Iteration 24 (GitHub issue #15)

- Assessed the real-model gap directly and confirmed there are no local `model.onnx` / `tokenizer.json` assets in the repo or approved temp workspace.
- Chose the smallest honest path forward: codify real local-model verification as an ignored acceptance test instead of pretending the assets exist in-repo.
- Added an ignored test gated by `TNS_DEID_NER_MODEL_PATH` and optional `TNS_DEID_NER_TOKENIZER_PATH` that runs the real `run()` path in review mode and asserts ML-assisted findings appear when an operator provides actual local assets.
- Kept runtime behavior unchanged; this slice only strengthens the repo’s honest verification story around the remaining asset-dependent gap.
- Verified the slice with `cargo fmt --check` and `cargo test`, where the new real-model test is explicitly reported as ignored.

## Next likely task

- Issue #15 is now honest enough to stop blocking the backlog. Begin issue #16 with the smallest bounded psychology-specific contextual redaction slice.

## Iteration 25 (GitHub issue #16)

- Began issue #16 with the smallest honest psychology-specific contextual redaction slice instead of attempting broad free-text clinical understanding.
- Ran impact analysis on `safe_harbor_policy::apply`; risk was high, so the implementation stayed tightly scoped to labeled clinical field values only.
- Added deterministic custom redaction for labeled `Client:` / `Patient:` fields and labeled `Provider:` / `Examiner:` / `Clinician:` / `Therapist:` / `Psychologist:` fields.
- Mapped those custom findings to Safe Harbor Category 1 (names) in review summaries.
- Verified the slice end-to-end in replace mode and review mode with realistic psychology-style intake text, alongside the existing full feedback loop.

## Next likely task

- Continue issue #16 with the next bounded contextual slice, likely guardian/family-role labels or school/clinic labeled fields, while keeping the logic deterministic and explicitly review-bounded.

## Iteration 26 (GitHub issue #16)

- Continued issue #16 with the next bounded psychology-specific contextual slice: labeled family-role fields only.
- Kept the blast radius controlled despite the high-risk policy boundary by restricting the change to deterministic labels such as `Mother:`, `Father:`, `Parent:`, `Guardian:`, `Caregiver:`, `Spouse:`, and `Sibling:`.
- Added custom redaction for those labeled field values to `[FAMILY_MEMBER]` and mapped them to Safe Harbor Category 1 (names).
- Verified the slice in both replace mode and review mode with realistic psychology-style text, alongside the full feedback loop.

## Next likely task

- Continue issue #16 with another bounded contextual slice, likely labeled school/clinic/institution fields, while keeping the implementation deterministic and review-bounded.

## Iteration 27 (GitHub issue #16)

- Continued issue #16 with the next bounded psychology-specific contextual slice: labeled institution fields only.
- Kept the scope deterministic and review-bounded by targeting explicit labels such as `School:`, `Clinic:`, `Hospital:`, `Institution:`, `Employer:`, `Workplace:`, `University:`, and `College:` rather than attempting generic organization inference.
- Added custom redaction for those labeled values to `[INSTITUTION]` and mapped them into the current Safe Harbor summary as Category 2 coverage.
- Verified the slice in both replace mode and review mode with realistic psychology-style text, along with the full feedback loop.

## Next likely task

- Reassess whether issue #16 is complete enough for the currently evidenced psychology-specific labels, or continue with one more bounded slice if there is a clearly recurring labeled context still missing.

## Iteration 28 (GitHub issue #17)

- Reassessed issue #16 after the labeled institution slice and treated it as complete for the current bounded psychology-specific scope, since the remaining gaps are broader unlabeled free-text semantics rather than one more obvious deterministic label family.
- Began issue #17 with a small audit/review slice instead of widening behavior elsewhere.
- Added optional confidence scores to the shared `Finding` model and serialized audit records where the underlying detector supplies a score.
- Kept configured and custom deterministic findings explicitly unscored rather than inventing fake confidence values.
- Updated review summaries to display confidence when present, and verified the behavior through both raw structured detections and injected ML-style detections.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Continue issue #17 with the next bounded review-surface improvement, likely an explicit residual-risk summary section or clearer distinction between low-confidence ML findings and deterministic findings.

## Iteration 29 (GitHub issue #17)

- Continued issue #17 with a machine-readable audit slice instead of adding more prose-only review output.
- Added serialized `review_flags` to audit artifacts, currently covering whether ML was active, whether any ML findings were present, and the current residual review-gap list.
- Kept the slice honest by reusing the existing residual-gap framing rather than inventing new confidence semantics for deterministic findings.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Continue issue #17 with one more bounded review-surface improvement, likely a clearer residual-risk summary section for dry-run/review mode or a dedicated low-confidence ML subsection if the current evidence justifies it.

## Iteration 30 (GitHub issue #17)

- Continued issue #17 with an operator-facing residual-risk summary slice in dry-run/review output.
- Added an explicit `Residual review risk summary:` section that reports open residual-gap count, low-confidence ML findings below the current threshold when ML is active, and the count of deterministic custom contextual findings that still merit operator sanity-checking in context.
- Kept the slice honest by counting only existing evidence rather than inventing new confidence semantics or claiming broader review certainty.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Reassess whether issue #17 is now complete enough for the current audit/review scope, or add one final bounded slice only if a clearly missing operator-facing distinction remains.

## Iteration 31 (GitHub issue #18)

- Reassessed issue #17 after the residual-risk summary slice and treated it as complete for the current audit/review scope.
- Began issue #18 with the smallest extraction-honesty slice rather than widening OCR or parser scope.
- Added explicit non-text omission detection based on extracted `[OMITTED_NON_TEXT_CONTENT]` placeholders and threaded that signal through single-file review summaries, batch summaries, and machine-readable audit flags.
- Verified the slice with new tests for review-mode omission surfacing, batch omission counting/listing, and audit-flag serialization, alongside the full feedback loop.

## Next likely task

- Continue issue #18 with the next bounded extraction-confidence slice, likely distinguishing weak extraction from clean text extraction more explicitly for supported formats.

## Iteration 32 (GitHub issue #18)

- Continued issue #18 with a machine-readable extraction-status slice rather than inventing heuristic OCR-confidence claims.
- Added explicit extraction status modeling as `clean_text` vs `non_text_omissions` and threaded it through run summaries, review output, and audit review flags.
- Kept the slice honest by representing only states the current pipeline can actually observe, rather than pretending to measure weak OCR or semantic extraction quality.
- Verified the slice with `cargo fmt --check`, `cargo test`, and the existing sample CLI fallback run.

## Next likely task

- Decide whether issue #18 needs one more bounded slice for extraction-failure reporting symmetry, or whether the current extraction-status and omission signaling is sufficient to move on to issue #19.

## Iteration 33 (GitHub issue #19)

- Reassessed issue #18 after the extraction-status slice and treated it as complete enough for the current bounded extraction-honesty scope.
- Began issue #19 with a narrow regression-contract slice rather than changing runtime behavior.
- Extended the fixture matrix to cover docx non-text omission review/audit expectations and explicit NER model-misconfiguration failure via config fixtures.
- Verified the slice with `cargo fmt --check` and `cargo test`, including the end-to-end fixture harness.

## Next likely task

- Continue issue #19 with the next bounded contract-verification slice, likely fixture coverage for the newer psychology-specific labeled-context behavior or the machine-readable review flags.

## Iteration 34 (GitHub issue #19)

- Continued issue #19 with the next bounded contract-verification slice: regression coverage for the newer psychology-specific labeled-context behavior.
- Added a combined labeled-context fixture covering client, provider, family, institution, and email behavior in one realistic psychology-style sample.
- Extended the fixture matrix to verify both replace-mode outputs/audit content and review-mode custom finding/category reporting for that combined sample.
- Verified the slice with `cargo fmt --check` and `cargo test`, including the fixture harness.

## Next likely task

- Reassess whether issue #19 is now complete enough for the current public contract, or add one final bounded fixture slice if there is a clearly missing workflow surface still uncovered.

## Iteration 35 (GitHub issue #19)

- Added one final bounded fixture slice to cover machine-readable review-flag and residual-risk surfaces inside the default matrix contract.
- Extended the matrix assertions so the deterministic client/email replace case now checks `review_flags`, `ml_active`, `has_ml_findings`, and `extraction_status`, and the policy review case now checks the residual-review-risk summary section.
- Reassessed the full regression story after this slice and marked issue #19 complete for the current public contract.

## Next likely task

- The GitHub backlog through issue #19 is now complete for the current scoped initiative. Next work would be new backlog creation or hardening beyond the agreed slices.

## Iteration 36 (backlog reconciliation)

- Reconciled the Ralph backlog state with the actual scoped work delivered across issues #15 through #19.
- Marked issue #15 complete because the remaining limitation is local model asset availability, not missing in-repo integration work.
- Marked issue #18 complete because the current extraction-honesty scope is satisfied by non-text omission signaling plus explicit extraction-status reporting, without pretending to measure OCR or semantic extraction quality.
- The Ralph backlog is now internally consistent with the completed scoped initiative.

## Next likely task

- No further scoped PRD tasks remain. Any next step would be a new backlog or follow-on initiative rather than unfinished work from this one.

## Iteration 37 (desktop AFK loop setup)

- Closed the prior CLI initiative and reset the Ralph backlog to the new desktop-app initiative under parent PRD issue `#28`.
- Replaced the completed CLI-oriented `ralph/prd.json` with a fresh desktop backlog covering issues `#20` through `#27`.
- Updated `ralph/runbook.md` so the current initiative, architectural constraint, and workflow emphasis now match the local installable desktop-app goal.
- Chose not to edit product code yet in this iteration; the honest first desktop slice is to restore bounded loop memory before touching the Tauri/app-service surface.

## Next likely task

- Begin issue `#20` with the smallest honest technical slice: introduce a stable desktop-facing app-service boundary that can run the existing review workflow locally before any substantial UI shell work.

## Iteration 38 (GitHub issue #20)

- Began issue `#20` with the smallest honest technical slice instead of jumping straight into a Tauri shell.
- Added a stable desktop-facing review service boundary that wraps the existing local review workflow behind desktop-specific request/result structs.
- Verified that the new service path drives the real non-writing review flow and does not create output files, giving the future desktop shell a real backend call surface without duplicating engine logic.
- Verified the slice with `cargo fmt --check` and `cargo test`.

## Next likely task

- Continue issue `#20` with the next bounded slice: add a lightweight desktop-runner boundary for basic folder selection / shell bootstrap, or the minimal Tauri scaffold needed to invoke the new review service honestly.

## Iteration 39 (GitHub issue #20)

- Continued issue `#20` with the minimal Tauri shell scaffold rather than jumping straight to polished folder-picking UX.
- Added a small desktop frontend/static shell plus a `src-tauri` crate that invokes the shared desktop review service through a real Tauri command.
- Verified that the root Rust crate still passes its existing feedback loops and that the new desktop crate compiles successfully with `cargo check --manifest-path desktop/src-tauri/Cargo.toml`.
- Kept the slice bounded: the shell can call the real backend review command, but native folder-picker UX is still the next honest missing piece.

## Next likely task

- Continue issue `#20` with native folder selection in the desktop shell so the clinician can choose a local folder through the UI instead of typing a path manually.

## Iteration 40 (GitHub issue #20)

- Implemented the next bounded issue-20 slice: native folder-selection wiring in the desktop shell using the Tauri dialog plugin.
- Updated the desktop frontend to populate the input path from a folder picker instead of requiring manual path entry only, and wired the plugin into the Tauri shell/capability setup.
- Kept the slice narrow: no attempt yet to add polished config picking, richer progress UX, or replace-mode behavior.
- Verified the root crate still passes `cargo fmt --check` and `cargo test`.
- Desktop-crate verification is still pending: the Tauri `cargo check --manifest-path desktop/src-tauri/Cargo.toml` did not complete within a normal short timeout, so this slice should be treated as implemented-but-not-fully-verified rather than complete.

## Next likely task

- Get a reliable short-window confirmation path for the desktop crate (or otherwise tighten the scaffold so verification is faster), then continue issue `#20` toward a fully verified first shell slice.

## Iteration 41 (GitHub issue #20)

- Tried the smallest honest verification-focused iteration before widening the desktop shell further.
- Re-ran the root `cargo fmt --check` successfully.
- Re-ran the desktop-crate check with the normal short timeout and it still did not complete within that window, even after dependencies had already been built.
- Chose not to expand the desktop scope further in this iteration because the shell baseline is still only partially verified under the current timeout constraint.

## Next likely task

- Find a verification path for the desktop crate that fits the no-long-timeout constraint, or accept that the desktop-shell work needs a relaxed timeout before issue `#20` can be advanced honestly.

## Iteration 42 (desktop shell debugging + replace path)

- Used the running desktop shell itself as the verification surface and found two concrete frontend/backend mismatches: the Tauri command bridge had an inconsistent command/import state, and the frontend logic was still relying on module-style imports / inline-script patterns that were not executing reliably in the static shell.
- Fixed the Tauri command bridge for both review and replace workflows, switched the shell to a plain external script using the Tauri global API, and added a first replace-mode path through the desktop service, Tauri command layer, and shell summary UI.
- Added backend tests for the shared desktop replace service and kept the existing root feedback loops green.
- The desktop shell is materially closer to usable now, but because the direct UI verification path is still awkward in this environment, I am not yet marking issue `#20` or `#21` complete solely from this iteration.

## Next likely task

- Continue desktop-shell verification and, if the replace path is confirmed, either close issue `#20` or move directly into the next bounded issue `#21` shell ergonomics slice (for example opening the output folder from the app).

## Iteration 43 (desktop frontend hardening)

- Reassessed the shell debugging path and concluded the most honest next move was not more ad hoc DOM patching, but a bounded frontend hardening slice.
- Migrated the desktop shell from the fragile static/global-loading setup to a proper Vite frontend structure, while preserving the existing review and replace command bridges.
- Verified the root Rust crate still passes the required feedback loops and that the desktop frontend now has a successful short-window `npm run build` path.
- This does not yet close issue `#20`, because the full `tauri dev` path still needs end-to-end verification through the new frontend, but it meaningfully improves the odds that the shell will behave reliably.

## Next likely task

- Re-run `npm run tauri dev` against the Vite-based shell and verify the working desktop review path directly; if that passes, issue `#20` can likely be closed and issue `#21` can be advanced honestly.

## Iteration 44 (desktop live verification)

- Verified the Vite-backed desktop shell through the real `npm run tauri dev` path instead of relying on speculative shell state.
- Confirmed that the shell now loads its frontend correctly, shows the expected summary startup text, accepts a chosen folder, and runs the real non-writing review workflow end-to-end.
- Then advanced the next bounded replace slice and verified that replace mode writes the expected `redacted/` outputs and `.audit/` artifacts on disk while surfacing the output and audit paths in the UI summary.
- Marked issue `#20` complete and advanced issue `#21` to the next remaining ergonomics gap.

## Next likely task

- Continue issue `#21` with opener/results ergonomics so the user can open or inspect the generated output location directly from the desktop shell.

## Iteration 45 (GitHub issue #21)

- Continued issue `#21` with a bounded opener ergonomics slice after the replace path had already been verified end-to-end.
- Added Tauri-owned last-run artifact state so the app can open only the most recent generated output and audit directories, instead of granting the frontend a broad arbitrary-path opener capability.
- Added output/audit folder buttons to the desktop results surface and enabled them only after a successful replace run.
- Verified the slice with `cargo fmt --check`, `cargo test`, `cargo fmt --check --manifest-path desktop/src-tauri/Cargo.toml`, `cargo check --manifest-path desktop/src-tauri/Cargo.toml`, and `npm run build`.
- Did not mark issue `#21` complete yet because the final opener behavior still needs live running-app verification.

## Next likely task

- Launch the desktop shell and verify the new output/audit buttons open the generated folders after a real replace run; if that passes, mark issue `#21` complete and move to issue `#22` results-screen detail.

## Iteration 46 (GitHub issue #21)

- Completed the live opener verification slice for issue `#21`.
- Launched the rebuilt desktop app through `tauri-driver`, ran a real replace workflow against a temporary local sample folder, and confirmed the UI summary reported the generated `redacted/` output path and `.audit/` path.
- Verified the output and audit opener buttons are enabled only after the successful replace run and that both button commands invoke without surfacing frontend or Tauri command errors.
- Verified the generated output and audit artifacts exist on disk.
- Marked issue `#21` complete because its remaining opener/results ergonomics acceptance criterion is now satisfied.

## Next likely task

- Begin issue `#22` with the smallest honest results-screen slice: derive and render per-file statuses from the real desktop run summary rather than introducing mock results data.

## Iteration 47 (GitHub issue #22)

- Began issue `#22` with the smallest honest results-screen slice instead of jumping straight to full before/after diff panes.
- Kept the high-risk `run` / `run_directory` boundary narrow by adding typed per-file run statuses alongside the existing textual summaries, preserving current CLI behavior while giving the desktop surface structured result data.
- Updated the desktop shell to support explicit file or folder picking, show a simple selected-input list, and render real per-file result cards after review/replace runs.
- Verified the slice with `cargo fmt --check`, `cargo test`, `cargo check --manifest-path desktop/src-tauri/Cargo.toml`, `npm run build`, and a live desktop automation pass that confirmed the selected-input list and per-file result list populate from a real replace run.
- Did not mark issue `#22` complete yet because the remaining user-visible verification surface still needs richer before/after review affordances and changed-span presentation.

## Next likely task

- Continue issue `#22` with the next honest verification-centered slice: add per-file preview data for a selected result so the UI can grow toward before/after review panes without inventing fake diff/highlight behavior.

## Iteration 48 (GitHub issue #22)

- Continued issue `#22` with the next honest verification-centered slice: selected-file preview data for real replace results.
- Kept the implementation at the desktop-facing boundary rather than changing the central `run` pipeline again: the desktop service now reads real output/audit artifacts and builds preview payloads for processed files.
- Added a first before/after preview panel in the desktop UI for selected result files, using real original/output text plus audit-derived highlighted spans for replace runs.
- Kept the slice honest by limiting preview availability to files whose original text can be read directly in the current desktop boundary; non-plain-text source formats still need broader preview support later.
- Verified the slice with `cargo fmt --check`, `cargo test`, `cargo check --manifest-path desktop/src-tauri/Cargo.toml`, `npm run build`, and a live desktop automation pass showing the selected-file preview pane populated with real before/after text from a replace run.

## Next likely task

- Continue issue `#22` with the next UX-deepening slice: broaden the selection/review surface with file-drop or multi-file ergonomics, then refine preview fidelity for non-plain-text source formats and more explicit visual diff/highlight polish.

## Iteration 49 (GitHub issue #22)

- Refined the desktop layout so the file list acts as the navigation surface and the before/after previews dominate the screen, matching the intended verification workflow more honestly.
- Reorganized the shell into a wide two-column workspace: sidebar for selected input, file results, and run details; main area for large side-by-side previews.
- Kept behavior unchanged while improving visual hierarchy, so this remains a layout-cleanup slice rather than a new backend capability slice.
- Verified the slice with `npm run build` and `cargo check --manifest-path desktop/src-tauri/Cargo.toml`.

## Next likely task

- Continue issue `#22` with the next behavior slice: drag-and-drop or multi-file selection ergonomics, while preserving the new file-list-plus-large-preview layout.

## Iteration 50 (issue #22 bug-fix follow-up)

- Investigated a real-user failure on `/home/eran/pictures/mock_transcripts` where PDF originals showed `Original preview unavailable` and the redacted output still exposed transcript PII.
- Confirmed this was two problems: the desktop preview path was bypassing the existing PDF extraction boundary, and the redaction policy did not yet cover flattened transcript-style labeled fields.
- Kept the preview fix local to `src/desktop.rs` rather than widening the high-risk shared loader: desktop previews now reuse the same PDF/DOCX extraction path when building original previews.
- Added deterministic transcript-style labeled-field redaction for flattened extracted text, covering fields such as `School`, `School Address`, `Student`, `Street Address`, `City/State/Zip`, `Phone`, `Date of Birth`, `Place of Birth`, and `Certified By`.
- Verified the fix with `cargo fmt --check`, `cargo test`, `cargo check --manifest-path desktop/src-tauri/Cargo.toml`, and a real rerun against the user-reported `mock_transcripts` directory, which now rewrites those transcript fields in the output.

## Next likely task

- If broader transcript de-identification is needed, continue with the next bounded policy slice: transcript-wide date and person-name coverage beyond the explicitly labeled fields, while keeping false positives controlled.
