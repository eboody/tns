import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runHistoryReportDraftSubsection } from '../../../src/history-report-draft-subsection.js'

const options = parseArgs(process.argv.slice(2))

if (!options.sourceDirectory || !options.runId) {
  console.error('Usage: node .sandcastle/history-report/scripts/draft-subsection-run.mjs --source-dir "/absolute/source/dir" --run-id "20260507T131415Z" [--subsection-id "reason-for-referral"]')
  process.exitCode = 1
} else {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

  runHistoryReportDraftSubsection({
    sourceDirectory: options.sourceDirectory,
    repoRoot,
    runId: options.runId,
    subsectionId: options.subsectionId || 'reason-for-referral'
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
  const parsed = { sourceDirectory: '', runId: '', subsectionId: '' }
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index]
    const next = args[index + 1]
    if (current === '--source-dir') {
      parsed.sourceDirectory = next ?? ''
      index += 1
    } else if (current === '--run-id') {
      parsed.runId = next ?? ''
      index += 1
    } else if (current === '--subsection-id') {
      parsed.subsectionId = next ?? ''
      index += 1
    }
  }
  return parsed
}
