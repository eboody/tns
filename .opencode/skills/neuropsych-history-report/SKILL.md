---
name: neuropsych-history-report
description: >-
  Generates neuropsychological history sections from intake and collateral
  documents using a strict non-interpretive, section-planned, source-grounded
  workflow with age-based adult/child branching.
---

# Neuropsych History Report

Use this skill when you need to write the **history portion of a neuropsychological
report** from intake, collateral, school, medical, referral, and prior-evaluation
documents.

This is a **history-writing process, not an interpretation process**.

The governing rule is:

> Organize reported information, decide what belongs, translate it into polished
> clinical language, and attribute sources when needed — without adding
> interpretation, undocumented diagnoses, or invented meaning.

## What This Skill Does

- determines whether the case is **child** or **adult**
- selects the correct section structure for that age group
- requires a **section-by-section content plan before drafting**
- converts admitted facts into polished clinical history prose
- keeps an internal **paragraph-level source map**
- enforces source attribution, diagnosis restraint, and non-interpretive writing
- checks that the final history reads like a polished narrative rather than raw
  intake notes

## What This Skill Does Not Do

- infer diagnoses
- interpret patterns beyond what was reported
- invent explanations
- flatten source disagreements
- dump intake phrasing into the report unchanged

## Required Supporting Skills

This skill is the orchestrator. Use it together with:

1. `history-evidence-normalization` for evidence admission, normalization,
   contradiction handling, and provenance preparation
2. `history-narrative-audit` for final narrative and rule-compliance review

Default execution order:

1. normalize evidence
2. plan sections
3. draft history prose
4. audit the draft

## Core Decision Rule: Age Branch

- **Under 18** -> child case
- **18 and older** -> adult case
- If age is unclear -> **stop and flag it**

Do not guess age and do not partially draft before the age branch is resolved.

## Section Ontology

### Adult Cases

Use:

- Reason for Referral
- Presenting Complaints/Symptoms
- Relevant History sections
- Previous Evaluations

### Child Cases

Use:

- Reason for Referral
- Relevant History sections
- Previous Evaluations

Child cases **do not** have a separate Presenting Complaints/Symptoms section.
Reported concerns should be distributed into the relevant history sections and
woven through those sections rather than gathered into a symptom-only block.

## Global Writing Rules

### Reported History Only

State only what was reported in the source documents.

### No Interpretation

Do not interpret social, emotional, developmental, medical, attentional, or
behavioral patterns.

### Diagnoses

Do not name a diagnosis unless a **formal diagnosis is explicitly documented** in
the source material.

### Source Attribution

Name sources when:

- information came from someone other than the client
- sources differ
- the source itself matters
- the statement would sound too strong without attribution

This applies throughout the report, not just in isolated sections.

### Acronyms and Initialisms

On the first reference to any acronym or initialism in the report, write the full
term followed by the acronym in parentheses, then use the acronym alone on later
references. For example: `Attention-Deficit/Hyperactivity Disorder (ADHD)` on
first reference, then `ADHD` thereafter.

Only expand acronyms when the full term is source-supported or clinically
standard and unambiguous in context. If the expansion is unclear, avoid the
acronym when possible or mark it as needing clarification rather than guessing.

### Quotes

- quote the client when the exact wording helps
- usually paraphrase parents, teachers, tutors, physicians, and other informants
- occasionally quote collateral sources when the exact wording adds value

### Allowed Transformation

Allowed:

- combine overlapping source statements
- shorten repetition
- smooth wording
- translate casual wording into polished clinical phrasing
- preserve client wording in quotes when useful

Not allowed:

- add facts
- add interpretation
- add diagnoses
- add meaning not present in the sources

### Internal Provenance

Maintain an internal **paragraph-level source map** for every drafted paragraph.

## Inclusion Rule

Include information only if it helps the reader understand:

- the client's overall challenges
- development
- functioning
- reason for referral
- relevant background

Keep at least one concrete example for important patterns. Use enough examples
to make the point clear, but not an unnecessary amount.

## Workflow

### Stage 1: Determine Case Type

Before planning or drafting:

1. identify age from admitted records
2. classify as child or adult
3. stop if age is unclear

### Stage 2: Select Section Set

Choose the allowed section structure for the age branch.

