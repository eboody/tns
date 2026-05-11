---
name: <VOICE_NAME>
description: >-
  Applies the extracted report-writing voice of <CLINICIAN_NAME> to an existing
  draft while preserving facts, attribution, uncertainty, and section meaning.
---

# <CLINICIAN_NAME> Voice

Use this skill to apply the extracted writing voice of **<CLINICIAN_NAME>** to
an already drafted neuropsychological report or report section.

This is a **style-transfer process, not a content-generation process**.

The governing rule is:

> Preserve what the draft says while changing how it says it, using only
> corpus-supported stylistic transformations.

## What This Skill Does

- rewrites diction to match the extracted clinician lexicon
- adjusts sentence shape and cadence to match the corpus
- adjusts paragraph structure and transitions to match the corpus
- applies section-specific stylistic overlays when supported by evidence
- preserves clinically necessary attribution and uncertainty
- performs a final self-audit for style-transfer drift

## What This Skill Does Not Do

- add facts
- add diagnoses
- add interpretation not already present
- remove attribution required for honesty
- remove uncertainty or caveats
- change age branch or section ontology unless explicitly instructed
- flatten source conflicts into false consensus

## Required Inputs

- the source draft to be restyled
- the applicable age branch and section ontology
- any constraints on how much restructuring is allowed

## Hard Preservation Contract

Always preserve:

- factual content
- source attribution
- uncertainty markers
- diagnosis boundaries
- paragraph-level meaning
- section-level purpose

If a stylistic transformation would weaken any of the above, do not make it.

## Style Sources

This skill is derived from the corpus documented in:

- `style-guide.md`
- `style-rules.yaml`
- `evidence.md`

When these disagree, prefer:

1. `style-rules.yaml` for structured constraints
2. `style-guide.md` for narrative interpretation of the rules
3. `evidence.md` for resolving ambiguity conservatively

## Application Workflow

1. identify the section type and age branch
2. read the draft for meaning, attribution, and uncertainty boundaries
3. apply global voice rules
4. apply section-specific overlay rules if available
5. smooth cadence and transitions without changing meaning
6. run the self-audit before finalizing

## Allowed Transformations

- substitute corpus-preferred attribution verbs
- smooth casual phrasing into the extracted clinical register
- reorder sentences within a paragraph when meaning and chronology are preserved
- split or combine sentences to match corpus cadence
- adjust paragraph openings and closings to match corpus patterns
- reduce awkward repetition when the corpus shows a cleaner alternative

## Forbidden Transformations

- introducing new examples
- converting reported symptoms into conclusions
- intensifying certainty
- deleting caveats
- making collateral information sound like direct self-report
- making self-report sound like objective finding
- importing diagnostic language from exemplar reports into unsupported sections

## Section Overlays

Apply only the overlays supported by the generated corpus artifacts.

Possible overlays include:

- reason for referral
- presenting complaints/symptoms
- history sections
- previous evaluations
- impressions
- recommendations

If no overlay exists for a section, use only the global voice rules.

## Self-Audit Checklist

Before returning the revised draft, verify:

- facts unchanged
- attribution unchanged or improved
- uncertainty preserved
- no diagnosis leakage introduced
- no new interpretation introduced
- adult/child structure preserved
- style changes supported by the corpus artifacts

## Escalation Rule

If the requested rewrite would require changing substance rather than style,
stop and say so explicitly.
