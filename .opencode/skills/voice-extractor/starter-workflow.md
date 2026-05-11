# Voice Extractor Starter Workflow

Use this workflow when you want to generate a clinician-specific voice skill
from a directory of deidentified neuropsychological reports.

## Recommended Invocation Template

> Use `voice-extractor` on `<SOURCE_DIRECTORY>` to generate a repo-local voice
> skill for `<CLINICIAN_NAME>` named `<OUTPUT_SKILL_NAME>`. Scope it to
> `<SCOPE>` and `<POPULATION_FOCUS>`. Analyze the corpus for structure,
> lexicon, sentence patterns, paragraph patterns, attribution style,
> tone/restraint, and section overlays. Separate stable voice from boilerplate,
> section constraints, and case artifacts. Then generate the output artifacts
> and the new voice skill under `.opencode/skills/<OUTPUT_SKILL_NAME>/`.

## Example Prompt

> Use `voice-extractor` on `docs/deidentified-shina-reports` to generate a
> repo-local voice skill for Shina Halavi named `shinas-voice`. Scope it to
> `history-only` for `adult-only` reports. Require at least 5 reports. Produce
> `SKILL.md`, `style-guide.md`, `style-rules.yaml`, `evidence.md`,
> `examples.md`, and `audit-checklist.md`. Mark low-confidence patterns
> explicitly and do not generalize case-specific diagnoses or content into style
> rules.

## Step-by-Step Runbook

### 1. Validate Inputs

- confirm the source directory exists
- confirm the corpus size is sufficient
- confirm the clinician name and output skill name
- confirm the intended scope and population focus

### 2. Inventory the Corpus

- list all files
- identify file types
- flag unreadable or degraded sources
- summarize adult/child distribution

### 3. Extract Text

- extract machine-readable text from PDFs/DOCX files
- preserve file-level boundaries
- note extraction failures and OCR concerns

### 4. Segment Reports

- identify headings and subheadings
- isolate history-relevant sections if scope is limited
- separate boilerplate and appendix regions

### 5. Analyze Voice Dimensions

- lexicon
- sentence structure
- paragraph structure
- attribution behavior
- tone/restraint
- micro-style
- section behavior

### 6. Separate Signal Types

For each candidate rule, classify as:

- stable voice
- boilerplate
- section-constrained
- case artifact
- low-confidence

### 7. Generate Artifacts

- use the companion templates under `voice-extractor/templates/` as the base
  emission shape
- write `style-guide.md`
- write `style-rules.yaml`
- write `evidence.md`
- write `examples.md`
- write `audit-checklist.md`
- generate the clinician-specific `SKILL.md`

### 8. Audit the Generated Skill

Verify that the generated skill:

- is clearly style-only
- preserves facts and attribution
- does not authorize interpretation
- does not overfit one report
- honestly labels low-confidence traits

## Suggested Generated Skill Contract

Include language like:

> Apply style only. Preserve factual content, source attribution, uncertainty,
> and section meaning unless explicitly instructed to revise content.

## Suggested Post-Generation Use

After generating the voice skill:

1. draft the report honestly with the content-writing workflow
2. apply the generated voice skill as a post-draft pass
3. run the relevant audit skill afterward

## Common Failure Modes to Watch For

- over-weighting a single report
- confusing template language for voice
- treating diagnosis language as a stylistic preference
- flattening attribution in the name of polish
- generating a voice skill that is really a content-generation template

## Minimal Viable First Pass

If the corpus is only moderately sized but still usable, the first pass should
still produce:

- a global voice summary
- a stable-vs-nonstable distinction
- a style-only generated skill
- explicit confidence limitations

That is preferable to pretending the profile is more certain than it is.