### Stage 3: Build a Section-by-Section Content Plan

Before drafting each section, answer:

1. What is the **main point**?
2. What reported information supports it?
3. Which examples make it clear?
4. Which sources need to be named?
5. What can be left out?
6. Then write.

Do not skip directly from evidence to polished prose.

### Stage 4: Draft in Polished Report Language

Write from the section plan and normalized evidence only.

### Stage 5: Review and Revise

Check for:

- repetition
- wrong section placement
- interpretive language
- undocumented diagnoses
- missing attribution
- too many or too few examples
- mismatch with Reason for Referral
- acronyms/initialisms used before first-reference expansion
- residual intake-note tone

## Section-Specific Rules

### Adult: Reason for Referral

Include:

- client name
- age in years only
- gender
- handedness
- evaluation setting phrased as
  - `presented for an outpatient neuropsychological assessment`
- main concerns
- onset of symptoms
- brief why-now context if known
- exact closing sentence:

> The purpose of this evaluation is to determine strengths and weaknesses and to
> assist with diagnostic clarification and treatment planning.

#### Ordering Rule

The concerns named here determine the order later used in adult Presenting
Complaints/Symptoms.

This section should orient the reader clearly but remain concise. Name the main
concern clusters here without overloading the section with examples.

### Adult: Presenting Complaints/Symptoms

Only adult cases have this section.

Rules:

- expand the concerns from Reason for Referral
- preserve the **same order**
- organize by symptom or concern cluster
- prioritize by functional impairment when deciding emphasis within clusters

Within each cluster, usually include:

- the problem
- when it began
- change over time
- examples
- current impact

Use more examples here than in most other sections, but not excessively.

Do not add your own explanation for why symptoms were hidden or worsened. Only
include such explanations if they were reported, and attribute them.

### Child Cases: No Presenting Complaints Section

For child cases:

- identify the main concerns in Reason for Referral
- distribute those concerns into:
  - developmental history
  - medical history
  - emotional/behavioral history
  - social history
  - educational history

### Medical History Filter

Include a medical detail if at least one applies:

- it is relevant to current functioning or referral concerns
- it had lasting consequences
- it meaningfully affected development or functioning
- it is recent enough to matter to the current picture

If none apply, usually omit it.

For included issues:

- fuller description when clearly relevant or significant
- brief mention when it belongs but is not central
- omit when it fails the filter

Developmental history is treated **more inclusively** than general medical
history.

### Child: Developmental History

Include, as reported and when available:

- prenatal history
- pregnancy complications
- birth and delivery details
- birthweight
- NICU or hospital stays
- developmental milestones
- speech/language development
- motor development
- toileting history
- self-soothing behaviors
- sleep development
- primary language exposure
- relevant developmental therapies or interventions

Rules:

- organize chronologically
- use objective report-based language
- do not interpret

### Adult: Developmental History

Include:

- whether milestones were met on time
- clinically relevant developmental concerns
- long-standing speech/language, social, attentional, behavioral, emotional, or
  neurological features that persist into adulthood
- childhood features only if they help explain current referral concerns
- major prenatal, birth, NICU, or early complications if abnormal or relevant

Avoid overly detailed childhood chronology unless directly relevant.

### Family History

#### Privacy Rule

Do **not** attach diagnoses or protected conditions to named relatives.

Prefer summary phrasing such as:

- `Immediate family history is remarkable for ...`
- `Extended family history is remarkable for ...`

It is acceptable to name relationships for family structure or living context,
but not to attach protected conditions to specific relatives.

#### Section Flow

Usually move through:

1. current family structure or living context
2. relocation/developmental geography/divorce-custody background
3. immediate family history
4. extended family history

#### Child Family History

Usually include:

- who lives in the home
- caregiver relationships or custody if relevant
- siblings and sibling ages
- primary language in the home
- relocation history
- cultural/ethnic background
- parent educational background
- immediate and extended family psychiatric, neurodevelopmental, and medical
  history
- major family stressors if relevant

#### Adult Family History

Include:

- relationship status
- current living situation
- family structure
- sibling information and birth order
- relocation/developmental geography
- parental divorce or custody history
- immediate and extended family psychiatric, neurodevelopmental, and medical
  history
- cultural, ethnic, or language background when relevant

