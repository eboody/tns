import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun } from './history-report-bootstrap.js'
import { runHistoryReportInventory } from './history-report-inventory.js'
import { runHistoryReportEvidence } from './history-report-evidence.js'
import { buildSectionPlan, classifyCase, runHistoryReportPlanning } from './history-report-planning.js'

test('classifyCase selects transition-age schema from age, college context, and parent collateral', () => {
  const claims = [
    claim('c1', 'referral_context', 'CLIENT is a 20-year-old college student at USC.', 'record_fact', ['college']),
    claim('c2', 'social_history', 'Mother reported longstanding support and reminders since grade school.', 'collateral_report', ['elementary_school']),
    claim('c3', 'educational_history', 'CLIENT currently lives in a dorm and is a junior in college.', 'self_report', ['college'])
  ]

  const classification = classifyCase(claims)

  assert.equal(classification.chronologicalAgeGroup, 'adult')
  assert.equal(classification.lifecycleSchema, 'transition_age_young_adult')
  assert.equal(classification.collateralDependenceProfile, 'mixed_self_and_collateral')
  assert.equal(classification.historySchema, 'transition_age_emotional_behavioral_plus_social')
})

test('classifyCase selects child schema and collateral-heavy profile when age and collateral dominate', () => {
  const claims = [
    claim('c1', 'referral_context', 'CLIENT is a 12-year-old student.', 'record_fact', []),
    claim('c2', 'social_history', 'Parents reported social struggles since early childhood.', 'collateral_report', ['early_childhood']),
    claim('c3', 'emotional_behavioral_history', 'Mother described behavioral dysregulation and anxiety.', 'collateral_report', ['early_childhood']),
    claim('c4', 'educational_history', 'Teacher reported classroom support needs.', 'collateral_report', ['elementary_school'])
  ]

  const classification = classifyCase(claims)

  assert.equal(classification.chronologicalAgeGroup, 'child')
  assert.equal(classification.lifecycleSchema, 'child')
  assert.equal(classification.collateralDependenceProfile, 'collateral_heavy')
  assert.equal(classification.educationWorkMode, 'child_educational_only')
})

test('buildSectionPlan assigns primary section homes and marks thin required sections', () => {
  const claims = [
    claim('c1', 'referral_context', 'CLIENT is a 30-year-old adult seeking evaluation.', 'record_fact', []),
    claim('c2', 'presenting_concerns', 'CLIENT described longstanding attention difficulties.', 'self_report', ['lifelong']),
    claim('c3', 'family_history', 'Immediate family history is remarkable for high blood pressure.', 'self_report', []),
    claim('c4', 'previous_evaluations', 'CLIENT denied prior psychological evaluations.', 'self_report', [])
  ]
  const classification = classifyCase(claims)
  const sectionPlan = buildSectionPlan({ claims, classification })

  const presentingAssignment = sectionPlan.assignments.find((assignment) => assignment.claimId === 'c2')
  assert.equal(presentingAssignment.primarySectionId, 'presenting-complaints')
  assert.equal(presentingAssignment.salience, 'foreground')

  const thinSection = sectionPlan.sections.find((section) => section.id === 'educational-occupational-history')
  assert.equal(thinSection.evidenceSufficiency, 'thin')
  assert.equal(thinSection.requiresClinicianConfirmation, true)
})

test('runHistoryReportPlanning writes classification and section-plan artifacts', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  await mkdir(sourceDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- CLIENT is a 20-year-old college student.\n- I have always struggled with time management.\n\n## Educational History\n- USC junior living in a dorm.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- Mom says since grade school, wanted things to feel right\n- CLIENT is an only child\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({
    sourceDirectory,
    repoRoot,
    now: new Date('2026-05-07T16:00:00.000Z')
  })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  assert.equal(result.classification.lifecycleSchema, 'transition_age_young_adult')

  const classification = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'case-classification.json'), 'utf8'))
  const sectionPlan = JSON.parse(await readFile(path.join(bootstrap.runRoot, '03-derived', 'section-plan.json'), 'utf8'))
  assert.equal(classification.collateralDependenceProfile, 'mixed_self_and_collateral')
  assert.ok(sectionPlan.sections.some((section) => section.id === 'emotional-behavioral-history'))
  assert.ok(sectionPlan.assignments.length > 0)

  const planMarkdown = await readFile(path.join(bootstrap.runRoot, '03-derived', 'section-plan.md'), 'utf8')
  assert.match(planMarkdown, /Transition-age schema selected/)
})

function claim(claimId, claimCategory, claimText, attributionMode, chronology) {
  return {
    claimId,
    claimCategory,
    claimText,
    attributionMode,
    chronology,
    eligibleForHistoryDraft: true
  }
}
