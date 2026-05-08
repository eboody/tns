import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportDomainTimeManagement({ sourceDirectory, repoRoot, runId }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const evidenceAtomsPayload = JSON.parse(await readFile(path.join(runRoot, '02-evidence', 'evidence-atoms.json'), 'utf8'))
  const evidenceAtoms = evidenceAtomsPayload.evidenceAtoms ?? []

  const memo = buildTimeManagementExecutiveMemo(evidenceAtoms)

  await Promise.all([
    writeFile(path.join(runRoot, '03-derived', 'domain-memo.time-management-executive.json'), JSON.stringify(memo, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '03-derived', 'domain-memo.time-management-executive.md'), renderTimeManagementExecutiveMemoMarkdown(memo), 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    memoPath: path.join(runRoot, '03-derived', 'domain-memo.time-management-executive.json'),
    evidenceCount: memo.sourceSupport.length,
    confidence: memo.confidence
  }
}

export function buildTimeManagementExecutiveMemo(evidenceAtoms) {
  const relevantAtoms = evidenceAtoms
    .filter((fact) => fact.eligibleForHistoryDraft)
    .filter((fact) => fact.domainCandidates.includes('time_management_executive') || /time management|late|task|school bus|dance class|longer to do things|prepare for classes|assignments on time/i.test(fact.rawText))
    .sort((left, right) => Number(right.specificityScore ?? 0) - Number(left.specificityScore ?? 0))

  const developmentalAnchors = relevantAtoms.filter((fact) => fact.factRole === 'developmental_anchor')
  const concreteExamples = relevantAtoms.filter((fact) => fact.factRole === 'concrete_example')
  const currentImpacts = relevantAtoms.filter((fact) => fact.factRole === 'current_impact' || /prepare for classes|assignments on time|deadline|current|college/i.test(fact.rawText))
  const corroboration = relevantAtoms.filter((fact) => fact.factRole === 'corroboration')
  const corePatternFacts = relevantAtoms.filter((fact) => fact.factRole === 'core_concern' || fact.factRole === 'developmental_anchor')

  const supportedPattern = buildSupportedPattern(corePatternFacts)
  const developmentalCourse = buildDevelopmentalCourse(developmentalAnchors, concreteExamples)
  const currentManifestation = buildCurrentManifestation(currentImpacts, corePatternFacts)
  const functionalConsequences = uniqueTexts(currentImpacts)
  const examples = uniqueTexts(concreteExamples)
  const corroborationSummary = corroboration.length > 0
    ? 'Collateral evidence supports a longstanding pattern of inefficiency, lateness, or difficulty completing tasks on time.'
    : 'Primary support is from self-report and clinician-documented history.'

  return {
    domainId: 'time-management-executive',
    domainTitle: 'Time Management / Executive Inefficiency',
    supportedPattern,
    developmentalCourse,
    currentManifestation,
    concreteExamples: examples,
    functionalConsequences,
    corroborationSummary,
    sourceSupport: relevantAtoms.map((fact) => fact.factId),
    confidence: relevantAtoms.length >= 4 ? 'high' : relevantAtoms.length >= 2 ? 'medium' : 'low'
  }
}

function buildSupportedPattern(corePatternFacts) {
  if (corePatternFacts.some((fact) => /longer to do things|time management|late/i.test(fact.rawText))) {
    return 'The available history supports a longstanding pattern of time-management inefficiency marked by chronic lateness, slow task completion, and difficulty managing demands within available structure.'
  }

  return 'The available history suggests executive inefficiency related to time management and completion demands.'
}

function buildDevelopmentalCourse(developmentalAnchors, concreteExamples) {
  const schoolBus = concreteExamples.some((fact) => /school bus|\bbus\b/i.test(fact.rawText))
  const dance = concreteExamples.some((fact) => /dance class/i.test(fact.rawText))

  const exampleParts = [
    schoolBus ? 'frequent lateness for the school bus across elementary, middle, and high school' : null,
    dance ? 'arriving late to dance classes in childhood' : null
  ].filter(Boolean)

  if (developmentalAnchors.length > 0 || exampleParts.length > 0) {
    return `This pattern appears to have been present since early development${exampleParts.length > 0 ? `, with examples including ${joinClinicalList(exampleParts)}` : ''}.`
  }

  return 'Developmental continuity is suggested but not richly anchored in the current evidence.'
}

function buildCurrentManifestation(currentImpacts, corePatternFacts) {
  const mentionsCollege = [...currentImpacts, ...corePatternFacts].some((fact) => /college|reduced structure|less structure/i.test(fact.rawText))
  const mentionsPreparation = currentImpacts.some((fact) => /prepare for classes|prepared enough for exams/i.test(fact.rawText))
  const mentionsAssignments = currentImpacts.some((fact) => /assignments on time|deadline|not completing some work on time/i.test(fact.rawText))
  const details = [
    mentionsPreparation ? 'insufficient time to prepare for classes' : null,
    mentionsAssignments ? 'difficulty completing assignments on time' : null
  ].filter(Boolean)

  return `Currently, the pattern is more impairing in college${mentionsCollege ? ' where reduced structure increases the burden on self-directed organization' : ''}${details.length > 0 ? `, contributing to ${joinClinicalList(details)}` : ''}.`
}

function uniqueTexts(facts) {
  return Array.from(new Set(facts.map((fact) => fact.normalizedMeaning)))
}

function joinClinicalList(parts) {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

function renderTimeManagementExecutiveMemoMarkdown(memo) {
  return [
    `# Domain Memo: ${memo.domainTitle}`,
    '',
    `- Confidence: \`${memo.confidence}\``,
    `- Source Support Count: \`${memo.sourceSupport.length}\``,
    '',
    '## Supported Pattern',
    '',
    memo.supportedPattern,
    '',
    '## Developmental Course',
    '',
    memo.developmentalCourse,
    '',
    '## Current Manifestation',
    '',
    memo.currentManifestation,
    '',
    '## Concrete Examples',
    '',
    ...(memo.concreteExamples.length > 0 ? memo.concreteExamples.map((example) => `- ${example}`) : ['- none']),
    '',
    '## Functional Consequences',
    '',
    ...(memo.functionalConsequences.length > 0 ? memo.functionalConsequences.map((consequence) => `- ${consequence}`) : ['- none']),
    '',
    '## Corroboration Summary',
    '',
    memo.corroborationSummary,
    ''
  ].join('\n')
}
