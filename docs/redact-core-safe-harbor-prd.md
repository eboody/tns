## Problem Statement

The current de-identification effort is heading toward a hand-rolled replacement engine, but the real user need is broader and stricter: a self-contained Rust program that someone can run on a directory of source documents and have it emit de-identified Markdown documents aligned to the HIPAA Safe Harbor standard, without using AI at all. The program must not merely replace a few observed names or patterns; it must provide an honest, deterministic de-identification workflow that captures the identifiers that can be handled mechanically, surfaces what cannot be guaranteed by rules alone, and preserves auditability.

## Solution

Build a self-contained Rust CLI that converts supported source documents into Markdown and applies a Safe Harbor-oriented deterministic de-identification policy. The core detection/anonymization engine should pivot to `redact-core` for structured identifiers such as emails, phone numbers, SSNs, URLs, IP addresses, and other built-in pattern-based entities. Around that engine, add a project-specific policy layer that maps detections to Safe Harbor obligations, supplements coverage with configured known-entity replacement for names and known locations, adds custom recognizers for Safe Harbor gaps, omits or flags non-text artifacts such as embedded images, and emits both de-identified Markdown outputs and review/audit artifacts.

## User Stories

1. As a clinician, I want to run one command on a directory of raw documents, so that I receive a parallel directory of de-identified Markdown outputs.
2. As a clinician, I want the program to remain fully local and self-contained, so that sensitive records never leave my machine.
3. As a clinician, I want the tool to avoid AI entirely, so that its behavior remains deterministic and explainable.
4. As a clinician, I want structured identifiers such as emails, phone numbers, SSNs, URLs, and IP addresses to be detected by a mature library instead of ad hoc regexes, so that the system stands on a stronger foundation.
5. As a clinician, I want the system to preserve a Safe Harbor framing rather than a generic PII framing, so that the output aligns with the actual compliance target.
6. As a clinician, I want names of the client, relatives, providers, schools, clinics, and other known entities to be configurable, so that the tool can deterministically remove identities that non-AI pattern matching cannot infer reliably.
7. As a clinician, I want a review artifact that tells me what the tool redacted and what still may need human review, so that I do not over-trust deterministic automation.
8. As a clinician, I want dates to be transformed according to Safe Harbor rules, so that month/day detail is removed rather than merely replaced inconsistently.
9. As a clinician, I want ages over 89 treated according to Safe Harbor requirements, so that the output does not leak a highly identifying age.
10. As a clinician, I want address-like and location-like information below the state level handled explicitly, so that local geography is not accidentally retained.
11. As a clinician, I want embedded images or non-text content omitted or flagged, so that a Markdown export does not quietly preserve full-face photos or comparable identifiers.
12. As a clinician, I want unsupported or low-confidence inputs surfaced clearly, so that I know when the tool cannot make a Safe Harbor-quality promise.
13. As a clinician, I want dry-run and review modes, so that I can inspect planned redactions before writing final outputs.
14. As a clinician, I want audit artifacts for written outputs, so that I can verify how replacements occurred.
15. As a clinician, I want include/exclude directory controls, so that I can avoid processing files that should not be touched.
16. As a clinician, I want the output format to be Markdown, so that downstream manual review and editing stay lightweight.
17. As a developer, I want `redact-core` to own the structured-identifier core, so that we avoid re-implementing a large pattern-recognition surface unnecessarily.
18. As a developer, I want a Safe Harbor policy layer on top of `redact-core`, so that the product expresses HIPAA-specific behavior rather than raw library defaults.
19. As a developer, I want custom recognizers only where the crate leaves clear Safe Harbor gaps, so that the codebase stays small and honest.
20. As a developer, I want the Markdown extraction layer separated from the de-identification engine, so that document-format handling and redaction policy evolve independently.
21. As a developer, I want review output to explicitly distinguish library-detected entities from configured replacements and custom gap recognizers, so that the operator understands coverage boundaries.
22. As a future maintainer, I want a coverage matrix for all 18 Safe Harbor identifiers, so that scope and limitations remain explicit.
23. As a future maintainer, I want deterministic tests around Safe Harbor policy behavior, so that library integration changes do not silently erode coverage.
24. As a compliance-conscious operator, I want the tool to avoid claiming universal Safe Harbor success where deterministic rules cannot honestly guarantee it, so that the program remains trustworthy.

## Implementation Decisions

- The de-identification core should pivot from a homegrown rule engine to `redact-core` for structured identifier detection and anonymization.
- The CLI should remain self-contained and local, but its internal architecture should separate:
  - document extraction to Markdown,
  - `redact-core`-driven structured identifier detection,
  - configured known-entity replacement,
  - custom Safe Harbor gap recognizers,
  - Safe Harbor policy mapping and replacement decisions,
  - audit/review/report generation.
- The system should treat `redact-core` as a foundation, not a complete Safe Harbor solution.
- Safe Harbor coverage must be modeled explicitly as a policy matrix, not inferred from library marketing language.
- Built-in `redact-core` entity types should be mapped to Safe Harbor identifiers where coverage is strong enough (for example email, phone, SSN, IP, URL, some record/account-like patterns).
- Names, many geographic identifiers, and other contextual identifiers must still be handled with deterministic config-driven replacement and review flows because no-AI operation excludes dependable generic NER use.
- The output contract should be Markdown-first: supported inputs are converted into de-identified Markdown plus supporting artifacts rather than rewritten into their original formats.
- Embedded images and non-text artifacts should be omitted or explicitly represented in Markdown output rather than silently preserved.
- The program should distinguish among:
  - fully automated structured detections,
  - configured deterministic replacements,
  - custom recognizer hits,
  - review-required residuals.
- The batch processor should report processed, skipped, unsupported, and review-sensitive files clearly at the run level.

## Testing Decisions

- Good tests should verify external Safe Harbor-oriented behavior, not internal detector implementation details.
- The most important tests should cover:
  - `redact-core` integration for built-in structured identifiers,
  - configured known-entity replacement,
  - Safe Harbor date/age policy behavior,
  - custom gap recognizers,
  - Markdown extraction and image omission policy,
  - run-level reporting for processed/skipped/unsupported/review-required files.
- Coverage should be organized around fixtures that demonstrate Safe Harbor categories, not only raw detector unit cases.
- Regression tests should assert both de-identified Markdown output and review/audit artifacts.
- Tests should explicitly validate that the program does not claim success silently when an input falls outside supported or confidently handled scope.

## Out of Scope

- AI-based named entity recognition
- cloud-hosted processing
- guaranteeing zero human review for all free-text Safe Harbor cases
- preserving original binary document layout as the primary output contract
- image recognition or biometric analysis beyond omission/flagging policy in extraction
- legal certification that deterministic outputs alone satisfy every compliance context without operator review

## Further Notes

- The core class of problem is Safe Harbor-oriented directory de-identification to Markdown, not just generic regex replacement.
- `redact-core` reduces wheel reinvention for structured identifiers, but the product still needs a strong outer policy layer.
- The most important thing to stay honest about is residual risk: the tool should produce review artifacts where deterministic non-AI coverage cannot be guaranteed.
