import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const docsDirectory = path.join(repoRoot, 'docs')
const fixtureDirectory = path.join(repoRoot, 'docs', 'Docs for Eran(1)')

const allowedMarkdownFiles = [
  'Deidentified - Adult Neuropsychological Intake Questionnaire.md',
  'Deidentified - Intake Notes (SH) Adult.md',
  'USC Student Health Referral.md',
  'Deidentified Archer Middle School Transcript.md',
  'Deidentified High School Final Transcript.md',
  'Deidentified USC Transcript.md'
]

async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'tns-history-report-'))
  const sourceDirectory = path.join(tempRoot, 'docs-for-eran-1')
  await mkdir(sourceDirectory, { recursive: true })

  try {
    await copyFixtureMarkdown(sourceDirectory)

    const bootstrap = runNodeScript('.sandcastle/history-report/scripts/bootstrap-run.mjs', [
      '--source-dir',
      sourceDirectory
    ])

    const { runId, caseRoot, runRoot } = JSON.parse(bootstrap.stdout)

    runNodeScript('.sandcastle/history-report/scripts/inventory-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/evidence-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/planning-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/style-profile-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/draft-subsection-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId,
      '--subsection-id',
      'reason-for-referral'
    ])

    runNodeScript('.sandcastle/history-report/scripts/presenting-section-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/relevant-history-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/clinician-memo-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    runNodeScript('.sandcastle/history-report/scripts/branching-review-run.mjs', [
      '--source-dir',
      sourceDirectory,
      '--run-id',
      runId
    ])

    printSummary({ sourceDirectory, caseRoot, runRoot, runId })
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  } finally {
    if (process.env.KEEP_HISTORY_REPORT_FIXTURE !== '1') {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
}

async function copyFixtureMarkdown(destinationDirectory) {
  const available = new Set(await readdir(docsDirectory))

  for (const fileName of allowedMarkdownFiles) {
    if (!available.has(fileName)) {
      throw new Error(`Required fixture markdown file is missing: ${fileName}`)
    }

    await cp(path.join(docsDirectory, fileName), path.join(destinationDirectory, fileName))
  }
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

function printSummary({ sourceDirectory, caseRoot, runRoot, runId }) {
  console.log('History-report test run complete.')
  console.log('')
  console.log(`Fixture source dir: ${sourceDirectory}`)
  console.log(`Fixture reference dir: ${fixtureDirectory}`)
  console.log(`Run ID: ${runId}`)
  console.log(`Case root: ${caseRoot}`)
  console.log(`Run root: ${runRoot}`)
  console.log('')
  console.log('Inspect these artifacts:')
  console.log(`- ${path.join(runRoot, '01-inventory', 'source-inventory.md')}`)
  console.log(`- ${path.join(runRoot, '02-evidence', 'atomic-claims.json')}`)
  console.log(`- ${path.join(runRoot, '03-derived', 'case-classification.json')}`)
  console.log(`- ${path.join(runRoot, '03-derived', 'section-plan.md')}`)
  console.log(`- ${path.join(runRoot, '03-derived', 'governing-profile.json')}`)
  console.log(`- ${path.join(runRoot, '04-draft', 'reason-for-referral.draft.md')}`)
  console.log(`- ${path.join(runRoot, '04-draft', 'presenting-information.draft.md')}`)
  console.log(`- ${path.join(runRoot, '04-draft', 'relevant-history.draft.md')}`)
  console.log(`- ${path.join(runRoot, '05-audit', 'clinician-memo.md')}`)
  console.log(`- ${path.join(runRoot, '05-audit', 'branching-review.md')}`)
  console.log('')
  console.log('Set KEEP_HISTORY_REPORT_FIXTURE=1 if you want to keep the copied input folder under /tmp.')
}

await main()
