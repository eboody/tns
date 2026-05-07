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

test('runHistoryReportStyleProfile compiles governing profile artifacts from exemplar and planning state', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  const docsDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)
  await mkdir(docsDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n\n## Educational History\n- USC junior living in a dorm.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- Mom says since grade school, wanted things to feel right\n`,
      'utf8'
    ),
    writeFile(
      path.join(docsDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment in the context of long-standing difficulties with time-management. The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care.\n\n### Presenting Complaints/Symptoms\n\nCLIENT endorsed notable cognitive challenges related to attention and concentration. Specifically, she described long-standing difficulties with rigid adherence to routines and things feeling “just right.”\n\n### Medical and Developmental History\n\nMedical and developmental history are unremarkable. Vision and hearing are reportedly within normal limits.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-07T17:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.equal(result.requiresClinicianConfirmation, true)

  const governingProfile = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'governing-profile.json'), 'utf8'))
  assert.equal(governingProfile.classification.lifecycleSchema, 'transition_age_young_adult')
  assert.equal(governingProfile.requiresClinicianConfirmation, true)
  assert.ok(governingProfile.styleProfile.paragraphConstruction.commonOpenings.includes('CLIENT is'))
  assert.ok(governingProfile.houseLexicon.global.terms.some((rule) => rule.preferredTerm === 'endorsed'))
  assert.equal(governingProfile.quoteRules.observedInExemplar, true)
  assert.ok(governingProfile.antiStyleRules.disallowedTerms.includes('the corpus suggests'))

  const styleMarkdown = await readFile(path.join(bootstrap.runRoot, '03-derived', 'style-profile.md'), 'utf8')
  assert.match(styleMarkdown, /Requires Clinician Confirmation: `true`/)
  assert.match(styleMarkdown, /avoid: the corpus suggests/)
})
