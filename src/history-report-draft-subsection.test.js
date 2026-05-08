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
  assert.equal(result.coverageReview.pass, true)
  assert.equal(result.styleReview.pass, true)

  const draftMarkdown = await readFile(path.join(bootstrap.runRoot, '04-draft', 'reason-for-referral.draft.md'), 'utf8')
  assert.match(draftMarkdown, /CLIENT is a 20-year-old college student/)
  assert.match(draftMarkdown, /sensory sensitivities|sound, light, and texture/)
  assert.match(draftMarkdown, /rigid adherence to routines/)
  assert.match(draftMarkdown, /The purpose of this evaluation is to determine strengths and weaknesses and to assist with diagnostic clarification, treatment planning, and care\./)
  assert.doesNotMatch(draftMarkdown, /Additional factors contributing to referral included/)

  const evidenceReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'reason-for-referral.evidence-review.json'), 'utf8'))
  assert.equal(evidenceReview.pass, true)

  const coverageReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'reason-for-referral.coverage-review.json'), 'utf8'))
  assert.equal(coverageReview.pass, true)

  const coveragePack = JSON.parse(await readFile(path.join(bootstrap.runRoot, '04-draft', 'reason-for-referral.coverage-pack.json'), 'utf8'))
  assert.ok(coveragePack.items.some((item) => item.salience === 'required'))

  const styleReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'reason-for-referral.style-review.json'), 'utf8'))
  assert.equal(styleReview.pass, true)
  assert.ok(styleReview.preferredTermHits.includes('diagnostic clarification'))
})

test('runHistoryReportDraftSubsection keeps presenting-complaints detail and excludes unrelated repo markdown', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'docs')
  await mkdir(sourceDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Adult Neuropsychological Intake Questionnaire.md'),
      `# Intake Questionnaire\n\n## Presenting Concerns\n- I have always struggled with time management and am often late.\n- It often takes me longer to do things than other people.\n- I need very specific conditions of quiet and light and space to focus.\n- I hear everything, often down to the air-conditioning.\n- I used to struggle a lot with sensory issues in clothing.\n- Last year I recognized I do things to the feeling of \"just right\".\n- Depending on the class, I have a hard time focusing and absorbing content in class.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Intake Notes\n\n## Purpose of Eval\n- Elementary and middle and high school had to be on time for the bus\n- Late to get to dance class as a kid\n- TEXTURE- wouldn't wear certain things because uncomfortable (jeans for example)\n- In apt with air conditioning, the noise would make it hard to do work\n- LIGHT- always gravitating towards sunshine\n- Last year felt the need to shower every day and would be uncomfortable if didn't\n- Gets ready in a certain order\n- decorating a mantel and moving pieces until they look right\n- Didn't have enough time to prep for classes and could not finish assignments on time\n- Would always re-read sentences multiple times\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'USC Student Health Referral.md'),
      `# USC Student Health Referral\n\n## Presenting Concerns\n- Referred to psychological testing\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\n### Reason for Referral\n\nCLIENT is a 20-year-old, right-handed female who is seeking an outpatient neuropsychological assessment in the context of long-standing difficulties.\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'AGENTS.md'),
      `# Repo Instructions\n\n## Always Do\n- Run impact analysis before editing code.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({ sourceDirectory, repoRoot, now: new Date('2026-05-08T00:00:00.000Z') })
  await runHistoryReportInventory({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportEvidence({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportPlanning({ sourceDirectory, repoRoot, runId: bootstrap.runId })
  await runHistoryReportStyleProfile({ sourceDirectory, repoRoot, runId: bootstrap.runId })

  const result = await runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId: bootstrap.runId, subsectionId: 'presenting-complaints' })
  assert.equal(result.evidenceReview.pass, true)
  assert.equal(result.coverageReview.pass, true)
  assert.equal(result.styleReview.pass, true)

  const claimBank = JSON.parse(await readFile(path.join(bootstrap.runRoot, '04-draft', 'presenting-complaints.claim-bank.json'), 'utf8'))
  assert.ok(claimBank.approvedClaims.length >= 4)
  assert.equal(claimBank.approvedClaims.some((claim) => claim.claimId.startsWith('agents-md-claim-')), false)

  const coveragePack = JSON.parse(await readFile(path.join(bootstrap.runRoot, '04-draft', 'presenting-complaints.coverage-pack.json'), 'utf8'))
  assert.ok(coveragePack.items.some((item) => item.factKind === 'concrete_example'))

  const coverageReview = JSON.parse(await readFile(path.join(bootstrap.runRoot, '05-audit', 'presenting-complaints.coverage-review.json'), 'utf8'))
  assert.equal(coverageReview.pass, true)

  const draftMarkdown = await readFile(path.join(bootstrap.runRoot, '04-draft', 'presenting-complaints.draft.md'), 'utf8')
  assert.match(draftMarkdown, /beginning in early childhood/)
  assert.match(draftMarkdown, /dance classes/)
  assert.match(draftMarkdown, /air-conditioning/)
  assert.match(draftMarkdown, /jeans/)
  assert.match(draftMarkdown, /bright natural light/)
  assert.match(draftMarkdown, /shower every day|shower daily/)
  assert.match(draftMarkdown, /prepare for classes/)
  assert.match(draftMarkdown, /assignments on time|assignments by deadline/)
  assert.doesNotMatch(draftMarkdown, /Additional reported details included/)
})
