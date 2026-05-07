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
import { runHistoryReportRelevantHistory } from './history-report-relevant-history.js'

test('runHistoryReportRelevantHistory drafts and integrates all relevant history subsections', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Medical History\n- Developmental milestones were met on time.\n- I do not take medications.\n- I usually stay up late but fall asleep easily.\n- My mother has high blood pressure.\n- I live in a dorm during the school year and with family during breaks.\n\n## Educational History\n- Grades in school were A/B.\n- I have always struggled with time management and reading comprehension.\n- I am a student at USC and do not have accommodations.\n\n## Previous Evaluations\n- I have never had a neuropsychological evaluation before.\n- I had a couple intake sessions with a USC therapist.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Family History\n- Mom says she has provided reminders and accountability support\n\n## Emotional History\n- Last year she was more frustrated and overwhelmed\n- anxiety and overthinking have been longstanding\n\n## Social History\n- had playdates in childhood\n- group friendships easier than close one-on-one friendships\n\n## Education\n- received tutoring in early elementary school\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## RELEVANT HISTORY\n\nAll relevant history and background information were obtained through a neuropsychological history questionnaire completed by the patient, clinical interview with the patient, communications with collateral informants, and a review of available medical and academic records.\n\n### Medical and Developmental History\n\nMedical and developmental history are unremarkable.\n\n### Family History\n\nCLIENT was born in Los Angeles, California and is an only child. Her immediate family history is remarkable for high blood pressure.\n\n### Emotional/Behavioral History\n\nCLIENT endorsed lifelong challenges consistent of racing thoughts and rapid mood changes.\n\n### Social History\n\nThroughout her early development, CLIENT was noted to demonstrate appropriate play and social interests.\n\n### Educational and Occupational History\n\nPer self-report and academic records, CLIENT earned mostly As throughout her schooling.\n\n### Previous Evaluations\n\nCLIENT denied participating in any previous psychological or neuropsychological evaluations.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-07T20:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId, exemplarPath: path.join(docsDirectory, '2026-report.md') })

  const result = await runHistoryReportRelevantHistory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.equal(result.globalReview.pass, true)

  const draftMarkdown = await readFile(path.join(bootstrap.runRoot, '04-draft', 'relevant-history.draft.md'), 'utf8')
  assert.match(draftMarkdown, /## RELEVANT HISTORY/)
  assert.match(draftMarkdown, /### Medical and Developmental History/)
  assert.match(draftMarkdown, /### Family History/)
  assert.match(draftMarkdown, /### Psychosocial History/)
  assert.match(draftMarkdown, /### Educational and Occupational History/)
  assert.match(draftMarkdown, /### Previous Evaluations/)

  const provenanceMap = await readFile(path.join(bootstrap.runRoot, '04-draft', 'relevant-history.provenance-map.md'), 'utf8')
  assert.match(provenanceMap, /Relevant History Provenance Map/)

  const globalReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'relevant-history.global-review.json'), 'utf8'))
  assert.equal(globalReview.pass, true)
  assert.equal(globalReview.checks.integratedWithoutNewFacts, true)
})
