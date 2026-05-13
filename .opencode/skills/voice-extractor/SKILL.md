---
name: voice-extractor
description: >-
  Analyzes a directory of deidentified neuropsychological reports, separates
  stable clinician voice from boilerplate and case artifacts, and generates a
  repo-local voice skill plus structured style artifacts for later style-only
  rewriting.
---

# Voice Extractor

Use this skill when you want to build a reusable **voice skill** for a specific
neuropsychologist from a directory of deidentified reports.

This is a **corpus-analysis and skill-generation process**, not a report-writing
process.

The governing rule is:

> Extract how the clinician writes, not what the clinician concluded in any one
> case. Separate stable stylistic behavior from boilerplate, section
> constraints, and case-specific content, then generate a reusable style-only
> skill with explicit safety guardrails.

## What This Skill Does

- accepts a directory of deidentified neuropsychological reports
- inventories and extracts text from the corpus
- identifies report structure and section behavior
- analyzes lexicon, sentence structure, paragraph structure, attribution style,
  tone, and diagnostic restraint
- separates **stable voice** from **template boilerplate**, **section-type
  constraints**, and **case-specific artifacts**
- generates structured voice artifacts and a repo-local voice skill
- documents evidence for each extracted rule so later users can review why it
  exists

## What This Skill Does Not Do

- write a new clinical report from source records
- infer diagnoses or clinical positions from stylistic patterns
- treat repeated diagnostic content as part of the writer's voice
- authorize future rewriting to add facts, strengthen certainty, or remove
  attribution
- assume every repeated phrase is stylistically meaningful

## Honest Boundary

Keep these functions separate:

1. **content generation**
2. **voice extraction**
3. **voice application**
4. **post-transfer audit**

This skill handles **voice extraction** only.

The generated voice skill should be a **style-only transformer** that can be
applied after truthful content has already been drafted.

## Required Inputs

Before starting, obtain or infer:

- `source_directory`: directory containing deidentified reports
- `clinician_name`: the neuropsychologist whose voice is being modeled
- `output_skill_name`: preferred generated skill name, e.g. `shinas-voice`
- `scope`:
  - `full-report`
  - `history-only`
  - `selected-sections`
- `population_focus`:
  - `all`
  - `adult-only`
  - `child-only`
- `minimum_corpus_size`: default 5 unless user specifies otherwise

If any of these materially affects the generated skill and is unclear, ask.

## Minimum Corpus Rule

- Fewer than 3 reports: too weak for a trustworthy voice skill; stop unless the
  user explicitly wants a provisional profile.
- 3-4 reports: proceed, but mark confidence limits prominently.
- 5 or more reports: acceptable for a first pass, still with caution about
  overfitting.

## High-Level Workflow

1. intake and scope the corpus
2. inventory and classify files
3. extract text and assess extraction quality
4. segment report structure
5. analyze stylistic features by section and across the corpus
6. separate stable voice from non-voice signal
7. synthesize artifacts
8. generate the clinician-specific voice skill
9. audit the generated skill for safety and overreach

Do not skip the signal-separation step.

## Stage 1: Intake and Scope

First determine:

- whether the corpus contains adult reports, child reports, or both
- whether the user wants a full-report voice or a section-limited voice
- whether reports appear to share one institutional template
- whether the files are machine-readable or degraded/OCR-heavy

If the corpus is mixed, decide whether to:

- build a single voice skill with adult/child overlays, or
- build separate output artifacts by branch

If history sections are the main target for future use, prefer producing both:

- a global clinician voice profile, and
- a history-section overlay

## Stage 2: Inventory and Source Typing

For each source file, capture:

- filename
- file type
- extraction success/failure
- OCR confidence or degradation concerns
- report type if discernible
- adult vs child
- whether a recognizable history section exists
- whether the report appears substantially templated

Do not proceed silently if text extraction is too degraded to support style
analysis.

