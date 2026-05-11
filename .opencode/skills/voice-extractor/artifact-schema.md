# Voice Extractor Artifact Schema

This document defines the expected outputs of a `voice-extractor` run.

Canonical starter templates for these files live under:

```text
.opencode/skills/voice-extractor/templates/
```

## Output Directory Shape

For a target clinician voice skill named `shinas-voice`, generate:

```text
.opencode/skills/shinas-voice/
  SKILL.md
  style-guide.md
  style-rules.yaml
  evidence.md
  examples.md
  audit-checklist.md
```

## `SKILL.md`

Purpose:

- operational instructions for applying the extracted voice to an existing draft

Must include:

- skill frontmatter `name` and `description`
- what the skill does
- what the skill does not do
- allowed transformations
- forbidden transformations
- section-specific overlay guidance
- style application workflow
- self-audit checklist

## `style-guide.md`

Purpose:

- human-readable prose description of the clinician's voice

Recommended sections:

1. Voice Summary
2. Corpus Summary
3. Global Tone and Restraint
4. Lexicon Preferences
5. Sentence Structure
6. Paragraph Structure
7. Attribution Style
8. Section Behavior
9. Adult/Child Differences
10. Stable vs Optional Style Traits
11. Known Limits

## `style-rules.yaml`

Purpose:

- structured rules for machine-usable or semi-structured application

Recommended schema:

```yaml
voice_name: shinas-voice
clinician_name: Shina Halavi
source_corpus:
  directory: docs/shina-reports
  report_count: 5
  population_mix:
    adult: 5
    child: 0
  extraction_notes: []

confidence:
  overall: medium
  strengths: []
  limitations: []

signal_separation:
  stable_voice: []
  boilerplate: []
  section_constrained: []
  case_artifacts: []
  ambiguous: []

section_structure:
  adult:
    common_order: []
    overlays: {}
  child:
    common_order: []
    overlays: {}

lexicon:
  preferred_verbs: []
  preferred_frames: []
  preferred_transitions: []
  hedging_phrases: []
  certainty_phrases: []
  avoid: []

sentence_style:
  average_length: medium
  complexity: moderately_complex
  punctuation_preferences: []
  opener_patterns: []
  cadence_notes: []

paragraph_style:
  average_length: medium
  default_shapes: []
  example_density: moderate
  opening_patterns: []
  closing_patterns: []

attribution:
  explicit_when: []
  implicit_when_ok: []
  source_intro_patterns: []
  conflict_handling: []

guardrails:
  preserve:
    - facts
    - attribution
    - uncertainty
    - section meaning
  do_not:
    - add facts
    - add diagnoses
    - strengthen certainty
    - flatten source conflicts
    - change age branch without instruction
```

## `evidence.md`

Purpose:

- justify each major style rule with corpus support

Recommended format per rule:

```markdown
## Rule: prefers "described" and "reported" over more casual verbs
- Confidence: high
- Type: stable voice
- Supported by:
  - Report 1, history sections
  - Report 2, presenting complaints
  - Report 4, educational history
- Notes:
  - Appears across adult reports and multiple section types.
  - Not merely template boilerplate.
```

## `examples.md`

Purpose:

- teach style transfer safely using synthetic or minimally sensitive examples

Recommended format:

```markdown
## Example 1: history paragraph smoothing

### Neutral draft
...

### Voice-applied draft
...

### What changed
- attribution verb changed
- topic sentence sharpened
- chronology/example ordering aligned to corpus pattern
```

## `audit-checklist.md`

Purpose:

- verify that future voice application remains style-only

Recommended checklist headings:

1. Fact Preservation
2. Attribution Preservation
3. Uncertainty Preservation
4. Diagnosis Leakage Check
5. Section Integrity Check
6. Overfitting Check
7. Tone and Cadence Match
8. Adult/Child Structure Preservation

## Generated Skill Naming Guidance

Prefer skill names that are:

- clinician-specific
- lower-kebab-case
- clearly voice-oriented

Examples:

- `shinas-voice`
- `dr-smith-voice`
- `garcia-history-voice`

## Versioning Guidance

If the corpus expands later, update:

- report count
- confidence notes
- evidence citations
- any section overlays that change with broader evidence

Prefer revising the same skill rather than creating many near-duplicates unless
adult vs child voice meaningfully diverges.