Do not specify which immediate or extended relative had which condition in the
final report. Preserve only the summary bucket unless the detail is about family
structure/context rather than protected health information.

### Emotional/Behavioral History

Purpose:

- describe long-standing emotional/behavioral patterns
- note changes over time
- summarize treatment history
- describe current emotional status
- include safety and substance history
- describe functional impact

Organize by **clinical themes**, not diagnoses.

Possible themes include:

- mood regulation
- anxiety or worry
- frustration tolerance
- rigidity/behavioral regulation
- treatment history
- safety/substance history

Use outside informants when available and attribute when needed.

Default rough order:

1. long-standing pattern
2. worsening or changes over time
3. examples
4. treatment history
5. current emotional status
6. safety/substance history

### Social History

Purpose:

- early social development
- friendship patterns over time
- current social functioning
- effect of social difficulties

Organize developmentally.

#### Child Social History

Include:

- early social development
- whether appropriate play/social interest was noted
- difficulties making friends
- difficulties with social boundaries
- whether the child asked for playdates

#### Adult Social History

Include:

- early social development when relevant
- friendship patterns over time
- ability to develop and maintain friendships
- closeness versus quantity of relationships
- group versus one-on-one comfort
- how time is spent with friends
- current social functioning
- the client's experience of social connection or difficulty

### Educational History

Include:

- early academic functioning
- later academic functioning
- learning strengths and challenges over time
- supports/interventions/tutoring
- accommodations
- grades/performance
- effect of symptoms on school functioning
- current educational status
- highest level of education

Use school records and collateral to capture:

- work habits
- classroom behavior
- attention/organization
- school social functioning
- teacher concerns and strengths

If school-based information belongs more naturally elsewhere, place it there:

- social comments -> Social History
- emotional/behavioral comments -> Emotional/Behavioral History

If performance was strong, still include the **effort cost, strain, extra time,
or difficulty** behind it when that was reported.

### Previous Evaluations

Keep this section brief.

Include:

- whether there was a prior evaluation
- when it occurred
- by whom
- usually only the diagnosis
- if no diagnosis, a brief quoted or closely paraphrased impression if useful
- clear source attribution

If expected information is missing here, `not reported` is appropriate.

## The "Not Reported" Rule

Use `not reported` selectively, mainly when readers would expect the information,
including:

- Previous Evaluations
- Family History
- Medical/Developmental History
- treatment history
- safety history

Do not overuse it in every section.

## Narrative Shape Guidance

For narrative sections such as Presenting Complaints, Emotional/Behavioral
History, Social History, and Educational History, the usual paragraph shape is:

1. main pattern
2. time course
3. examples
4. current impact

This is a default pattern, not a rigid template.

## Final Consistency Check

Confirm that:

- Reason for Referral concerns match later sections
- in adults, Presenting Complaints expands those same concerns in the same order
- no major concern is introduced and then dropped
- no unsupported major concern appears later

For later-supported concerns, decide whether each is:

- a major concern, or
- a secondary historical feature, or
- a secondary challenge tied to an existing major concern

## Final Polish Check

Ask:

- does this sound like a polished history narrative?
- or does it still sound like intake notes?

Warning signs of intake-note drift:

- list-like presentation
- choppy sentences
- questionnaire-order prose
- too many raw details
- too much unprocessed patient wording
- repetition across sections

## Audience Rule

Write in polished clinical language for a **broad professional audience**, while
assuming the report may also be read by:

- client/family
- school
- other clinicians

Therefore the writing should be clear, restrained, and privacy-conscious.

## Review Checklist

- Was age determined clearly enough to choose adult vs child?
- Was drafting paused if age was unclear?
- Was a section plan built before prose drafting?
- Does each section stay within reported history rather than interpretation?
- Were diagnoses mentioned only when explicitly documented?
- Were source attributions added where needed?
- Were acronyms/initialisms expanded on first reference and used consistently
  thereafter?
- Were concerns ordered consistently from referral into adult presenting complaints?
- Were child concerns distributed into history sections rather than forced into a
  presenting complaints section?
- Does each important pattern have at least one concrete example?
- Is family history privacy-conscious?
- Does the final history sound like polished report prose rather than intake notes?

Base directory for this skill: file:///home/eran/code/tns/.opencode/skills/neuropsych-history-report
