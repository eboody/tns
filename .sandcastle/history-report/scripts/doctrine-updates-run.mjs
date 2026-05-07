import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runHistoryReportDoctrineUpdates } from '../../../src/history-report-doctrine-updates.js'

const options = parseArgs(process.argv.slice(2))

if (!options.sourceDirectory || !options.runId || !options.editedDraftPath) {
  console.error('Usage: node .sandcastle/history-report/scripts/doctrine-updates-run.mjs --source-dir "/absolute/source/dir" --run-id "20260507T131415Z" --edited-draft-path "/path/to/edited-draft.md"')
  process.exitCode = 1
} else {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

  runHistoryReportDoctrineUpdates({
    sourceDirectory: options.sourceDirectory,
    repoRoot,
    runId: options.runId,
    editedDraftPath: options.editedDraftPath
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(String(error))
      process.exitCode = 1
    })
}

function parseArgs(args) {
  const parsed = { sourceDirectory: '', runId: '', editedDraftPath: '' }
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index]
    const next = args[index + 1]
    if (current === '--source-dir') {
      parsed.sourceDirectory = next ?? ''
      index += 1
    } else if (current === '--run-id') {
      parsed.runId = next ?? ''
      index += 1
    } else if (current === '--edited-draft-path') {
      parsed.editedDraftPath = next ?? ''
      index += 1
    }
  }
  return parsed
}
