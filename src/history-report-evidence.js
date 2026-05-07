import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportEvidence({ sourceDirectory, repoRoot, runId }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const registryPath = path.join(runRoot, '01-inventory', 'source-registry.json')
  const registry = JSON.parse(await readFile(registryPath, 'utf8'))
  const admittedCandidates = (registry.candidates ?? []).filter((candidate) => candidate.include)

  const segmentAnnotations = []
  const atomicClaims = []

  for (const candidate of admittedCandidates) {
    const content = await readFile(candidate.path, 'utf8')
    const annotation = annotateCandidateContent(candidate, content)
    segmentAnnotations.push(...annotation.segments)
    atomicClaims.push(...deriveAtomicClaims(annotation.segments, candidate))
    await writeFile(
      path.join(runRoot, '02-evidence', `${slugify(candidate.relativePath)}.md`),
      createEvidenceSheetMarkdown({ candidate, segments: annotation.segments, claims: atomicClaims.filter((claim) => claim.sourcePath === candidate.path), runId }),
      'utf8'
    )
  }

  await Promise.all([
    writeJson(path.join(runRoot, '02-evidence', 'segment-annotations.json'), {
      caseId,
      runId,
      count: segmentAnnotations.length,
      segments: segmentAnnotations
    }),
    writeJson(path.join(runRoot, '02-evidence', 'atomic-claims.json'), {
      caseId,
      runId,
      count: atomicClaims.length,
      claims: atomicClaims
    })
  ])

  return {
    caseId,
    runId,
    runRoot,
    segmentCount: segmentAnnotations.length,
    claimCount: atomicClaims.length
  }
}

export function annotateCandidateContent(candidate, content) {
  const body = stripFrontmatter(content)
  const lines = body.split(/\r?\n/)
  const segments = []
  let segmentIndex = 0

  for (const sourceUnit of candidate.sourceUnits ?? []) {
    const unitLines = lines.slice(Math.max(sourceUnit.startLine - 1, 0), sourceUnit.endLine)
    let currentHeading = sourceUnit.title
    let paragraphBuffer = []
    let paragraphStartLine = null

    const flushParagraph = (endOffset) => {
      const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim()
      if (!text) {
        paragraphBuffer = []
        paragraphStartLine = null
        return
      }

      segmentIndex += 1
      segments.push(createAnnotatedSegment({
        candidate,
        sourceUnit,
        segmentIndex,
        type: 'paragraph',
        text,
        headingContext: currentHeading,
        startLine: paragraphStartLine,
        endLine: endOffset
      }))
      paragraphBuffer = []
      paragraphStartLine = null
    }

    unitLines.forEach((rawLine, offset) => {
      const lineNumber = sourceUnit.startLine + offset
      const trimmed = rawLine.trim()

      if (!trimmed) {
        flushParagraph(lineNumber - 1)
        return
      }

      const heading = extractHeading(trimmed)
      if (heading) {
        flushParagraph(lineNumber - 1)
        currentHeading = heading
        return
      }

      const bullet = extractBullet(trimmed)
      if (bullet) {
        flushParagraph(lineNumber - 1)
        segmentIndex += 1
        segments.push(createAnnotatedSegment({
          candidate,
          sourceUnit,
          segmentIndex,
          type: 'bullet',
          text: bullet,
          headingContext: currentHeading,
          startLine: lineNumber,
          endLine: lineNumber
        }))
        return
      }

      if (paragraphStartLine === null) {
        paragraphStartLine = lineNumber
      }
      paragraphBuffer.push(trimmed)
    })

    flushParagraph(sourceUnit.endLine)
  }

  return { segments }
}

export function deriveAtomicClaims(segments, candidate) {
  return segments.map((segment, index) => {
    const category = inferClaimCategory(segment)
    return {
      claimId: `${slugify(candidate.relativePath)}-claim-${index + 1}`,
      sourcePath: candidate.path,
      sourceUnitId: segment.sourceUnitId,
      segmentId: segment.segmentId,
      claimCategory: category,
      claimText: segment.text,
      attributionMode: segment.attributionMode,
      noteFragmentClass: segment.noteFragmentClass,
      chronology: segment.chronologyCues,
      quoteCandidate: segment.quoteCandidate,
      eligibleForHistoryDraft: isEligibleForHistoryDraft(segment.noteFragmentClass),
      sourceLayer: segment.sourceLayer,
      headingContext: segment.headingContext,
      collateralSourceType: segment.collateralSourceType,
      conflictCues: segment.conflictCues
    }
  })
}

