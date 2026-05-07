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
import { runHistoryReportDoctrineUpdates } from './history-report-doctrine-updates.js'

test('runHistoryReportDoctrineUpdates records corrections and emits doctrine proposals from clinician-edited draft', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n- Testing could provide some guidance as to how my brain functions.\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-08T00:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId, exemplarPath: path.join(docsDirectory, '2026-report.md') })
  await runHistoryReportPresentingSection({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const editedDraftPath = path.join(repoRoot, 'edited-presenting-information.md')
  await writeFile(
    editedDraftPath,
    `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old college student seeking an outpatient neuropsychological assessment in the context of longstanding concerns related to attention, time management, and concentration. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n\n### Presenting Complaints/Symptoms\n\nCLIENT endorsed difficulties with a variety of cognitive, sensory, and academic challenges. She described chronic inefficiency and reduced follow-through.\n`,
    'utf8'
  )

  const result = await runHistoryReportDoctrineUpdates({
    sourceDirectory,
    repoRoot,
    runId: bootstrap.runId,
    editedDraftPath
  })

  assert.ok(result.correctionCount > 0)
  assert.ok(result.proposalCount > 0)

  const proposals = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'doctrine-update-proposals.json'), 'utf8'))
  assert.ok(proposals.proposals.some((proposal) => proposal.kind === 'candidate_style_update'))

  const changeLog = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'doctrine-change-log.json'), 'utf8'))
  assert.equal(changeLog.requiresHumanPromotion, true)

  const markdown = await readFile(path.join(bootstrap.runRoot, '05-audit', 'doctrine-update-proposals.md'), 'utf8')
  assert.match(markdown, /Doctrine Update Proposals/)
})
