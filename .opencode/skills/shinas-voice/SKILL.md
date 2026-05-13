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

## Precondition for Use

Use this skill **only after** the upstream history draft is already structurally
and doctrinally correct.

If the draft still needs changes to:

- concern hierarchy
- inclusion/exclusion decisions
- chronology
- section placement
- section ontology
- family-history privacy handling
- diagnosis boundaries

stop and escalate upstream instead of trying to repair those issues here.

This skill should not be asked to decide what belongs in the report. It should
only improve how an already-correct draft sounds.

## What This Skill Does

- rewrites diction to match the extracted clinician lexicon
- adjusts sentence shape and cadence to match the corpus
- adjusts paragraph rhythm and transitions to match the corpus
- applies section-specific stylistic overlays when supported by evidence
- preserves clinically necessary attribution and uncertainty
- performs a final self-audit for style-transfer drift

## What This Skill Does Not Do

- add facts
- add diagnoses
- add interpretation not already present
- remove attribution required for honesty
- remove uncertainty or caveats
- change age branch or section ontology
- flatten source conflicts into false consensus
- move content between sections
- change chronology
- change concern hierarchy
- broaden or narrow concern labels
- add or remove examples

## Required Inputs

- the source draft to be restyled
- the applicable age branch and section ontology
- confirmation that the draft has already passed upstream doctrine review
- any constraints on how much restructuring is allowed

## Hard Preservation Contract

Always preserve:

- factual content
- source attribution
- uncertainty markers
- diagnosis boundaries
- paragraph-level meaning
- section-level purpose
- age branch
- section order
- subsection order
- chronology
- concern hierarchy
- concern labels and their specificity
- inclusion/exclusion boundaries
- examples and example density
- family-history privacy boundaries

If a stylistic transformation would weaken any of the above, do not make it.

## Global Voice Characteristics

Default tendencies in this voice:

- polished clinical register with moderate formality
- heavy preference for `described`, `reported`, `endorsed`, and `denied`
- frequent topic-first sentences followed by concrete elaboration
- regular use of transitional openers such as `Currently,`, `Specifically,`,
  `Regarding ...`, `In addition,`, `Per self-report,`, and `Per parent report,`
- medium-to-long sentences with controlled subordination
- frequent parenthetical clarifiers when the underlying draft already supports
  them
- explicit functional-impact language only when the underlying draft already
  contains that impact

## Application Workflow

1. identify the section type and age branch
2. read the draft for meaning, attribution, chronology, and uncertainty
   boundaries
3. apply global voice rules
4. apply section-specific overlay rules if available
5. smooth cadence and transitions **without changing structure or substance**
6. run the self-audit before finalizing

## Allowed Transformations

- substitute corpus-preferred attribution verbs
- smooth casual phrasing into the extracted clinical register
- split or combine sentences to match corpus cadence when chronology and meaning
  are preserved
- adjust paragraph openings and closings to match corpus patterns
- reduce awkward repetition when the corpus shows a cleaner alternative and no
  content is lost
- improve transitions and sentence flow

When in doubt between smoother voice and stricter preservation, choose
preservation.

## Forbidden Transformations

- changing the referral concern list
- converting secondary concerns into main concerns
- broadening or narrowing labels such as `writing` vs `handwriting`
- moving content between sections
- altering chronology
- changing subsection ordering
- replacing concrete details with vaguer shorthand
- changing negative-history substance
- introducing institution names
- introducing new examples
- deleting existing examples that are carrying content
- converting reported symptoms into conclusions
- intensifying certainty
- deleting caveats
- making collateral information sound like direct self-report
- making self-report sound like objective finding
- importing diagnostic language from exemplar reports into unsupported sections

## Section Overlays

Apply only the overlays supported by the corpus artifacts **and only within the
boundaries of the already-correct draft**.

### Adult Reason for Referral

- use the opening template: age, handedness, gender, outpatient neuropsych
  framing, and main concern cluster
- prefer `in the context of ...` to introduce concern clusters
- adult reports usually use `CLIENT is a ...`
- end with the standard purpose sentence when the draft already uses it

### Adult Presenting Complaints/Symptoms

- open with `CLIENT endorsed ...` or `CLIENT endorsed notable ...` only when the
  source draft already supports that framing
- use `Specifically,`, `Currently,`, `In addition,`, and `Regarding ...` to
  improve flow when needed

### Child Reason for Referral

- preserve the child's referral template exactly as established upstream
- do not alter the concern count, order, specificity, or omission choices
- do not expand the concerns with examples or downstream detail during the voice
  pass.

### Adult Reason for Referral

- keep the referral paragraph concise
- do not expand concerns with examples, symptom lists, or downstream detail
  during the voice pass.

### Child Relevant History Structure

- preserve the upstream child section and subsection structure exactly
- do not rename or reorder subsections unless explicitly instructed upstream

### Relevant History Sections

- prefer polished declarative openings when they do not alter substance
- preserve attribution boundaries
- smooth transitions between chronology, examples, and current impact

### Previous Evaluations

- keep brief
- smooth to concise clinical diction without changing what evaluation information
  is included or omitted

## Self-Audit Checklist

Before returning the revised draft, verify:

- facts unchanged
- attribution unchanged or improved
- uncertainty preserved
- no diagnosis leakage introduced
- no new interpretation introduced
- adult/child structure preserved
- concern hierarchy preserved
- chronology preserved
- section placement preserved
- no institution names introduced
- style changes supported by the corpus artifacts

## Escalation Rule

If the requested rewrite would require changing substance rather than style,
stop and say so explicitly.

When uncertain, leave the upstream wording alone rather than making a smoother
change that risks altering meaning.

Base directory for this skill: file:///home/eran/code/tns/.opencode/skills/shinas-voice
