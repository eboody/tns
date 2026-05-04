---
name: longitudinal-history-report
description: >-
  Generates a longitudinal history report from a directory of mixed clinical,
  intake, referral, and academic records using a staged artifact-first workflow
  designed for context discipline, evidence traceability, and 2026-report-style
  synthesis quality.
---

# Longitudinal History Report

Use this skill when you need to generate a high-depth history report from a
directory of source documents without collapsing everything into one fragile
prompt.

This skill is specialized for **longitudinal history-report generation from
mixed clinical, intake, referral, and academic sources**. It is **not** a
general folder summarizer.

## Summary

This skill treats report generation as a staged synthesis problem:

1. discover and classify candidate sources
2. admit only relevant evidence
3. extract normalized per-document evidence sheets
4. derive cross-document synthesis artifacts
5. derive an approved section-level claim bank
6. render the report in constrained clinician-native prose
7. audit quality, provenance, and sentence traceability
8. optionally promote the draft to approved/latest

The core context-management rule is:

> **The final report must be drafted from curated artifacts, not from the raw
> source directory, except for targeted ambiguity resolution.**

## Design Commitments

- Use a **stable case workspace** with **versioned run artifacts**.
- Require an **explicit source directory path**; current working directory is
  only a fallback convenience.
- Treat the style target (for example `2026-report.md`) as a **style and
  structure exemplar only**, never as factual evidence for a new case.
- Use a **deterministic inclusion policy** with optional user override.
- Use **strict schemas** for intermediate artifacts.
- Apply an explicit **source reliability hierarchy**.
- Produce **cross-document synthesis artifacts before drafting**.
- Separate **truth-generation** from **voice-generation**.
- Require an explicit **approved claim bank** before polished drafting.
- Use a **style contract** to target clinician-native tone without importing facts
  from exemplars.
- Make the polished report **reader-aware**, selecting only the depth a likely
  clinician/family/referral reader would need rather than dumping every
  admissible fact.
- Keep the final report readable, with a separate **paragraph-level provenance
  map**.
- Require **sentence-level traceability** for the polished draft.
- Use an exemplar-derived **report polish guide** for tone, detail selection,
  and section shaping when such exemplar use is permitted.
- Use **minimal retention** of sensitive source text in intermediate artifacts.
- Support **incremental reuse** via source fingerprinting.
- Mark thinly supported sections as **limited by available records**.
- Allow **bounded interpretive synthesis** only when evidence-grounded.

## When To Use

Use this skill when:

- the corpus contains multiple clinical/history/intake/referral/academic files
- the final output must be deeper than a single-source summary
- evidence quality, chronology, and contradictions need reconciliation
- context window pressure would make one-shot synthesis brittle

Do not use this skill for:

- simple folder summaries
- single-document extraction
- diagnosis generation unsupported by the record
- cases where the source corpus is mostly unreadable binaries and no text/OCR
  companion artifacts are available

## Source Admission Rules

Default inclusion policy:

- include: clinical intake/history, clinician notes, referral materials,
  questionnaires, and academic records relevant to chronology or functioning
- exclude: prior generated reports, workspace artifacts, scratch notes, and
  obvious administrative noise unless explicitly approved

When both original binaries and readable derivative markdown/text artifacts
exist, prefer the readable derivative as the working source and record the
relationship in the inventory.

## Source Reliability Hierarchy

Use this hierarchy when reconciling facts:

1. clinician-authored syntheses and contemporaneous intake/questionnaire
   materials for symptom characterization and developmental narrative
2. referral materials for evaluation rationale and prior diagnostic framing
3. academic records for dates, grades, school chronology, and intervention
   history
4. OCR-derived artifacts as lower-confidence text sources unless corroborated

Never flatten source types into an undifferentiated pool.

## Age-Dependent Report Ontology

Do **not** use a single fixed history structure for every case. Select the
history/intake ontology based on the client’s age group.

### Adult Ontology (`>18`)

- Presenting Information / Reason for Referral
  - Reason for Referral
  - Presenting Complaints / Symptoms
- Relevant History
  - Developmental and Medical History
  - Family History
  - Psychosocial History
  - Educational and Occupational History
  - Previous Evaluations

### Child Ontology (`<=18`)

- Presenting Information / Reason for Referral
- Relevant History
  - Birth / Developmental History
  - Medical History
  - Family History
  - Behavioral / Emotional / Social History
    - Behavioral / Emotional
    - Social
  - Educational History
  - Previous Evaluations

Rules:

- determine the ontology from the client’s age in the admitted record
- if age is uncertain, stop and surface the ambiguity rather than guessing
- do not force adult section names onto child cases or child section names onto
  adult cases
- keep top-level structure stable within the selected ontology
- you may add narrowly justified subsections only when the corpus truly demands
  them, but do not invent new top-level structure casually

## Required Artifact Set

Each run should generate a complete artifact set:

- `00-brief/report-brief.md`
- `01-inventory/source-inventory.md`
- `01-inventory/inclusion-log.md`
- `01-inventory/source-fingerprints.json`
- `02-evidence/*.md` per admitted source
- `03-derived/academic-summary.md`
- `03-derived/developmental-timeline.md`
- `03-derived/symptom-matrix.md`
- `03-derived/contradictions-confidence-memo.md`
- `03-derived/insights.md`
- `03-derived/section-claim-bank.md`
- `03-derived/style-contract.md`
- `04-draft/final-history-report.factual.md`
- `04-draft/final-history-report.draft.md`
- `04-draft/provenance-map.md`
- `05-audit/self-audit.md`
- `05-audit/sentence-traceability-check.md`
- `05-audit/run-summary.md`

Stable case workspace layout:

```text
.opencode-work/history-report/<case-id>/
  approved/
    latest.md
    latest.provenance.md
  runs/
    <run-id>/
      00-brief/
      01-inventory/
      02-evidence/
      03-derived/
      04-draft/
      05-audit/
```

## Stage Protocol

Follow this protocol exactly.

### Stage 0: Initialize workspace

Inputs:

- explicit source directory
- optional case id override
- optional style exemplar path

Actions:

- derive deterministic case id from source directory unless overridden
- create stable case workspace and versioned run workspace
- write the report brief from template
- determine the expected ontology variant (`adult` or `child`) as soon as age is
  known from admitted sources and record it in the brief

Helper:

```bash
python3 ".opencode/skills/longitudinal-history-report/scripts/init_history_report_run.py" --source-dir "/absolute/source/dir"
```

Outputs:

- initialized run directories
- templated artifact files

### Stage 1: Discover and classify sources

Inputs:

- source directory

Actions:

- inventory candidate files
- classify each by source type, likely role, readability, and relevance
- note original/derivative relationships when both exist

Outputs:

- `01-inventory/source-inventory.md`

### Stage 2: Admit or exclude sources

Actions:

- apply deterministic inclusion policy
- log exclusions with reasons
- stop for override only when relevance is genuinely ambiguous

Outputs:

- `01-inventory/inclusion-log.md`

### Stage 3: Fingerprint admitted sources

Actions:

- compute path, size, modified time, sha256 for each admitted source
- use the manifest for incremental reuse decisions

Helper:

```bash
python3 ".opencode/skills/longitudinal-history-report/scripts/fingerprint_sources.py" \
  --output "/path/to/01-inventory/source-fingerprints.json" \
  "/path/to/source-a.md" "/path/to/source-b.md"
```

Outputs:

- `01-inventory/source-fingerprints.json`

### Stage 4: Create per-document evidence sheets

Actions:

- use one evidence sheet per admitted source
- follow the evidence sheet template strictly
- normalize facts by domain
- preserve only short quotes when necessary
- explicitly note ambiguities and contradictions

Important:

- do not write loose summaries
- academic records should be distilled into chronology/performance facts, not
  carried forward as raw course listings

Outputs:

- `02-evidence/*.md`

### Stage 5: Derive cross-document synthesis artifacts

Actions:

- generate academic summary
- generate developmental timeline
- generate symptom-by-domain matrix
- generate contradictions/confidence memo
- generate pre-draft insights artifact
- generate section-level claim bank
- generate style contract for the final prose pass

Outputs:

- `03-derived/*`

### Stage 6: Draft final report

Actions:

- draft from artifacts only
- use raw sources only for targeted dispute resolution or missing provenance
- write into the selected age-appropriate report ontology
- make evidence limits explicit where support is thin
- allow bounded interpretation only if present in the insights artifact
- draft first into a **factual report skeleton** using only approved claims and
  approved examples
- rewrite the factual report into polished outpatient
  neuropsychological-history prose using the style contract
- during rewrite, do **not** add any new claims, examples, diagnoses, causal
  theories, or source attributions not already approved in the claim bank
- ensure each substantive paragraph follows this shape when the evidence allows:
  clinical pattern -> developmental/time anchor -> concrete examples -> current
  functional impact -> bounded interpretation

Outputs:

- `04-draft/final-history-report.factual.md`
- `04-draft/final-history-report.draft.md`
- `04-draft/provenance-map.md`

### Stage 7: Self-audit

Audit rubric:

- coverage of the selected age-appropriate report ontology
- cross-source integration depth
- developmental continuity over time
- evidence traceability
- contradiction handling
- absence of unsupported speculation
- whether each substantive paragraph says more than any one source alone
- sentence-by-sentence traceability of the polished draft back to the approved
  claim bank

Outputs:

- `05-audit/self-audit.md`
- `05-audit/sentence-traceability-check.md`
- `05-audit/run-summary.md`

### Stage 8: Promote or leave as draft

Rules:

- generation and promotion are separate
- the stable approved output must update only when the user explicitly approves
  promotion
- preserve versioned drafts even after promotion

Outputs:

- optional update to `approved/latest.md`
- optional update to `approved/latest.provenance.md`

## Artifact Authoring Rules

### Evidence Sheet Rules

