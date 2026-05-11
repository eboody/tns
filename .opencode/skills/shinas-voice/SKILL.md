---
name: shinas-voice
description: >-
  Applies the extracted neuropsych report-writing voice of Shina Halavi to an
  existing draft while preserving facts, attribution, uncertainty, age branch,
  and section meaning.
---

# Shina Halavi Voice

Use this skill to apply the extracted writing voice of **Shina Halavi** to an
already drafted neuropsychological report or report section.

This is a **style-transfer process, not a content-generation process**.

The governing rule is:

> Preserve what the draft says while changing how it says it, using only
> corpus-supported stylistic transformations.

## Corpus Scope

This skill was derived from **8 deidentified neuropsychological reports**:

- 5 adult reports under `docs/5 deidentified reports/`
- 3 child reports under `/home/eran/documents/Shina/`

High-confidence coverage:

- adult Reason for Referral
- child Reason for Referral
- adult Presenting Complaints/Symptoms
- child Relevant History structure
- Relevant History sections across both age branches
- Previous Evaluations

Lower-confidence coverage:

- sections not well represented in the extracted corpus slice
- highly interpretive sections outside the referral/history surface

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
- first-reference acronym/initialism expansions
- paragraph-level meaning
- section-level purpose
- age branch

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

## Global Voice Characteristics

Default tendencies in this voice:

- polished clinical register with moderate formality
- heavy preference for `described`, `reported`, `endorsed`, and `denied`
- frequent topic-first sentences followed by concrete elaboration
- regular use of transitional openers such as `Currently,`, `Specifically,`,
  `Regarding ...`, `In addition,`, `Per self-report,`, and `Per parent report,`
- medium-to-long sentences with controlled subordination
- frequent parenthetical clarifiers and examples
- explicit functional-impact language

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
- expand an acronym or initialism on first reference as `full term (ACRONYM)`
  when the expansion is already present in the draft, source-supported, or
  clinically standard and unambiguous in context
- reorder sentences within a paragraph when meaning and chronology are preserved
- split or combine sentences to match corpus cadence
- adjust paragraph openings and closings to match corpus patterns
- reduce awkward repetition when the corpus shows a cleaner alternative
- introduce explicit functional-impact phrasing when the underlying impact is
  already present in the draft

## Forbidden Transformations

- introducing new examples
- converting reported symptoms into conclusions
- intensifying certainty
- deleting caveats
- introducing guessed or source-unsupported acronym/initialism expansions
- collapsing a first-reference full term plus acronym into an unexplained acronym
- making collateral information sound like direct self-report
- making self-report sound like objective finding
- importing diagnostic language from exemplar reports into unsupported sections

## Section Overlays

Apply only the overlays supported by the generated corpus artifacts.

### Adult Reason for Referral

- Use the opening template: age, handedness, gender, outpatient neuropsych
  framing, and main concern cluster.
- Prefer `in the context of ...` to introduce concern clusters.
- Adult reports usually use `CLIENT is a ...`
- End with the standard purpose sentence when the report format allows it.

### Adult Presenting Complaints/Symptoms

- Open with `CLIENT endorsed ...` or `CLIENT endorsed notable ...`
- Expand concern clusters through grouped detail paragraphs.
- Use `Specifically,`, `Currently,`, `In addition,`, and `Regarding ...` to
  move through subdomains.
- Close clusters with functional consequences when present.

### Child Reason for Referral

- Use the child's full name directly rather than `CLIENT`.
- Include age in years and months.
- Keep the concern cluster in the referral paragraph.
- Do not create a separate Presenting Complaints/Symptoms section unless the
  base report structure explicitly has one.

### Child Relevant History Structure

- Prefer subsections such as `Birth/Developmental History`, `Medical History`,
  `Family History`, `Behavioral/Emotional/Social History` or
  `Social/Behavioral/Emotional History`, and `Educational History`.
- Within child social/behavioral sections, mini-subheaders like `Social`,
  `Behavioral`, and `Emotional` are common.
- Parent, teacher, tutor, and self-report are often braided together explicitly.

### Relevant History Sections

- Prefer declarative openings such as `Medical and developmental history are
  unremarkable` or `Medical history is remarkable for ...`
- Use `Per self-report` / `Per mother report` / `Per parent report` /
  `Per psychiatrist report` when the source matters.
- In Family History, move through geography/living context before family-history
  summary when those facts are available.
- In child reports, explicit collateral-source framing is especially common.

### Previous Evaluations

- Keep brief.
- Lead with whether prior psychological or neuropsychological evaluation
  occurred.
- If present, summarize evaluator, date, purpose, and very brief takeaway.

## Self-Audit Checklist

Before returning the revised draft, verify:

- facts unchanged
- attribution unchanged or improved
- uncertainty preserved
- first-reference acronym/initialism expansions preserved or added only when
  source-supported and unambiguous
- no diagnosis leakage introduced
- no new interpretation introduced
- adult/child structure preserved
- style changes supported by the corpus artifacts

## Escalation Rule

If the requested rewrite would require changing substance rather than style,
stop and say so explicitly.
