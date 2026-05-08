import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.sourceDirectory) {
    printUsage()
    process.exitCode = 1
    return
  }

  const sourceDirectory = path.resolve(options.sourceDirectory)
  const exemplarPath = options.exemplarPath ? path.resolve(options.exemplarPath) : path.join(repoRoot, 'docs', '2026-report.md')

  const bootstrap = runNodeScript('.sandcastle/history-report/scripts/bootstrap-run.mjs', ['--source-dir', sourceDirectory])
  const { runId, caseRoot, runRoot } = JSON.parse(bootstrap.stdout)

  runNodeScript('.sandcastle/history-report/scripts/inventory-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/evidence-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/planning-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/style-profile-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId, '--exemplar-path', exemplarPath])
  runNodeScript('.sandcastle/history-report/scripts/presenting-section-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/relevant-history-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/clinician-memo-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])
  runNodeScript('.sandcastle/history-report/scripts/branching-review-run.mjs', ['--source-dir', sourceDirectory, '--run-id', runId])

  const finalize = runNodeScriptInline(
    `import { finalizeHistoryReport } from './src/history-report-finalize.js';\n` +
      `const result = await finalizeHistoryReport({ sourceDirectory: ${JSON.stringify(sourceDirectory)}, repoRoot: ${JSON.stringify(repoRoot)}, runId: ${JSON.stringify(runId)} });\n` +
      `console.log(JSON.stringify(result, null, 2));`
  )

  const finalized = JSON.parse(finalize.stdout)
  printSummary({ sourceDirectory, exemplarPath, runId, caseRoot, runRoot, finalized })
}

function parseArgs(args) {
  const parsed = { sourceDirectory: '', exemplarPath: '' }
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index]
    const next = args[index + 1]
    if (current === '--source-dir') {
      parsed.sourceDirectory = next ?? ''
      index += 1
    } else if (current === '--exemplar-path') {
      parsed.exemplarPath = next ?? ''
      index += 1
    }
  }
  return parsed
}

function runNodeScript(relativeScriptPath, args) {
  const result = spawnSync('node', [path.join(repoRoot, relativeScriptPath), ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Script failed: ${relativeScriptPath}`)
  }
  return result
}

function runNodeScriptInline(code) {
  const result = spawnSync('node', ['--input-type=module', '-e', code], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Inline script failed')
  }
  return result
}

function printSummary({ sourceDirectory, exemplarPath, runId, caseRoot, runRoot, finalized }) {
  console.log('History-report run complete.')
  console.log('')
  console.log(`Source dir: ${sourceDirectory}`)
  console.log(`Style exemplar: ${exemplarPath}`)
  console.log(`Run ID: ${runId}`)
  console.log(`Case root: ${caseRoot}`)
  console.log(`Run root: ${runRoot}`)
  console.log('')
  console.log('Main outputs:')
  console.log(`- History report: ${finalized.historyPath}`)
  console.log(`- Clinician packet: ${finalized.packetPath}`)
  console.log(`- Governing profile: ${path.join(runRoot, '03-derived', 'governing-profile.json')}`)
}

function printUsage() {
  console.log('Usage: npm run history:run -- --source-dir "/absolute/path/to/markdown-folder" [--exemplar-path "/absolute/path/to/2026-report.md"]')
}

await main()
