import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportPlanning({ sourceDirectory, repoRoot, runId }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const claimsPayload = JSON.parse(await readFile(path.join(runRoot, '02-evidence', 'atomic-claims.json'), 'utf8'))
  const claims = claimsPayload.claims ?? []

  const classification = classifyCase(claims)
  const sectionPlan = buildSectionPlan({ claims, classification })

  await Promise.all([
    writeJson(path.join(runRoot, '03-derived', 'case-classification.json'), classification),
    writeJson(path.join(runRoot, '03-derived', 'section-plan.json'), sectionPlan),
    writeFile(path.join(runRoot, '03-derived', 'case-classification.md'), createClassificationMarkdown(classification), 'utf8'),
    writeFile(path.join(runRoot, '03-derived', 'section-plan.md'), createSectionPlanMarkdown(sectionPlan), 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    classification,
    sectionCount: sectionPlan.sections.length,
    assignedClaimCount: sectionPlan.assignments.length
  }
}

export function classifyCase(claims) {
  const eligibleClaims = claims.filter((claim) => claim.eligibleForHistoryDraft)
  const age = inferAgeFromClaims(eligibleClaims)
  const hasCollegeContext = eligibleClaims.some((claim) => /college|usc|dorm|freshman|junior|student/i.test(claim.claimText))
  const hasParentCollateral = eligibleClaims.some((claim) => claim.attributionMode === 'collateral_report' && /(mother|mom|parent)/i.test(claim.claimText))
  const collateralCount = eligibleClaims.filter((claim) => claim.attributionMode === 'collateral_report').length
  const selfReportCount = eligibleClaims.filter((claim) => claim.attributionMode === 'self_report').length
  const chronologicalAgeGroup = age !== null && age <= 17 ? 'child' : 'adult'

  let lifecycleSchema = chronologicalAgeGroup
  if (chronologicalAgeGroup === 'adult' && age !== null && age <= 25 && (hasCollegeContext || hasParentCollateral)) {
    lifecycleSchema = 'transition_age_young_adult'
  }

  const collateralDependenceProfile =
    collateralCount === 0
      ? 'self_report_primary'
      : collateralCount >= Math.max(3, selfReportCount)
        ? 'collateral_heavy'
        : 'mixed_self_and_collateral'

  const historySchema =
    lifecycleSchema === 'child'
      ? 'child_standard_combined_behavioral_social'
      : lifecycleSchema === 'transition_age_young_adult'
        ? 'transition_age_emotional_behavioral_plus_social'
        : 'adult_standard'

  return {
    ageYears: age,
    chronologicalAgeGroup,
    lifecycleSchema,
    collateralDependenceProfile,
    historySchema,
    presentingSectionMode: chronologicalAgeGroup === 'child' ? 'child_reason_only_embedded_concerns_in_history' : 'adult_reason_plus_presenting_complaints',
    developmentalMedicalMode:
      chronologicalAgeGroup === 'child' ? 'child_split_birth_developmental_and_medical' : 'adult_combined_developmental_medical',
    educationWorkMode:
      chronologicalAgeGroup === 'child' ? 'child_educational_only' : lifecycleSchema === 'transition_age_young_adult' ? 'transition_age_educational_primary_with_limited_occupational' : 'adult_educational_and_occupational',
    requiresClinicianConfirmation: age === null,
    rationale: buildClassificationRationale({ age, lifecycleSchema, hasCollegeContext, hasParentCollateral, collateralDependenceProfile })
  }
}

export function buildSectionPlan({ claims, classification }) {
  const sections = sectionTemplatesForClassification(classification)
  const assignments = []

  for (const claim of claims) {
    const primarySectionId = assignPrimarySection(claim, classification)
    const salience = inferSalience(claim)
    const chronologyBucket = primaryChronologyBucket(claim.chronology)
    assignments.push({
      claimId: claim.claimId,
      primarySectionId,
      candidateSectionIds: candidateSectionsForClaim(claim, classification),
      salience,
      chronologyBucket,
      missingnessMode: salience === 'exclude' ? 'omitted' : 'draftable',
      attributionMode: claim.attributionMode
    })
  }

  const plannedSections = sections.map((section) => {
    const sectionAssignments = assignments.filter((assignment) => assignment.primarySectionId === section.id)
    return {
      ...section,
      claimIds: sectionAssignments.map((assignment) => assignment.claimId),
      evidenceSufficiency: sectionAssignments.length > 0 ? 'supported' : 'thin',
      requiresClinicianConfirmation: sectionAssignments.length === 0 && section.required
    }
  })

  return {
    classification,
    sections: plannedSections,
    assignments,
    sectionNotes: buildSectionNotes(plannedSections, classification)
  }
}

function inferAgeFromClaims(claims) {
  for (const claim of claims) {
    const matches = claim.claimText.match(/\b(\d{1,2})\s*[- ]?year[- ]old\b/i) || claim.claimText.match(/\b(\d{1,2})year old\b/i)
    if (matches) {
      return Number(matches[1])
    }
  }

  return null
}

function buildClassificationRationale({ age, lifecycleSchema, hasCollegeContext, hasParentCollateral, collateralDependenceProfile }) {
  const reasons = []
  if (age !== null) {
    reasons.push(`age evidence suggests ${age} years old`)
  } else {
    reasons.push('no explicit age evidence found in current claims')
  }
  if (hasCollegeContext) {
    reasons.push('college/student context is present')
  }
  if (hasParentCollateral) {
    reasons.push('parent collateral contributes developmental framing')
  }
  reasons.push(`collateral profile resolved as ${collateralDependenceProfile}`)
  reasons.push(`selected lifecycle schema ${lifecycleSchema}`)
  return reasons
}

function sectionTemplatesForClassification(classification) {
  if (classification.chronologicalAgeGroup === 'child') {
    return [
      section('presenting-information', 'Presenting Information/Reason for Referral', true),
      section('birth-developmental-history', 'Birth/Developmental History', true),
      section('medical-history', 'Medical History', true),
      section('family-history', 'Family History', true),
      section('behavioral-emotional-social-history', 'Behavioral/Emotional/Social History', true),
      section('educational-history', 'Educational History', true),
      section('previous-evaluations', 'Previous Evaluations', true)
    ]
  }

  if (classification.lifecycleSchema === 'transition_age_young_adult') {
    return [
      section('reason-for-referral', 'Reason for Referral', true),
      section('presenting-complaints', 'Presenting Complaints/Symptoms', true),
      section('medical-developmental-history', 'Medical and Developmental History', true),
      section('family-history', 'Family History', true),
      section('emotional-behavioral-history', 'Emotional/Behavioral History', true),
      section('social-history', 'Social History', true),
      section('educational-occupational-history', 'Educational and Occupational History', true),
      section('previous-evaluations', 'Previous Evaluations', true)
    ]
  }

  return [
    section('reason-for-referral', 'Reason for Referral', true),
    section('presenting-complaints', 'Presenting Complaints/Symptoms', true),
    section('developmental-medical-history', 'Developmental and Medical History', true),
    section('family-history', 'Family History', true),
    section('psychosocial-history', 'Psychosocial History', true),
    section('educational-occupational-history', 'Educational and Occupational History', true),
    section('previous-evaluations', 'Previous Evaluations', true)
  ]
}

function section(id, title, required) {
  return { id, title, required }
}

function assignPrimarySection(claim, classification) {
  switch (claim.claimCategory) {
    case 'referral_context':
      return classification.chronologicalAgeGroup === 'child' ? 'presenting-information' : 'reason-for-referral'
    case 'presenting_concerns':
      return classification.chronologicalAgeGroup === 'child' ? 'presenting-information' : 'presenting-complaints'
    case 'developmental_medical_history':
      return classification.chronologicalAgeGroup === 'child' ? 'birth-developmental-history' : classification.lifecycleSchema === 'transition_age_young_adult' ? 'medical-developmental-history' : 'developmental-medical-history'
    case 'family_history':
      return 'family-history'
    case 'emotional_behavioral_history':
      return classification.chronologicalAgeGroup === 'child' ? 'behavioral-emotional-social-history' : classification.lifecycleSchema === 'transition_age_young_adult' ? 'emotional-behavioral-history' : 'psychosocial-history'
    case 'social_history':
      return classification.chronologicalAgeGroup === 'child' ? 'behavioral-emotional-social-history' : classification.lifecycleSchema === 'transition_age_young_adult' ? 'social-history' : 'psychosocial-history'
    case 'educational_history':
      return classification.chronologicalAgeGroup === 'child' ? 'educational-history' : 'educational-occupational-history'
    case 'previous_evaluations':
      return 'previous-evaluations'
    default:
      return classification.chronologicalAgeGroup === 'child' ? 'presenting-information' : 'presenting-complaints'
  }
}

function candidateSectionsForClaim(claim, classification) {
  const primary = assignPrimarySection(claim, classification)
  const candidates = new Set([primary])

  if (claim.claimCategory === 'emotional_behavioral_history' && classification.lifecycleSchema === 'transition_age_young_adult') {
    candidates.add('social-history')
  }

  if (claim.claimCategory === 'social_history' && classification.lifecycleSchema === 'transition_age_young_adult') {
    candidates.add('emotional-behavioral-history')
  }

  if (claim.claimCategory === 'presenting_concerns') {
    candidates.add(primaryChronologyBucket(claim.chronology).includes('college') ? 'educational-occupational-history' : primary)
  }

  return Array.from(candidates)
}

function inferSalience(claim) {
  if (!claim.eligibleForHistoryDraft) {
    return 'exclude'
  }

  if (claim.claimCategory === 'referral_context' || claim.claimCategory === 'presenting_concerns') {
    return 'foreground'
  }

  if (claim.chronology.includes('lifelong') || claim.chronology.includes('college') || claim.attributionMode === 'collateral_report') {
    return 'foreground'
  }

  return 'summarize'
}

function primaryChronologyBucket(chronology) {
  if (!Array.isArray(chronology) || chronology.length === 0) {
    return 'unknown'
  }

  if (chronology.includes('college')) {
    return 'college_or_recent'
  }
  if (chronology.includes('secondary_school')) {
    return 'secondary_school'
  }
  if (chronology.includes('elementary_school')) {
    return 'elementary_school'
  }
  if (chronology.includes('early_childhood')) {
    return 'early_childhood'
  }
  if (chronology.includes('lifelong')) {
    return 'lifelong'
  }

  return chronology[0]
}

function buildSectionNotes(sections, classification) {
  const notes = []
  if (classification.lifecycleSchema === 'transition_age_young_adult') {
    notes.push('Transition-age schema selected to preserve educational emphasis and separate emotional/behavioral from social history.')
  }
  if (sections.some((section) => section.evidenceSufficiency === 'thin')) {
    notes.push('At least one required section remains thin and may need clinician confirmation before drafting.')
  }
  return notes
}

function createClassificationMarkdown(classification) {
  return [
    '# Case Classification',
    '',
    `- Age Years: \`${classification.ageYears ?? 'unknown'}\``,
    `- Chronological Age Group: \`${classification.chronologicalAgeGroup}\``,
    `- Lifecycle Schema: \`${classification.lifecycleSchema}\``,
    `- Collateral Dependence Profile: \`${classification.collateralDependenceProfile}\``,
    `- History Schema: \`${classification.historySchema}\``,
    `- Presenting Section Mode: \`${classification.presentingSectionMode}\``,
    `- Developmental/Medical Mode: \`${classification.developmentalMedicalMode}\``,
    `- Education/Work Mode: \`${classification.educationWorkMode}\``,
    `- Requires Clinician Confirmation: \`${classification.requiresClinicianConfirmation}\``,
    '',
    '## Rationale',
    '',
    ...classification.rationale.map((reason) => `- ${reason}`)
  ].join('\n') + '\n'
}

function createSectionPlanMarkdown(sectionPlan) {
  const lines = [
    '# Section Plan',
    '',
    '| Section | Claim Count | Evidence Sufficiency | Requires Confirmation |',
    '|---|---:|---|---|'
  ]

  for (const section of sectionPlan.sections) {
    lines.push(`| ${section.title} | ${section.claimIds.length} | ${section.evidenceSufficiency} | ${section.requiresClinicianConfirmation ? 'yes' : 'no'} |`)
  }

  lines.push('', '## Claim Assignments', '')
  for (const assignment of sectionPlan.assignments) {
    lines.push(`- \`${assignment.claimId}\` -> \`${assignment.primarySectionId}\` (${assignment.salience}; ${assignment.chronologyBucket})`)
  }

  if (sectionPlan.sectionNotes.length > 0) {
    lines.push('', '## Notes', '', ...sectionPlan.sectionNotes.map((note) => `- ${note}`))
  }

  return lines.join('\n') + '\n'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}