- one source per file
- facts grouped by domain, not by source order
- preserve direct quotes only when wording matters
- include confidence and contradiction notes

### Insights Rules

- insights must be evidence-grounded
- allowed: recurring patterns, developmental continuities, functional
  interactions
- forbidden: novel diagnosis, unsupported causal claims, speculative certainty

### Section Claim Bank Rules

- one section-oriented claim cluster per final report subsection in the selected
  ontology
- each claim must include: confidence, support, allowed examples, forbidden
  leaps, and preferred clinical framing
- only claims and examples listed as approved may appear in the polished draft
- contradictions must be reconciled here or explicitly carried as a limit into
  the final draft

### Style Contract Rules

- target genre is polished outpatient neuropsychological report prose, not AI
  meta-summary prose
- exemplar files may shape voice and structure only; they must never contribute
  facts
- prefer formulations like `CLIENT described...`, `records indicate...`,
  `mother reported...` over workflow meta-language like `the admitted record
  supports...` unless evidentiary caution specifically requires it
- every substantive paragraph should be concrete, developmentally anchored, and
  functionally meaningful
- prefer clinician-native category labels over patient shorthand in polished
  prose when no meaning is lost; for example, prefer `rigid adherence to
  routines` or `rigid patterns of behavior` over quoting `just right` as the
  primary label
- family history should default to the level of detail a likely reader needs;
  prefer immediate/extended family summaries over relative-by-relative listings
  unless the extra specificity matters clinically
- where evidence is thin, qualify briefly and naturally rather than switching
  into process narration

### Final Drafting Rules

- do not draft the polished report directly from raw evidence sheets alone;
  draft it from the section claim bank and style contract
- produce a factual draft first, then a polished draft
- the polished draft may improve fluency, ordering, and sentence rhythm, but it
  may not add new content
- prefer concrete examples over abstract labels when approved evidence exists
- remove low-yield incidental details that do not materially affect
  interpretation, functioning, recommendations, or the reader's understanding of
  the pattern
- preserve diagnostic restraint even when the prose becomes more confident

### Provenance Rules

- default to paragraph-level provenance for the final report
- use finer-grained notes only for contradiction-sensitive paragraphs

### Traceability Audit Rules

- every substantive sentence in `04-draft/final-history-report.draft.md` must
  map to one or more approved claims or approved examples from
  `03-derived/section-claim-bank.md`
- the traceability check should flag any sentence that is stylistically fluent
  but not explicitly licensed by the claim bank
- if the polished draft introduces an unsupported sentence, revise the draft or
  expand the claim bank only if the evidence actually supports it

### Privacy Rules

- prefer normalized facts over copied passages
- retain only the minimum text needed for synthesis and auditability

## Incremental Reuse Rules

- reuse unchanged per-source evidence artifacts when fingerprints match
- regenerate downstream artifacts when any upstream dependency changes
- log what was reused and regenerated in the run summary
- when a fallback to raw sources is required, record it so upstream artifacts can
  be improved later

## Suggested Execution Flow For Agents

1. initialize the run workspace
2. write the report brief
3. inventory and classify the source directory
4. admit/exclude sources and fingerprint admitted ones
5. generate or reuse evidence sheets
6. generate or reuse derived synthesis artifacts, including section claim bank
   and style contract
7. draft factual report
8. rewrite to polished clinician-native report prose
9. build provenance map and sentence-traceability audit
10. self-audit
11. present draft plus run summary to user
12. promote only on explicit approval

## Bundled Resources

- `templates/report-brief.md`
- `templates/source-inventory.md`
- `templates/inclusion-log.md`
- `templates/evidence-sheet.md`
- `templates/academic-summary.md`
- `templates/developmental-timeline.md`
- `templates/symptom-matrix.md`
- `templates/contradictions-confidence-memo.md`
- `templates/insights.md`
- `templates/section-claim-bank.md`
- `templates/style-contract.md`
- `templates/final-history-report.md`
- `templates/final-history-report-factual.md`
- `templates/provenance-map.md`
- `templates/self-audit.md`
- `templates/sentence-traceability-check.md`
- `templates/run-summary.md`
- `reference/report-polish-guide.md`
- `scripts/init_history_report_run.py`
- `scripts/fingerprint_sources.py`

## Review Checklist

- Is the source directory explicit?
- Was the client age identified clearly enough to select the correct ontology?
- Was the case workspace initialized deterministically?
- Were irrelevant files excluded explicitly?
- Does every admitted source have a typed evidence sheet?
- Were academic records compressed into derived evidence rather than copied raw?
- Were contradictions surfaced rather than flattened?
- Was the correct adult vs child section structure used?
- Was a section-level claim bank created before polished drafting?
- Was the polished draft rendered from the claim bank and style contract rather
  than directly from raw sources?
- Was the final report written from artifacts rather than raw sources?
- Does every substantive sentence trace back to an approved claim or example?
- Does the provenance map support every substantive paragraph?
- Does the self-audit meaningfully critique the draft?
- Was promotion kept separate from generation?
