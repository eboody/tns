import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportBranchingReview({ sourceDirectory, repoRoot, runId }) {
  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)

  const claimsPayload = JSON.parse(await readFile(path.join(runRoot, '02-evidence', 'atomic-claims.json'), 'utf8'))
  const claims = claimsPayload.claims ?? []

  const conflictRegister = buildConflictRegister(claims)
  const continuityChangeRegister = buildContinuityChangeRegister(claims)
  const branchReview = buildBranchReview({ conflictRegister, continuityChangeRegister })

  await Promise.all([
    writeFile(path.join(runRoot, '03-derived', 'conflict-register.json'), JSON.stringify(conflictRegister, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '03-derived', 'continuity-change-register.json'), JSON.stringify(continuityChangeRegister, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'branching-review.json'), JSON.stringify(branchReview, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'branching-review.md'), renderBranchingReviewMarkdown(branchReview), 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    branchReview
  }
}

function buildConflictRegister(claims) {
  const entries = []
  for (const claim of claims) {
    if (!Array.isArray(claim.conflictCues) || claim.conflictCues.length === 0) continue
    const conflictType = claim.conflictCues.includes('onset_visibility_tension') ? 'core_framing_conflict' : 'material_narratable_conflict'
    const recommendedHandling = conflictType === 'core_framing_conflict'
      ? 'require_clinician_confirmation_before_final_packaging'
      : 'narrate_conservatively_and_surface_in_memo'
    entries.push({
      claimId: claim.claimId,
      conflictType,
      cues: claim.conflictCues,
      recommendedHandling,
      severity: conflictType === 'core_framing_conflict' ? 'blocking' : 'warning'
    })
  }
  return { entries }
}

function buildContinuityChangeRegister(claims) {
  const entries = []
  for (const claim of claims) {
    const chronology = claim.chronology ?? []
    if (chronology.includes('lifelong') || chronology.includes('early_childhood')) {
      entries.push({
        claimId: claim.claimId,
        continuityType: 'longstanding_pattern',
        chronology,
        attributionMode: claim.attributionMode
      })
      continue
    }

    if (chronology.includes('college') || chronology.includes('recent_or_current')) {
      entries.push({
        claimId: claim.claimId,
        continuityType: 'recent_intensification_or_current_context',
        chronology,
        attributionMode: claim.attributionMode
      })
    }
  }
  return { entries }
}

function buildBranchReview({ conflictRegister, continuityChangeRegister }) {
  const blockingConflicts = conflictRegister.entries.filter((entry) => entry.severity === 'blocking')
  const priorEvalHeavy = continuityChangeRegister.entries.some((entry) => entry.attributionMode === 'prior_eval_finding')
  const conflictHeavy = blockingConflicts.length > 0 || conflictRegister.entries.length >= 4

  return {
    priorEvalHeavy,
    conflictHeavy,
    requiresClinicianConfirmation: priorEvalHeavy || blockingConflicts.length > 0,
    stopReason:
      blockingConflicts.length > 0
        ? 'core chronology/onset conflicts require clinician confirmation before final packaging'
        : priorEvalHeavy
          ? 'prior evaluation findings require continuity/change review before final packaging'
          : null,
    summary: {
      conflictEntryCount: conflictRegister.entries.length,
      blockingConflictCount: blockingConflicts.length,
      continuityEntryCount: continuityChangeRegister.entries.length
    }
  }
}

function renderBranchingReviewMarkdown(branchReview) {
  return [
    '# Branching Review',
    '',
    `- Prior-eval-heavy: ${branchReview.priorEvalHeavy}`,
    `- Conflict-heavy: ${branchReview.conflictHeavy}`,
    `- Requires clinician confirmation: ${branchReview.requiresClinicianConfirmation}`,
    branchReview.stopReason ? `- Stop reason: ${branchReview.stopReason}` : '- Stop reason: none',
    '',
    '## Summary',
    '',
    `- Conflict entries: ${branchReview.summary.conflictEntryCount}`,
    `- Blocking conflicts: ${branchReview.summary.blockingConflictCount}`,
    `- Continuity entries: ${branchReview.summary.continuityEntryCount}`,
    ''
  ].join('\n')
}