## Stage 3: Text Extraction and Quality Review

Extract text from each report while preserving report boundaries.

For each report, note:

- clean extraction
- partial extraction
- heading loss
- paragraph loss
- table contamination
- OCR corruption

If extraction quality materially prevents sentence- or paragraph-level analysis,
say so and downgrade confidence.

## Stage 4: Structural Segmentation

Identify and preserve:

- section headings
- subheadings
- section order
- paragraph boundaries
- bullet/list regions
- boilerplate regions
- appendix/testing-score regions

Try to separate:

- referral/history narrative sections
- interpretation/impressions sections
- recommendations sections
- test appendix sections

This matters because not all sections reveal the same voice.

## Stage 5: Feature Extraction Dimensions

Analyze all of the following.

### A. Corpus Metadata

Track:

- report count
- adult/child distribution
- date span if available
- section coverage consistency
- template consistency

### B. Section Architecture

Extract:

- standard section order
- common section names
- optional section names
- merged vs split sections
- section-specific paragraphing habits
- adult/child structural differences

### C. Lexicon

Extract recurring:

- attribution verbs
- symptom-description verbs
- functional-impact phrasing
- transition phrases
- hedging phrases
- certainty phrases
- common noun clusters
- favored descriptive adjectives/adverbs

Examples of items to track:

- `reported`
- `described`
- `endorsed`
- `noted`
- `shared`
- `explained`
- `per self-report`
- `per parent report`
- `available records indicate`
- `difficulties with`
- `challenges with`
- `currently`
- `specifically`

### D. Sentence Structure

Analyze:

- sentence length distribution
- simple vs compound vs complex sentence preference
- clause density
- use of parentheticals
- use of semicolons/colons/em dashes
- list-in-sentence habits
- topic-sentence forms
- frequency of opener patterns like `Specifically, ...`

### E. Paragraph Structure

Identify common paragraph shapes such as:

- topic -> chronology -> examples -> impact
- topic -> source attribution -> examples -> current status
- general pattern -> modality breakdown -> impact
- self-report -> collateral corroboration -> functional consequence

Also capture:

- average paragraph length
- example density
- preferred paragraph openings
- preferred paragraph closings
- transition behavior between paragraphs

### F. Attribution Behavior

Extract rules for:

- when the clinician names the source explicitly
- when attribution is implicit
- how parent/caregiver report is introduced
- how record review is introduced
- how prior evaluations are summarized
- how source conflicts are surfaced or smoothed

### G. Tone and Restraint

Analyze:

- formality level
- clinical restraint
- certainty calibration
- degree of interpretive language
- degree of privacy-conscious wording
- difference between reported fact, observation, inference, and diagnosis

### H. Micro-Style

Track:

- capitalization conventions in headings/subheadings
- quote frequency and function
- acronym introduction style
- punctuation preferences
- parenthetical examples
- abbreviation habits

### I. Repetition and Compression Habits

Analyze:

- repeated concern labels across sections
- cross-referencing habits
- tolerance for reiteration
- whether examples are recycled or varied
- how the clinician compresses source material into polished prose

## Stage 6: Signal Separation

This is the most important stage.

Every extracted pattern must be classified as one of:

1. **stable voice**
2. **template boilerplate**
3. **section-type constrained style**
4. **case-specific artifact**
5. **low-confidence / ambiguous**

Do not convert a pattern into a voice rule until you have decided which class it
belongs to.

### Stable Voice

A pattern belongs here when it:

- appears across multiple reports
- appears across more than one section when appropriate
- is not simply required by standard report ontology
- reflects stylistic preference rather than case content

### Template Boilerplate

A pattern belongs here when it:

- appears as fixed institutional/report-template language
- is required by form or legal boilerplate
- does not meaningfully express clinician-specific style

### Section-Type Constraint

A pattern belongs here when it:

- appears because a particular section has a standard function
- may be reusable only within that section type
- should become a section overlay rather than a global voice rule

