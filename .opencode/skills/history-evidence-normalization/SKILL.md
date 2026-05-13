---
name: history-evidence-normalization
description: >-
  Normalizes intake, collateral, school, referral, medical, and prior-evaluation
  documents into source-grounded evidence for neuropsych history writing,
  preserving attribution, contradictions, and diagnosis restraint.
---

# History Evidence Normalization

Use this skill before drafting a neuropsych history narrative.

Its job is to prepare **admissible report evidence**, not to write final prose.

The governing rule is:

> Normalize what was reported, preserve who reported it, preserve when sources
> differ, and prepare paragraph-ready evidence without adding interpretation.

## Purpose

This skill handles the evidence-preparation layer for `neuropsych-history-report`.

Use it to:

- inventory and classify source documents
- decide what belongs in the history and what does not
- normalize facts into report-relevant domains
- preserve contradictions rather than flattening them
- flag attribution-sensitive statements
- prepare paragraph-level provenance inputs for later drafting

Do not use this skill to write the polished history section itself.

## Core Evidence Rules

### Reported Information Only

Only normalize information actually present in the source documents.

### No Interpretation

Do not infer causes, developmental meanings, diagnostic implications, or hidden
patterns.

### No Undocumented Diagnoses

Do not record a diagnosis as an established fact unless a formal diagnosis is
explicitly documented in the source material.

### Preserve Source Differences

If sources disagree, do not merge them into one synthetic statement that hides
the disagreement. Instead:

- record each position
- note the disagreement clearly
- indicate whether the conflict matters to later drafting

### Normalize, Don't Copy

Prefer short normalized fact statements over copied passages.

Keep direct quotes only when:

- the client's wording is clinically useful
- a source's exact phrasing materially changes the meaning
- the later report will benefit from the exact language

## Source Typing

For each source, identify:

- source type
  - intake form
  - parent questionnaire
  - teacher report
  - tutor input
  - clinician note
  - referral material
  - school record
  - prior evaluation
  - medical record
  - other collateral
- author/informant
- approximate date
- relevance to current history writing
- major domains covered
- whether the source is primary, collateral, record-based, or derivative/OCR

## Source Reliability Hierarchy

Use this hierarchy when weighing conflicting or overlapping history details:

1. direct clinician-authored or contemporaneous history materials for history
   characterization
2. prior formal evaluations for prior diagnoses/impressions and prior testing
3. school records and teacher reports for academic chronology, classroom
   functioning, and intervention history
4. collateral summaries and referral materials for referral rationale and
   background framing
5. OCR-derived or degraded text sources unless corroborated

This hierarchy guides caution; it does **not** authorize interpretation.

## Age Determination Rule

Determine age as early as possible from admitted records.

- under 18 -> child
- 18 and older -> adult
- unclear age -> flag and stop downstream history structuring

Record the source used for age determination.

## Domain Normalization Targets

Normalize evidence into domains used by later history drafting:

- referral concerns
- presenting symptoms/concerns
- developmental history
- medical history
- family history
- emotional/behavioral history
- social history
- educational history
- prior evaluations
- treatment history
- safety/substance history

Do not force every source into every domain.

## Inclusion Rules

Include information if it helps explain:

- current challenges
- development
- functioning
- reason for referral
- relevant background

Exclude or demote information that is:

- duplicative without adding clarity
- administratively noisy
- too incidental to change reader understanding
- unrelated to functioning, development, or referral concerns

## Medical History Filter

A medical detail belongs if at least one is true:

- it is relevant to current functioning or referral concerns
- it had lasting consequences
- it meaningfully affected development or functioning
- it is recent enough to matter to the current picture

Otherwise it will usually be omitted.

Developmental history is more inclusive than general medical history.

When sleep information is available, preserve:

- whether sleep issues or atypical sleep behaviors were reported
- approximate nightly sleep duration, if collected

## Source Attribution Triggers

Mark an item as attribution-sensitive when:

- it came from someone other than the client
- sources disagree
- the claim would sound too strong without naming the source
- the source itself matters for credibility or context
- the statement is subjective, evaluative, or potentially disputed

## Quote Handling

- preserve client quotes when exact wording may help later prose
- usually paraphrase collateral sources
- preserve non-client quotes only when exact wording adds meaningful value

## Normalization Output Shape

For each domain, produce compact evidence clusters containing:

- main reported pattern/fact
- developmental or time anchor if known
- concrete examples
- current impact if reported
- source list
- contradiction note if relevant
- attribution flag

Do not convert evidence clusters into polished prose yet.

## Provenance Requirements

Prepare evidence so later drafting can maintain an internal **paragraph-level
source map**.

The normalizer should make it easy to answer:

- which sources support this paragraph?
- which example came from which source?
- where does attribution need to surface explicitly?

## Special Handling Rules

### Family History Privacy

Do not prepare family-history evidence in a way that encourages attaching
protected conditions to named relatives in the final report.

Prefer buckets such as:

- immediate family history
- extended family history

When diagnoses are documented, preserve the diagnosis names exactly for later
summary rendering. Do not weaken them into vague labels such as `attention
problems` when the source supports a diagnosis such as `ADHD`.

Also preserve all documented diagnoses within each bucket so later drafting does
not accidentally omit a supported condition.

### Previous Evaluations

Keep prior evaluations normalized briefly:

- whether there was a prior evaluation
- when it occurred
- by whom
- diagnosis if formally stated
- brief impression only when needed

### School Information Placement

If school records contain information that belongs more naturally elsewhere,
label it for that later section:

- peer interaction -> social history
- emotional or behavioral concerns -> emotional/behavioral history
- work habits, grades, supports -> educational history

## Handoff to Drafting Skill

Before handing off to `neuropsych-history-report`, make sure the evidence state
can answer:

- What is the case age branch?
- What concerns belong in Reason for Referral?
- For adult cases, what complaint clusters need expansion and in what order?
- For child cases, how should concerns be distributed across history sections?
- Which claims require explicit attribution?
- Which disagreements must remain visible?
- Which concrete examples are worth carrying forward?

## Review Checklist

- Was age determined and sourced?
- Were only reported facts retained?
- Were diagnoses recorded only when explicitly documented?
- Were contradictions preserved rather than flattened?
- Were attribution-sensitive statements flagged?
- Was medical history filtered for relevance?
- Was developmental history treated more inclusively than general medical history?
- Were family-history privacy constraints preserved?
- Were school-based details routed toward the right eventual sections?
- Is the output normalized evidence rather than premature polished prose?

Base directory for this skill: file:///home/eran/code/tns/.opencode/skills/history-evidence-normalization
