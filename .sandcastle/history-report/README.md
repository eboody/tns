# Sandcastle History Report Workflow

This package is the repo-local bootstrap surface for clinician-native neuropsych
history-report generation.

## Current entrypoint

```bash
node .sandcastle/history-report/scripts/bootstrap-run.mjs --source-dir "/absolute/path/to/deidentified-markdown-folder"
```

The bootstrap slice creates a stable case workspace, a run workspace, initial
brief/privacy artifacts, and repo-local Ralph backlog scaffolding.

## Inventory entrypoint

```bash
node .sandcastle/history-report/scripts/inventory-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The inventory slice classifies markdown candidates, separates wrapper content
from source-derived content, emits logical source-unit metadata, and writes
source inventory plus inclusion/exclusion artifacts for the run.

## Evidence entrypoint

```bash
node .sandcastle/history-report/scripts/evidence-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The evidence slice derives provenance-bearing segment annotations, attributed
atomic claims, and per-source evidence sheets from the admitted markdown source
set.

## Planning entrypoint

```bash
node .sandcastle/history-report/scripts/planning-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The planning slice classifies the case into the correct lifecycle/report schema,
assigns claims to primary section homes, and emits section-planning artifacts
with salience and missingness decisions.

## Style-profile entrypoint

```bash
node .sandcastle/history-report/scripts/style-profile-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The style-profile slice compiles a provisional governing clinician profile from
exemplars and doctrine defaults, emits lexicon/quote/anti-style artifacts, and
marks the result as requiring clinician confirmation before stable promotion.

## Draft-subsection entrypoint

```bash
node .sandcastle/history-report/scripts/draft-subsection-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z" \
  --subsection-id "reason-for-referral"
```

The draft-subsection slice generates one subsection from approved claims,
emits factual and polished drafts, and records evidence/style review results.

## Presenting-section entrypoint

```bash
node .sandcastle/history-report/scripts/presenting-section-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The presenting-section slice drafts both presenting-information subsections,
integrates them in ontology order, and emits the first full section-level prose
artifact.

## Relevant-history entrypoint

```bash
node .sandcastle/history-report/scripts/relevant-history-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The relevant-history slice drafts each required Relevant History subsection,
integrates them into one section, and emits a section-level provenance map plus
global review artifact.

## Clinician-memo entrypoint

```bash
node .sandcastle/history-report/scripts/clinician-memo-run.mjs \
  --source-dir "/absolute/path/to/deidentified-markdown-folder" \
  --run-id "20260507T131415Z"
```

The clinician-memo slice generates a psychologist-voice memo of missing
information, conflicts, style underfit, and interpretation-relevant questions.
