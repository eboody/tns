import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun, createRunId, deriveCaseId } from './history-report-bootstrap.js'

test('deriveCaseId normalizes directory names into stable slugs', () => {
  assert.equal(deriveCaseId('/tmp/Docs for Eran(1)'), 'docs-for-eran-1')
  assert.equal(deriveCaseId('/tmp/__Case__'), 'case')
})

test('createRunId emits Sandcastle-friendly UTC timestamps', () => {
  assert.equal(createRunId(new Date('2026-05-07T13:14:15.999Z')), '20260507T131415Z')
})

test('bootstrapHistoryReportRun creates a stable run workspace and writes seed artifacts', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  await mkdir(sourceDirectory)

  const candidateA = path.join(sourceDirectory, 'intake-notes.md')
  const candidateB = path.join(sourceDirectory, 'report.md')
  await Promise.all([
    writeText(candidateA, '# Intake Notes\n'),
    writeText(candidateB, '# Existing Report\n')
  ])

  const result = await bootstrapHistoryReportRun({
    sourceDirectory,
    repoRoot,
    now: new Date('2026-05-07T13:14:15.000Z')
  })

  assert.equal(result.caseId, 'docs-for-eran-1')
  assert.equal(result.runId, '20260507T131415Z')
  assert.deepEqual(result.discoveredMarkdownCandidates, ['intake-notes.md', 'report.md'])

  const brief = JSON.parse(await readFile(path.join(result.runRoot, '00-brief', 'report-brief.json'), 'utf8'))
  assert.equal(brief.caseId, 'docs-for-eran-1')
  assert.equal(brief.sourceAdmissionStatus, 'pending inventory')

  const privacy = JSON.parse(await readFile(path.join(result.runRoot, '00-brief', 'input-privacy-assumption.json'), 'utf8'))
  assert.equal(privacy.deidentificationAssumed, true)
  assert.equal(privacy.workflowDoesNotVerifyIdentifiers, true)

  const registry = JSON.parse(await readFile(path.join(result.runRoot, '01-inventory', 'source-registry.json'), 'utf8'))
  assert.equal(registry.status, 'pending_inventory')
  assert.equal(registry.discoveredMarkdownCandidates.length, 2)

  const ralphPrd = JSON.parse(await readFile(path.join(repoRoot, 'ralph', 'prd.json'), 'utf8'))
  assert.equal(ralphPrd.length, 11)
  assert.equal(ralphPrd[0].passes, true)

  const progress = await readFile(path.join(repoRoot, 'ralph', 'progress.md'), 'utf8')
  assert.match(progress, /#70 Bootstrap repo-local Sandcastle history-report run/)

  const latestApproved = await readFile(path.join(result.caseRoot, 'approved', 'latest.md'), 'utf8')
  assert.equal(latestApproved, '<!-- no approved report yet -->\n')
})

async function writeText(filePath, value) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, value, 'utf8')
}
