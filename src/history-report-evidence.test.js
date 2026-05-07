import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun } from './history-report-bootstrap.js'
import { runHistoryReportInventory } from './history-report-inventory.js'
import { annotateCandidateContent, deriveAtomicClaims, runHistoryReportEvidence } from './history-report-evidence.js'

test('annotateCandidateContent marks clinician note differentials and recommendations as non-history fragments', () => {
  const candidate = {
    path: '/tmp/Deidentified - Intake Notes (SH) Adult.md',
    relativePath: 'Deidentified - Intake Notes (SH) Adult.md',
    documentKind: 'clinician_intake_notes',
    hierarchyRole: 'hierarchy 1: clinician-authored intake note',
    sourceUnits: [
      { unitId: 'notes::1', title: 'Recommendations', startLine: 1, endLine: 3 },
      { unitId: 'notes::2', title: 'Dx Differentials', startLine: 4, endLine: 6 },
      { unitId: 'notes::3', title: 'Purpose of Eval', startLine: 7, endLine: 9 }
    ]
  }
  const content = `- Sleep hygiene\n- Emotional reg strategies\n\n- ADHD\n- OCD\n\n- Mom says since grade school, wanted things to feel right\n`

  const annotation = annotateCandidateContent(candidate, content)
  const claims = deriveAtomicClaims(annotation.segments, candidate)

  assert.equal(annotation.segments[0].noteFragmentClass, 'recommendation_idea')
  assert.equal(annotation.segments[2].noteFragmentClass, 'diagnostic_hypothesis')
  assert.equal(annotation.segments[4].noteFragmentClass, 'collateral_summary')
  assert.equal(claims[0].eligibleForHistoryDraft, false)
  assert.equal(claims[4].attributionMode, 'collateral_report')
})

test('runHistoryReportEvidence writes segment annotations, atomic claims, and evidence sheets', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  await mkdir(sourceDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- I have always struggled with time management.\n- I need things to feel “just right.”\n\n## Family History\n- My father probably has the same behaviors.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Deidentified - Intake Notes (SH) Adult\n\nSource: packet\n_Converted from DOCX; some formatting may be simplified._\n\n## Dx Differentials\n- ADHD\n- OCD\n\n## Purpose of Eval\n- Mom says since grade school, wanted things to feel right\n- Last year felt the need to shower every day\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'USC Student Health Referral.md'),
      `# USC Student Health Referral\n\n## Presenting Concerns\n- Referred to psychological testing\n- College attention concerns\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({
    sourceDirectory,
    repoRoot,
    now: new Date('2026-05-07T15:00:00.000Z')
  })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  assert.ok(result.segmentCount > 0)
  assert.ok(result.claimCount > 0)

  const claims = JSON.parse(await readFile(path.join(bootstrap.runRoot, '02-evidence', 'atomic-claims.json'), 'utf8'))
  const segments = JSON.parse(await readFile(path.join(bootstrap.runRoot, '02-evidence', 'segment-annotations.json'), 'utf8'))

  const differentialClaim = claims.claims.find((claim) => claim.claimText === 'ADHD')
  assert.equal(differentialClaim.noteFragmentClass, 'diagnostic_hypothesis')
  assert.equal(differentialClaim.eligibleForHistoryDraft, false)

  const collateralClaim = claims.claims.find((claim) => claim.claimText.includes('Mom says since grade school'))
  assert.equal(collateralClaim.attributionMode, 'collateral_report')
  assert.ok(collateralClaim.chronology.includes('elementary_school'))

  const quoteClaim = claims.claims.find((claim) => claim.quoteCandidate)
  assert.ok(quoteClaim)

  assert.ok(segments.segments.some((segment) => segment.conflictCues.length === 0 || Array.isArray(segment.conflictCues)))

  const evidenceSheet = await readFile(path.join(bootstrap.runRoot, '02-evidence', 'deidentified-intake-notes-sh-adult-md.md'), 'utf8')
  assert.match(evidenceSheet, /diagnostic_hypothesis/)
  assert.match(evidenceSheet, /collateral_report/)
})
