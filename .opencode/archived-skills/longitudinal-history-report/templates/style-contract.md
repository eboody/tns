# Style Contract

This artifact governs the **voice-generation** pass. It may influence tone,
ordering, and sentence shape, but it may not introduce new factual content.

Use this together with `reference/report-polish-guide.md`. If the guide and the
case-specific contract differ, this case-specific contract wins.

## Target Genre

- `Polished outpatient neuropsychological history-report prose`

## Voice Rules

- Write in clinician-native narrative prose, not workflow or audit prose.
- Prefer `CLIENT described...`, `records indicate...`, `mother reported...`, or
  other honest source-grounded attributions.
- Avoid repetitive meta-language such as `the admitted record supports` unless
  evidentiary caution specifically requires it.
- Use concrete examples whenever the section claim bank approves them.
- Keep diagnostic restraint: descriptive specificity is good; unsupported
  diagnostic certainty is not.
- Prefer clinician-native category labels over quoted patient shorthand when no
  meaning is lost (e.g. `rigid adherence to routines` rather than centering
  `just right`).

## Paragraph Construction Rules

Each substantive paragraph should usually do most of the following:

1. open with the clinical pattern
2. locate it developmentally or chronologically
3. include 1-3 concrete examples
4. state the current functional impact
5. end with a bounded interpretive synthesis when justified

## Tone Rules

- Sound clinically fluent and confident where evidence is high.
- Qualify briefly and naturally where evidence is thin.
- Do not pad sparse sections with generic clinician filler.
- Keep likely readers in mind and include only the depth of detail they need to
  understand the pattern, impact, chronology, and planning implications.
- Summarize family history at the clinically useful level; prefer
  immediate/extended family summaries over relative-by-relative listings unless
  specificity matters.
- Omit incidental medical anecdotes without sequelae unless they materially
  affect interpretation.
- Do not mention the existence of the claim bank, workflow stages, or artifact
  pipeline in the final report.

## Exemplar Policy

- If a style exemplar is allowed for the run, it may influence only tone,
  rhythm, paragraph density, and structural feel.
- The exemplar-derived polish guide may also be used for default drafting
  conventions around detail selection, section shaping, and clinician-native
  phrasing.
- The exemplar must never contribute case facts, examples, dates, diagnoses, or
  conclusions.
- If the user forbids exemplar access, write from this contract alone.

## Rewrite Guardrail

- Every substantive sentence in the polished draft must be traceable to one or
  more approved claims or approved examples in `03-derived/section-claim-bank.md`.
