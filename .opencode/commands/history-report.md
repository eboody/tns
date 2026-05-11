---
description: Generate a neuropsych history draft from an intake-documents directory
---

Generate the neuropsychological history section for the intake-documents directory at `$ARGUMENTS`.

Treat this as a staged history-writing workflow, not an interpretation task.

Required workflow:

1. Load and follow these repo-local skills in order:
   - `history-evidence-normalization`
   - `neuropsych-history-report`
   - `history-narrative-audit`
2. Use `$ARGUMENTS` as the explicit source directory.
3. Determine whether the case is child or adult from the source documents.
   - under 18 = child
   - 18 and older = adult
   - if age is unclear, stop and report that ambiguity
4. Normalize the source material into section-relevant evidence before drafting.
5. Build a section-by-section content plan before writing polished prose.
6. Draft the history section using only reported information from the source documents.
   - do not interpret
   - do not infer diagnoses
   - do not name diagnoses unless explicitly documented in the sources
   - identify sources when needed
7. Audit the draft for:
   - adult/child structure correctness
   - attribution gaps
   - diagnosis leakage
   - interpretive drift
   - misplaced content
   - repetition
   - intake-note style drift
8. Revise the draft if needed to satisfy the audit.

Output requirements:

- Show the determined age branch and the source used to determine it.
- Show the final section outline used.
- Provide the final history draft.
- Provide a concise audit summary with any remaining caveats.
- Preserve an internal paragraph-level source map while drafting, but do not dump the full raw source text unless needed.

If the source directory is missing, unreadable, or does not contain enough material to draft the history section honestly, stop and explain exactly what is missing.
