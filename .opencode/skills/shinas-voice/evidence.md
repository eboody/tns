# Shina Halavi Voice Evidence Memo

This memo documents the corpus support for the generated `shinas-voice` skill.

## Corpus Summary

- Source directories: `docs/5 deidentified reports` and `/home/eran/documents/Shina/`
- Reports analyzed: `8`
- Scope: `adult and child report voice with strongest direct support in referral/history sections`
- Population focus: `mixed adult and child`

Report set reviewed:

- `JB deidentified.docx`
- `MK deidentified.docx`
- `MW deidentified.docx`
- `RM deidentified.docx`
- `SM deidentified.docx`
- `JAM DOT 2024 Report.docx`
- `JAC DEL 2025 Report.docx`
- `SUR SHA 2025 Neuropsych Assessment Report.docx`

## Rule: formulaic adult Reason for Referral opening

- Confidence: `high`
- Signal type: `stable voice`
- Supported by:
  - JB, Reason for Referral
  - MK, Reason for Referral
  - MW, Reason for Referral
  - RM, Reason for Referral
  - SM, Reason for Referral
- Why it qualifies:
  - All 5 adult reports opened referral with the same age/handedness/gender/outpatient-neuropsych frame.
  - The construction `in the context of ...` was repeatedly used to introduce concern clusters.
- Boilerplate check:
  - Although partly templatic, the repeated sentence-level shape is central to the clinician’s practical voice for this section and therefore useful as an adult overlay.

## Rule: formulaic child Reason for Referral opening without a separate Presenting Complaints section

- Confidence: `high`
- Signal type: `stable voice + section-constrained child overlay`
- Supported by:
  - JAM DOT 2024 Report, Reason for Referral
  - JAC DEL 2025 Report, Reason for Referral
  - SUR SHA 2025 Neuropsych Assessment Report, Reason for Referral
- Why it qualifies:
  - All 3 child reports introduced the child by full name, age in years and months, handedness, outpatient neuropsych framing, and a concise concern cluster.
  - All 3 then moved directly into `RELEVANT HISTORY` without creating a separate Presenting Complaints/Symptoms section.
- Boilerplate check:
  - The section omission and the age-month format function as a reliable child-branch overlay in this corpus.

## Rule: heavy reliance on described / reported / endorsed / denied

- Confidence: `high`
- Signal type: `stable voice`
- Supported by:
  - corpus-wide frequency analysis
  - adult and child referral/history slices
- Why it qualifies:
  - In the expanded 8-report corpus, `described`, `reported`, `endorsed`, and `denied` recur heavily across adult and child reports.
  - These verbs are used consistently for symptoms, examples, and history narration.
- Boilerplate check:
  - This is not just report boilerplate; it is a repeated lexical preference at the sentence level.

## Rule: transition-openers guide symptom expansion

- Confidence: `high`
- Signal type: `stable voice`
- Supported by:
  - adult Presenting Complaints/Symptoms sections across the 5 adult reports
  - child history sections in JAM, JAC, and SUR
- Why it qualifies:
  - `Specifically,`, `Currently,`, and `Regarding ...` recur across multiple reports to move through concern clusters.
  - These openers shape paragraph rhythm rather than merely conveying content.
- Boilerplate check:
  - These are discretionary discourse choices, not required headings.

## Rule: paragraphs tend to move from topic to examples to impact

- Confidence: `medium-high`
- Signal type: `stable voice`
- Supported by:
  - JB Presenting Complaints/Symptoms and Psychological History
  - MW Presenting Complaints/Symptoms and Social History
  - RM Presenting Complaints/Symptoms and Psychosocial History
  - SUR Social and Behavioral/Emotional History and Educational History
- Why it qualifies:
  - Paragraphs regularly begin with a broad concern statement, then elaborate with examples and close with impact or management difficulty.
- Boilerplate check:
  - This pattern extends across different section types and age branches and is not tied to one diagnosis.

## Rule: child history uses explicit parent/teacher/tutor/self-report braiding

- Confidence: `high`
- Signal type: `section-constrained`
- Supported by:
  - JAM DOT 2024 Report, Social and Behavioral/Emotional History with Educational History
  - JAC DEL 2025 Report, Social and Behavioral/Emotional History with Educational History
  - SUR SHA 2025 Neuropsych Assessment Report, Social and Behavioral/Emotional History with Educational History
- Why it qualifies:
  - The child reports repeatedly alternate among parent, teacher, tutor, and self-report within the same broad domain.
  - Mini-subdomain headings such as `Social`, `Behavioral`, and `Emotional` recur.
- Boilerplate check:
  - This pattern is section-specific and age-branch specific, so it was retained as a child history overlay rather than a global rule.

## Rule: history sections favor remarkable/unremarkable framing

- Confidence: `high`
- Signal type: `section-constrained`
- Supported by:
  - adult and child medical/developmental/family history sections
- Why it qualifies:
  - Multiple history subsections open by explicitly stating whether history is `remarkable` or `unremarkable`.
- Boilerplate check:
  - This appears section-specific rather than fully global, so it was kept as an overlay rather than a universal rule.

## Rule: Previous Evaluations stays brief and direct

- Confidence: `high`
- Signal type: `stable voice`
- Supported by:
  - all 8 reports, Previous Evaluations
- Why it qualifies:
  - In most reports, the section is a direct denial of prior evaluation.
  - Where present, the section briefly names evaluator or school observation plus limited takeaway, then stops.
- Boilerplate check:
  - This is a consistent handling style, not simply a heading artifact.

## Excluded Patterns

Documented here are patterns seen in the corpus that should **not** become
voice rules.

### Exclusion: diagnosis clusters common across the corpus

- Type: `case artifact`
- Why excluded:
  - ADHD/anxiety/depression/learning-disorder content recurs across the sample but reflects referral population, not writing style.

### Exclusion: quoted patient wording

- Type: `case artifact`
- Why excluded:
  - Rare direct quotes or unusual self-descriptions are patient-specific and should not become default stylistic output.

### Exclusion: exact punctuation in purpose sentence

- Type: `ambiguous`
- Why excluded:
  - The sample includes small variation between `treatment planning and care` and `treatment planning`; this was treated conservatively.

## Confidence Caveats

- The corpus is still modest in size.
- Child findings are based on 3 reports.
- Direct review was deepest in referral/history sections, so later report sections should be styled more cautiously.
