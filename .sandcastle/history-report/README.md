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
