import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun } from './history-report-bootstrap.js'
import { runHistoryReportInventory } from './history-report-inventory.js'
import { runHistoryReportEvidence } from './history-report-evidence.js'
import { buildTimeManagementExecutiveMemo, runHistoryReportDomainTimeManagement } from './history-report-domain-time-management.js'

test('buildTimeManagementExecutiveMemo preserves chronology, examples, and current burden', () => {
  const memo = buildTimeManagementExecutiveMemo([
    {
      factId: 'fact-1',
      rawText: 'I have always struggled with time management and am often late.',
      normalizedMeaning: 'I have always struggled with time management and am often late.',
      domainCandidates: ['time_management_executive'],
      factRole: 'core_concern',
      chronology: ['lifelong'],
      specificityScore: 1,
      eligibleForHistoryDraft: true
    },
    {
      factId: 'fact-2',
      rawText: 'Elementary and middle and high school had to be on time for the bus',
      normalizedMeaning: 'Elementary and middle and high school had to be on time for the bus',
      domainCandidates: ['time_management_executive'],
      factRole: 'concrete_example',
      chronology: ['elementary_school', 'secondary_school'],
      specificityScore: 3,
      eligibleForHistoryDraft: true
    },
    {
      factId: 'fact-3',
      rawText: 'Didn’t have enough time to prep for classes and could not finish assignments on time',
      normalizedMeaning: 'Did not have enough time to prep for classes and could not finish assignments on time',
      domainCandidates: ['time_management_executive'],
      factRole: 'current_impact',
      chronology: ['college', 'recent_or_current'],
      specificityScore: 3,
      eligibleForHistoryDraft: true
    }
  ])

  assert.match(memo.supportedPattern, /time-management inefficiency/)
  assert.match(memo.developmentalCourse, /school bus/)
  assert.match(memo.currentManifestation, /prepare for classes|assignments on time/)
  assert.ok(memo.concreteExamples.length > 0)
})

test('runHistoryReportDomainTimeManagement writes a reusable domain memo artifact', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  await mkdir(sourceDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- I have always struggled with time management and am often late.\n- It often takes me longer to do things than other people.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- Elementary and middle and high school had to be on time for the bus\n- Late to get to dance class as a kid\n- Didn't have enough time to prep for classes and could not finish assignments on time\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-08T04:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportDomainTimeManagement({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.ok(result.evidenceCount > 0)

  const memo = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'domain-memo.time-management-executive.json'), 'utf8'))
  assert.equal(memo.domainId, 'time-management-executive')
  assert.match(memo.developmentalCourse, /school bus|dance classes/)
  assert.match(memo.currentManifestation, /prepare for classes|assignments on time/)
})
