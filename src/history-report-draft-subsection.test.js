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
import { runHistoryReportDraftSubsection } from './history-report-draft-subsection.js'

test('runHistoryReportDraftSubsection creates a traceable reason-for-referral draft and passing reviews', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n- I need very specific conditions of quiet and light and space to focus.\n- This led me to recognizing I do things to the feeling of \"just right\".\n- Testing could provide some guidance as to how my brain functions.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- Mom says since grade school, wanted things to feel right\n- college demands made symptoms more noticeable\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'USC Student Health Referral.md'),
      `# USC Student Health Referral\n\n## Presenting Concerns\n- Referred to psychological testing\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment in the context of notable and long-standing difficulties with time-management, sensory sensitivities, and rigid adherence to routines. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-07T18:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.equal(result.evidenceReview.pass, true)
  assert.equal(result.styleReview.pass, true)

  const draftMarkdown = await readFile(path.join(bootstrap.runRoot, '04-draft', 'reason-for-referral.draft.md'), 'utf8')
  assert.match(draftMarkdown, /CLIENT is a 20-year-old college student/)
  assert.match(draftMarkdown, /The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care\./)

  const evidenceReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'reason-for-referral.evidence-review.json'), 'utf8'))
  assert.equal(evidenceReview.pass, true)

  const styleReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'reason-for-referral.style-review.json'), 'utf8'))
  assert.equal(styleReview.pass, true)
  assert.ok(styleReview.preferredTermHits.includes('diagnostic clarification'))
})