### Case-Specific Artifact

A pattern belongs here when it:

- depends on one case's diagnoses or symptom profile
- reflects one patient's wording or unusual chronology
- should never be generalized into a style rule

### Low-Confidence / Ambiguous

Use this when:

- corpus support is weak
- extraction quality is noisy
- the pattern may be real but evidence is thin

## Stage 7: Synthesis Outputs

Produce the following outputs.

Use the companion templates under `templates/` as the canonical output shape
for generated voice-skill artifacts.

### 1. `style-guide.md`

Human-readable description of the clinician's voice, including:

- summary of the voice
- section behavior
- lexicon preferences
- sentence and paragraph patterns
- attribution style
- restraint/tone profile
- adult/child differences if relevant
- stable vs optional traits

### 2. `style-rules.yaml`

Structured machine-usable rules, including:

- corpus metadata
- confidence notes
- section ontology
- preferred lexical items
- sentence-style targets
- paragraph templates
- attribution rules
- guardrails
- section overlays

### 3. `evidence.md`

Explain **why** each rule exists. For each major style claim, provide:

- the rule
- confidence level
- which reports/sections support it
- whether it is global or section-limited

Do not paste raw report text unnecessarily; summarize evidence economically.

### 4. `examples.md`

Provide short synthetic or safely deidentified transformations showing:

- neutral draft style
- clinician-style rewrite
- what changed at the level of lexicon/syntax/paragraph rhythm

These examples should teach usage, not memorize report content.

### 5. `audit-checklist.md`

Provide a style-transfer audit checklist verifying that future use of the voice
skill does not:

- add facts
- add diagnoses
- remove attribution
- remove uncertainty
- overfit a single report's phrasing
- convert style transfer into interpretation

### 6. Generated Voice Skill Directory

Create a repo-local skill directory named for the target clinician voice, e.g.:

- `.opencode/skills/shinas-voice/`

with at minimum:

- `SKILL.md`
- `style-guide.md`
- `style-rules.yaml`
- `audit-checklist.md`

Prefer also generating:

- `evidence.md`
- `examples.md`

## Required Contract for Generated Voice Skills

Every generated voice skill must include a hard contract stating that it may:

- change diction
- change syntax
- change paragraph rhythm
- smooth transitions
- lightly reorganize within-section prose when meaning is preserved

and may **not**:

- add facts
- add interpretation not already present
- add diagnoses
- strengthen certainty
- remove attribution where clinically needed
- flatten source conflicts
- change age branch or section ontology unless explicitly instructed

## Generated Skill Shape

The generated clinician-specific skill should include:

1. its purpose
2. allowed transformations
3. forbidden transformations
4. section-specific overlays
5. style application workflow
6. self-audit rules

It should act as a **post-draft rewriting skill**, not as the primary report
writer.

## Starter Workflow for Using This Skill

When invoked, proceed in this order:

1. verify source directory exists and contains enough reports
2. inventory files and extraction quality
3. extract text and segment sections
4. analyze style dimensions
5. classify patterns by signal type
6. synthesize artifacts
7. generate the clinician voice skill
8. review the generated skill for safety and overreach

## Output Requirements for This Skill

When finishing a `voice-extractor` run, provide:

- corpus summary
- confidence summary
- major stable voice findings
- major non-voice exclusions
- list of files generated
- caveats that limit reliability
- suggested next command or usage pattern for applying the generated voice skill

## Safety Rules

Never:

- infer clinical beliefs from style alone
- turn frequently occurring diagnoses into stylistic defaults
- remove uncertainty markers because the target writer sounds polished
- copy unusual case-specific phrases into reusable defaults
- treat one report's conclusions as the model for future content generation

## Preferred Architecture

Prefer generating both:

- a **global voice profile**, and
- **section overlays** for high-value sections such as:
  - reason for referral
  - history
  - previous evaluations
  - impressions
  - recommendations
