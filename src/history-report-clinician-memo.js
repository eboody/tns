import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportClinicianMemo({ sourceDirectory, repoRoot, runId }) {
  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)

  const claimsPayload = JSON.parse(await readFile(path.join(runRoot, '02-evidence', 'atomic-claims.json'), 'utf8'))
  const sectionPlan = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'section-plan.json'), 'utf8'))
  const governingProfile = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'governing-profile.json'), 'utf8'))
  const globalReview = JSON.parse(await readFile(path.join(runRoot, '05-audit', 'relevant-history.global-review.json'), 'utf8'))

  const memo = buildClinicianMemo({
    claims: claimsPayload.claims ?? [],
    sectionPlan,
    governingProfile,
    globalReview
  })

  await Promise.all([
    writeFile(path.join(runRoot, '05-audit', 'clinician-memo.json'), JSON.stringify(memo, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'clinician-memo.md'), renderClinicianMemoMarkdown(memo), 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    memoPath: path.join(runRoot, '05-audit', 'clinician-memo.md'),
    itemCount: memo.items.length
  }
}

function buildClinicianMemo({ claims, sectionPlan, governingProfile, globalReview }) {
  const items = []

  const conflictClaims = claims.filter((claim) => Array.isArray(claim.conflictCues) && claim.conflictCues.length > 0)
  for (const claim of conflictClaims.slice(0, 6)) {
    items.push(memoItem(
      'Source Conflicts',
      'Consider clarifying whether the chronology and visibility of these concerns were longstanding versus primarily more noticeable in college.',
      [claim.claimId],
      'warning'
    ))
  }

  const thinSections = (sectionPlan.sections ?? []).filter((section) => section.evidenceSufficiency === 'thin' || section.requiresClinicianConfirmation)
  for (const section of thinSections) {
    items.push(memoItem(
      'Missing Information',
      `It may be helpful to clarify whether additional history is needed for ${section.title.toLowerCase()} before finalizing the report.`,
      section.claimIds ?? [],
      'warning'
    ))
  }

  const quoteClaims = claims.filter((claim) => claim.quoteCandidate)
  if (quoteClaims.length > 0) {
    items.push(memoItem(
      'Style/Doctrine Underfit',
      'Worth clarifying whether the preserved phrase “just right” should remain as quoted language in the final report or be paraphrased more fully into house terminology.',
      quoteClaims.map((claim) => claim.claimId),
      'info'
    ))
  }

  const collateralClaims = claims.filter((claim) => claim.attributionMode === 'collateral_report')
  if (collateralClaims.length > 0) {
    items.push(memoItem(
      'Interpretation-Relevant Observations',
      'Consider clarifying how much weight should be given to maternal collateral describing long-standing rigidity, reminders, and emotional dysregulation when finalizing the developmental narrative.',
      collateralClaims.map((claim) => claim.claimId).slice(0, 8),
      'info'
    ))
  }

  if (governingProfile.requiresClinicianConfirmation) {
    items.push(memoItem(
      'Output Safety Flags',
      'It may be helpful to review whether the provisional style profile captures the intended terminology and sentence shape before relying on later draft iterations too heavily.',
      [],
      'warning'
    ))
  }

  if (!globalReview.pass) {
    items.push(memoItem(
      'Output Safety Flags',
      'Consider reviewing the global audit findings before the history draft is treated as near-final.',
      [],
      'warning'
    ))
  }

  if (items.length === 0) {
    items.push(memoItem(
      'Output Safety Flags',
      'No major memo items were generated from the current artifacts, though routine clinician review is still recommended.',
      [],
      'info'
    ))
  }

  return {
    title: 'Clinician Questions / Noteworthy Memo',
    tone: governingProfile.memoStyleRules?.preferredTone ?? 'clinician-native question-forward',
    items
  }
}

function memoItem(category, text, claimIds, severity) {
  return { category, text, claimIds, severity }
}

function renderClinicianMemoMarkdown(memo) {
  const lines = [`# ${memo.title}`, '', `- Tone: ${memo.tone}`, '']
  let currentCategory = null
  for (const item of memo.items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category
      lines.push(`## ${currentCategory}`, '')
    }
    lines.push(`- ${item.text}`)
    if (item.claimIds.length > 0) {
      lines.push(`  - Related claims: ${item.claimIds.join(', ')}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
