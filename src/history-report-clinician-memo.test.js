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

test('runHistoryReportClinicianMemo emits clinician-native memo categories and related claims', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n- Testing could provide some guidance as to how my brain functions.\n- This led me to recognizing I do things to the feeling of \"just right\".\n\n## Educational History\n- I am a student at USC and do not have accommodations.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Emotional History\n- mostly now, but some concerns were always there\n- Mom says since grade school, wanted things to feel right\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment in the context of notable and long-standing difficulties with time-management. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n\n## RELEVANT HISTORY\n\n### Psychosocial History\n\nCurrently, CLIENT described...\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-07T22:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId, exemplarPath: path.join(docsDirectory, '2026-report.md') })
  await runHistoryReportPresentingSection({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportRelevantHistory({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportClinicianMemo({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.ok(result.itemCount > 0)

  const memoMarkdown = await readFile(path.join(bootstrap.runRoot, '05-audit', 'clinician-memo.md'), 'utf8')
  assert.match(memoMarkdown, /## Source Conflicts/)
  assert.match(memoMarkdown, /## Style\/Doctrine Underfit/)
  assert.match(memoMarkdown, /## Interpretation-Relevant Observations/)

  const memoJson = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'clinician-memo.json'), 'utf8'))
  assert.ok(memoJson.items.some((item) => item.category === 'Source Conflicts'))
  assert.ok(memoJson.items.some((item) => item.category === 'Style/Doctrine Underfit'))
})
