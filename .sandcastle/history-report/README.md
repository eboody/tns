# Sandcastle History Report Workflow

This package is the repo-local bootstrap surface for clinician-native neuropsych
history-report generation.

## Current entrypoint

```bash
node .sandcastle/history-report/scripts/bootstrap-run.mjs --source-dir "/absolute/path/to/deidentified-markdown-folder"
```

The bootstrap slice creates a stable case workspace, a run workspace, initial
brief/privacy artifacts, and repo-local Ralph backlog scaffolding.