function createAnnotatedSegment({ candidate, sourceUnit, segmentIndex, type, text, headingContext, startLine, endLine }) {
  const noteFragmentClass = classifyNoteFragment(candidate, headingContext, text)
  const attribution = inferAttribution(candidate, text)

  return {
    segmentId: `${sourceUnit.unitId}::segment-${segmentIndex}`,
    sourcePath: candidate.path,
    relativePath: candidate.relativePath,
    sourceUnitId: sourceUnit.unitId,
    sourceLayer: 'source_derived_content',
    segmentType: type,
    headingContext,
    text,
    startLine,
    endLine,
    chronologyCues: inferChronologyCues(text),
    attributionMode: attribution.mode,
    collateralSourceType: attribution.collateralSourceType,
    noteFragmentClass,
    quoteCandidate: /[“”"']just right[”"']|[“”]/i.test(text) || /"[^"]+"/.test(text),
    conflictCues: inferConflictCues(text)
  }
}

function classifyNoteFragment(candidate, headingContext, text) {
  const lowerHeading = (headingContext ?? '').toLowerCase()
  const lowerText = text.toLowerCase()

  if (candidate.documentKind !== 'clinician_intake_notes') {
    if (lowerText.includes('mother reported') || lowerText.includes('parents endorsed')) {
      return 'collateral_summary'
    }

    return candidate.documentKind === 'patient_questionnaire' ? 'reported_symptom_or_history' : 'history_relevant_fact'
  }

  if (lowerHeading.includes('recommendation')) {
    return 'recommendation_idea'
  }

  if (lowerHeading.includes('dx differential') || lowerHeading.includes('differential')) {
    return 'diagnostic_hypothesis'
  }

  if (lowerHeading.includes('remember') || lowerText.startsWith('assess ')) {
    return 'clinician_observation_prompt'
  }

  if (lowerHeading.includes('secondary gain') || lowerText.includes('follow-up question') || /\?$/.test(text)) {
    return 'follow_up_question'
  }

  if (lowerText.includes('mom says') || lowerText.includes('mother') || lowerText.includes('parents ')) {
    return 'collateral_summary'
  }

  return 'reported_symptom_or_history'
}

function inferAttribution(candidate, text) {
  const lowerText = text.toLowerCase()

  if (lowerText.includes('mom says') || lowerText.includes('mother') || lowerText.includes('parents ')) {
    return { mode: 'collateral_report', collateralSourceType: lowerText.includes('parents') ? 'parent' : 'mother' }
  }

  if (candidate.documentKind === 'patient_questionnaire') {
    return { mode: 'self_report', collateralSourceType: null }
  }

  if (candidate.documentKind === 'clinician_intake_notes') {
    return { mode: 'clinician_note', collateralSourceType: null }
  }

  if (candidate.documentKind === 'prior_evaluation') {
    return { mode: 'prior_eval_finding', collateralSourceType: null }
  }

  return { mode: 'record_fact', collateralSourceType: null }
}

function inferChronologyCues(text) {
  const lowerText = text.toLowerCase()
  const cues = []

  addCue(cues, lowerText, /early childhood|childhood|since a kid|ever since kid/, 'early_childhood')
  addCue(cues, lowerText, /elementary|grade school|1st grade|3rd grade/, 'elementary_school')
  addCue(cues, lowerText, /middle school|middle\/hs|middle and high school|high school/, 'secondary_school')
  addCue(cues, lowerText, /college|usc|freshman|junior/, 'college')
  addCue(cues, lowerText, /last year|currently|current|recently/, 'recent_or_current')
  addCue(cues, lowerText, /lifelong|always|long-standing|longstanding/, 'lifelong')

  return cues
}

function addCue(cues, lowerText, pattern, value) {
  if (pattern.test(lowerText)) {
    cues.push(value)
  }
}

function inferConflictCues(text) {
  const lowerText = text.toLowerCase()
  const cues = []

  if (lowerText.includes('not sure') || lowerText.includes('likely') || lowerText.includes('probably')) {
    cues.push('uncertain_statement')
  }

  if (lowerText.includes('became more noticeable') || lowerText.includes('mostly now')) {
    cues.push('onset_visibility_tension')
  }

  return cues
}

function inferClaimCategory(segment) {
  const lowerHeading = (segment.headingContext ?? '').toLowerCase()
  const lowerText = segment.text.toLowerCase()

  if (lowerHeading.includes('family')) {
    return 'family_history'
  }
  if (lowerHeading.includes('social')) {
    return 'social_history'
  }
  if (lowerHeading.includes('educat') || lowerHeading.includes('occup')) {
    return 'educational_history'
  }
  if (lowerHeading.includes('medical') || lowerHeading.includes('development')) {
    return 'developmental_medical_history'
  }
  if (lowerHeading.includes('emotional') || lowerHeading.includes('behavior')) {
    return 'emotional_behavioral_history'
  }
  if (lowerHeading.includes('previous') || lowerHeading.includes('intervention')) {
    return 'previous_evaluations'
  }
  if (lowerHeading.includes('presenting') || lowerHeading.includes('concern') || lowerHeading.includes('symptom')) {
    return 'presenting_concerns'
  }
  if (lowerText.includes('referred') || lowerText.includes('testing')) {
    return 'referral_context'
  }

  return 'general_history'
}

function isEligibleForHistoryDraft(noteFragmentClass) {
  return !['diagnostic_hypothesis', 'recommendation_idea', 'clinician_observation_prompt', 'follow_up_question'].includes(noteFragmentClass)
}

function createEvidenceSheetMarkdown({ candidate, segments, claims, runId }) {
  const eligibleClaims = claims.filter((claim) => claim.eligibleForHistoryDraft)
  const quoteClaims = claims.filter((claim) => claim.quoteCandidate)
  const ambiguityClaims = claims.filter((claim) => claim.conflictCues.length > 0 || !claim.eligibleForHistoryDraft)

  return [
    `# Evidence Sheet: \`${path.basename(candidate.relativePath, '.md')}\``,
    '',
    `- Source Path: \`${candidate.path}\``,
    `- Source Type: \`${candidate.documentKind}\``,
    `- Working Read Form: \`${candidate.qualityIssues.includes('ocr_derived_markdown') ? 'OCR-derived markdown' : 'markdown'}\``,
    `- Reliability / Role: \`${candidate.hierarchyRole}\``,
    `- Extracted By Run: \`${runId}\``,
    '',
    '## High-Value Facts',
    '',
    ...eligibleClaims.map((claim) => `- [${claim.claimCategory}] ${claim.claimText}`),
    '',
    '## Segment Annotations',
    '',
    ...segments.map((segment) => `- ${segment.segmentId}: ${segment.noteFragmentClass}; ${segment.attributionMode}; chronology=${segment.chronologyCues.join(', ') || 'none'}`),
    '',
    '## Direct Quotes Worth Preserving',
    '',
    ...(quoteClaims.length > 0 ? quoteClaims.map((claim) => `- \`${claim.claimText}\``) : ['- none identified']),
    '',
    '## Ambiguities / Gaps',
    '',
    ...(ambiguityClaims.length > 0 ? ambiguityClaims.map((claim) => `- ${claim.claimText}`) : ['- none noted at this stage'])
  ].join('\n') + '\n'
}

function extractHeading(trimmed) {
  const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/)
  if (markdownHeading) {
    return markdownHeading[1]
  }

  const emphasizedHeading = trimmed.match(/^[_*]{1,2}([^*_].*?)[:*]?[_*]{1,2}$/)
  if (emphasizedHeading) {
    return emphasizedHeading[1]
  }

  if (/^[A-Z][A-Za-z /&()-]+:$/.test(trimmed)) {
    return trimmed.replace(/:$/, '')
  }

  return null
}

function extractBullet(trimmed) {
  const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/)
  if (bulletMatch) {
    return bulletMatch[1].trim()
  }

  const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/)
  if (orderedMatch) {
    return orderedMatch[1].trim()
  }

  return null
}

function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return content
  }

  const closingIndex = content.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return content
  }

  return content.slice(closingIndex + 5)
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}
