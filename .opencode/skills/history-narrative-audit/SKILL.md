---
name: history-narrative-audit
description: >-
  Audits drafted neuropsych history sections for interpretive drift, diagnosis
  leakage, source-attribution problems, section-placement errors, and intake-note
  style.
---

# History Narrative Audit

Use this skill after drafting a neuropsych history narrative with
`neuropsych-history-report`.

Its job is to review the draft for **honesty, placement, restraint, and polish**.

## Purpose

This skill checks whether the draft still obeys the core doctrine:

- history-writing, not interpretation
- diagnosis restraint
- correct adult/child structure
- adequate but not excessive examples
- source attribution where needed
- polished clinical narrative rather than intake-note dump

## What To Audit

Audit at three levels:

1. **global structure**
2. **section integrity**
3. **sentence/paragraph language**

## Global Structure Audit

### Age/Structure Check

Confirm that:

- under 18 cases use the child structure
- 18 and older cases use the adult structure
- no draft proceeds on an unclear age case

### Adult Structure Check

For adult cases, confirm that:

- Reason for Referral is present
- Presenting Complaints/Symptoms is present
- Presenting Complaints/Symptoms expands the same concerns named in Reason for
  Referral
- those concerns appear in the **same order**
- Reason for Referral stays concise rather than expanding concerns with examples,
  symptom lists, or downstream detail

### Child Structure Check

For child cases, confirm that:

- no separate Presenting Complaints/Symptoms section was created
- the main concerns from Reason for Referral were distributed into the relevant
  history sections
- `Social History` is separate from `Behavioral/Emotional History`
- in child cases, `Behavioral/Emotional History` should usually be one
  integrated section rather than two artificially split sections
- Reason for Referral stays concise rather than expanding concerns with examples,
  symptom lists, or later-section detail
- Educational History names the child's current school placement when that
  information was reported

## Section Integrity Audit

For each section, ask:

1. Is the main point clear?
2. Is the content in the correct section?
3. Is there enough support to make the point credible?
4. Are there too many examples or too few?
5. Is attribution needed and missing?
6. Is any sentence interpretive rather than report-based?
7. Does it still sound like intake notes?
8. Is Reason for Referral doing more than brief identification + onset/scope +
   closing sentence?
9. For child psychosocial sections, is there enough developmental/history
   content rather than only current symptoms?

## Language Audit Rules

### Interpretive Drift

Flag language that:

- explains rather than reports
- implies causation not stated in the source
- interprets patterns beyond what was documented
- upgrades suggestive history into conclusions

### Diagnosis Leakage

Flag any diagnosis that is not explicitly documented in the source material.

Also flag soft leakage, such as:

- diagnostic shorthand used as if established fact
- syndrome labels implied through confident paraphrase
- section headings or transitions that smuggle in interpretation

### Attribution Gaps

Flag missing attribution when:

- the information came from someone other than the client
- sources differed
- the statement would sound too strong without attribution
- the source itself matters to how the reader should weigh the statement

### Intake-Note Style Drift

Flag prose that is:

- list-like
- choppy
- questionnaire-ordered
- repetitive
- overloaded with low-yield raw details
- too reliant on raw patient wording without translation into clinical language

### Example Density Problems

Flag when:

- important patterns have no concrete example
- a section contains so many examples that the main point gets buried
- adult Presenting Complaints/Symptoms is underdeveloped relative to the referral
  concerns
- child Social History or Behavioral/Emotional History is so sparse that a major
  concern named in referral is effectively undocumented there

## Placement Audit Rules

Flag content placed in the wrong section, such as:

- school social issues left in Educational History when they belong in Social History
- school-based emotional/behavioral concerns left in Educational History when
  they belong in Behavioral/Emotional History
- child concerns forced into a Presenting Complaints section
- family diagnoses linked to named relatives rather than summarized more
  privately

Also flag Educational History when it skips current placement orientation despite
reported information about grade, public/private school setting, or
general/special education placement.

## Developmental / Medical Coherence Audit

Flag contradictions such as:

- toileting described as fully within normal limits while nocturnal enuresis is
  also reported without qualification
- primarily developmental concerns fragmented across sections instead of kept
  together with only a brief medical reference
- sleep described vaguely (e.g. `sleep is unremarkable`) when clearer phrasing or
  sleep duration was available

## Family History Specificity Audit

Flag when:

- documented diagnosis names were weakened into vague labels such as `attention
  problems`
- a supported diagnosis was omitted from the immediate or extended family bucket
- family-history rendering loses diagnostic specificity that was available in the
  source material

## Consistency Audit Rules

Confirm that:

- Reason for Referral concerns are carried through the report
- no major concern is introduced and then dropped
- no new unsupported major concern appears later
- later concerns are framed either as major concerns or as secondary features
  tied to an existing concern
- section emphasis matches the referral question and reported impairment

## Previous Evaluations / Not Reported Audit

Check that `not reported` is used selectively rather than mechanically.

It is most appropriate when the reader would reasonably expect the information,
such as in:

- Previous Evaluations
- Family History
- Medical/Developmental History
- treatment history
- safety history

## Audit Output Format

Prefer concise issue lists grouped by severity:

- **must fix**: unsupported diagnosis, interpretive claim, wrong age structure,
  missing required adult ordering, major attribution failure
- **should fix**: poor section placement, weak example density, repetitive prose,
  privacy wording issues
- **polish**: phrasing improvements, smoothing, compression, tone cleanup

For each flagged issue, state:

1. where it appears
2. what rule it violates
3. how to revise it without adding new facts

## Final Pass Questions

Ask:

- Does this sound like a polished clinical history narrative?
- Does it remain source-grounded and non-interpretive?
- Would a broad professional audience understand it clearly?
- Is it privacy-conscious enough for possible family/school sharing?
- Does every major paragraph feel intentional rather than copied from intake?

## Review Checklist

- Is the adult/child branch correct?
- Is adult Presenting Complaints/Symptoms present only when appropriate?
- Does adult concern ordering match Reason for Referral?
- Were child concerns distributed correctly into history sections?
- Were child concerns distributed correctly into Social, Behavioral/Emotional,
  and Educational domains rather than being over-concentrated in Educational
  History?
- Does child Educational History identify current grade and school/classroom
  placement when reported?
- Is interpretive language absent?
- Are diagnoses limited to explicitly documented diagnoses?
- Are attribution gaps identified?
- Is family-history phrasing privacy-conscious?
- Are examples balanced and functional?
- Does the draft read like polished report prose rather than intake notes?

Base directory for this skill: file:///home/eran/code/tns/.opencode/skills/history-narrative-audit
