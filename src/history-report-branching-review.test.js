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
import { runHistoryReportBranchingReview } from './history-report-branching-review.js'

test('runHistoryReportBranchingReview emits conflict and continuity artifacts and escalates core conflicts', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- These concerns have kind of always been the case.\n- Testing could provide some guidance as to how my brain functions.\n\n## Previous Evaluations\n- I have never had a neuropsychological evaluation before.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- mostly now, not very noticeable before\n- college demands made symptoms more noticeable\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n\n## RELEVANT HISTORY\n\n### Previous Evaluations\n\nCLIENT denied participating in any previous psychological or neuropsychological evaluations.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-07T23:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId, exemplarPath: path.join(docsDirectory, '2026-report.md') })
  await runHistoryReportPresentingSection({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportRelevantHistory({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportBranchingReview({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.equal(result.branchReview.conflictHeavy, true)
  assert.equal(result.branchReview.requiresClinicianConfirmation, true)

  const conflictRegister = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'conflict-register.json'), 'utf8'))
  assert.ok(conflictRegister.entries.some((entry) => entry.conflictType === 'core_framing_conflict'))

  const continuityRegister = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'continuity-change-register.json'), 'utf8'))
  assert.ok(continuityRegister.entries.length > 0)

  const branchingReview = await readFile(path.join(bootstrap.runRoot, '05-audit', 'branching-review.md'), 'utf8')
  assert.match(branchingReview, /Conflict-heavy: true/)
  assert.match(branchingReview, /Requires clinician confirmation: true/)
})
