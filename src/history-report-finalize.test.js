import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun } from './history-report-bootstrap.js'
import { runHistoryReportInventory } from './history-report-inventory.js'
import { runHistoryReportEvidence } from './history-report-evidence.js'
import { runHistoryReportPlanning } from './history-report-planning.js'
import { runHistoryReportStyleProfile } from './history-report-style-profile.js'
import { runHistoryReportPresentingSection } from './history-report-presenting-section.js'
import { runHistoryReportRelevantHistory } from './history-report-relevant-history.js'
import { runHistoryReportClinicianMemo } from './history-report-clinician-memo.js'
import { runHistoryReportBranchingReview } from './history-report-branching-review.js'
import { finalizeHistoryReport } from './history-report-finalize.js'

test('finalizeHistoryReport writes combined history and clinician packet outputs', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'), `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n- Testing could provide some guidance as to how my brain functions.\n\n## Educational History\n- I am a student at USC and do not have accommodations.\n`, 'utf8'),
    writeFile(path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'), `# Intake Notes\n\n## Social History\n- had playdates in childhood\n`, 'utf8'),
    writeFile(path.join(docsDirectory, '2026-report.md'), `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n\n## RELEVANT HISTORY\n\n### Social History\n\nThroughout her early development...\n`, 'utf8')
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-08T01:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId, exemplarPath: path.join(docsDirectory, '2026-report.md') })
  await runHistoryReportPresentingSection({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportRelevantHistory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportClinicianMemo({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportBranchingReview({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await finalizeHistoryReport({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  const history = await readFile(result.historyPath, 'utf8')
  const packet = await readFile(result.packetPath, 'utf8')

  assert.match(history, /# History Section Report/)
  assert.match(history, /## PRESENTING INFORMATION\/REASON FOR REFERRAL/)
  assert.match(history, /## RELEVANT HISTORY/)
  assert.match(packet, /# Clinician Review Packet/)
  assert.match(packet, /# Clinician Questions \/ Noteworthy Memo/)
})
