import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportInventory({ sourceDirectory, repoRoot, runId }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)

  const runStats = await stat(runRoot)
  if (!runStats.isDirectory()) {
    throw new Error(`runRoot is not a directory: ${runRoot}`)
  }

  const markdownFiles = await listMarkdownFiles(resolvedSourceDirectory)
  const candidates = []
  const included = []
  const excluded = []

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, 'utf8')
    const candidate = classifyMarkdownCandidate({ filePath, sourceDirectory: resolvedSourceDirectory, content })
    candidates.push(candidate)

    const logEntry = {
      path: candidate.path,
      reason: candidate.includeReason,
      hierarchyRole: candidate.hierarchyRole
    }

    if (candidate.include) {
      included.push(logEntry)
    } else {
      excluded.push(logEntry)
    }
  }

  const sourceRegistry = {
    caseId,
    runId,
    status: 'inventory_complete',
    sourceDirectory: resolvedSourceDirectory,
    candidates
  }
  const sourceReliabilityMap = {
    caseId,
    runId,
    sources: candidates.map((candidate) => ({
      sourceId: candidate.sourceId,
      path: candidate.path,
      relativePath: candidate.relativePath,
      documentKind: candidate.documentKind,
      include: candidate.include,
      sourceRole: candidate.sourceRole,
      sourceReliabilityTier: candidate.sourceReliabilityTier,
      sourceReliabilityRank: candidate.sourceReliabilityRank,
      hierarchyRole: candidate.hierarchyRole,
      qualityLevel: candidate.qualityLevel,
      qualityIssues: candidate.qualityIssues
    }))
  }

  const sourceInventoryMarkdown = createSourceInventoryMarkdown(candidates)
  const inclusionLogMarkdown = createInclusionLogMarkdown({ included, excluded })

  await Promise.all([
    writeJson(path.join(runRoot, '01-inventory', 'source-registry.json'), sourceRegistry),
    writeJson(path.join(runRoot, '01-inventory', 'source-reliability-map.json'), sourceReliabilityMap),
    writeFile(path.join(runRoot, '01-inventory', 'source-inventory.md'), sourceInventoryMarkdown, 'utf8'),
    writeFile(path.join(runRoot, '01-inventory', 'inclusion-log.md'), inclusionLogMarkdown, 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    includedCount: included.length,
    excludedCount: excluded.length,
    candidates
  }
}

export function classifyMarkdownCandidate({ filePath, sourceDirectory, content }) {
  const relativePath = path.relative(sourceDirectory, filePath) || path.basename(filePath)
  const metadata = extractFrontmatter(content)
  const contentWithoutFrontmatter = metadata.body
  const baseName = path.basename(filePath).toLowerCase()
  const kind = inferDocumentKind(relativePath, contentWithoutFrontmatter, metadata.attributes)
  const qualityIssues = inferQualityIssues(relativePath, contentWithoutFrontmatter)
  const wrapperSegments = detectWrapperSegments(contentWithoutFrontmatter)
  const sourceUnits = splitLogicalSourceUnits({ relativePath, content: contentWithoutFrontmatter, wrapperSegments })
  const includeDecision = decideInclusion({ kind, relativePath, sourceUnits })
  const reliability = inferSourceReliability(kind)

  return {
    sourceId: slugify(relativePath),
    path: filePath,
    relativePath,
    documentKind: kind,
    include: includeDecision.include,
    includeReason: includeDecision.reason,
    hierarchyRole: includeDecision.hierarchyRole,
    sourceRole: reliability.sourceRole,
    sourceReliabilityTier: reliability.tier,
    sourceReliabilityRank: reliability.rank,
    qualityLevel: qualityIssues.length === 0 ? 'high' : qualityIssues.includes('ocr_derived_markdown') ? 'medium' : 'medium',
    qualityIssues,
    wrapperSegments,
    sourceUnits,
    metadata: metadata.attributes,
    fileName: baseName
  }
}

async function listMarkdownFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const discovered = []

  for (const entry of entries) {
    const absolutePath = path.join(rootDirectory, entry.name)

    if (entry.isDirectory()) {
      discovered.push(...(await listMarkdownFiles(absolutePath)))
      continue
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      discovered.push(absolutePath)
    }
  }

  return discovered.sort((left, right) => left.localeCompare(right))
}

function extractFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return { attributes: {}, body: content }
  }

  const closingIndex = content.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return { attributes: {}, body: content }
  }

  const rawFrontmatter = content.slice(4, closingIndex).trim()
  const body = content.slice(closingIndex + 5)
  const attributes = {}

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key) {
      attributes[key] = value
    }
  }

  return { attributes, body }
}

function inferDocumentKind(relativePath, content, metadata) {
  const lowerPath = relativePath.toLowerCase()
  const lowerContent = content.toLowerCase()
  const explicitKind = typeof metadata.document_kind === 'string' ? metadata.document_kind.trim() : ''

  if (explicitKind) {
    return explicitKind
  }

  if (lowerPath.includes('intake') && lowerPath.includes('note')) {
    return 'clinician_intake_notes'
  }

  if (lowerContent.includes('intake notes')) {
    return 'clinician_intake_notes'
  }

  if (lowerPath.includes('questionnaire')) {
    return 'patient_questionnaire'
  }

  if (lowerContent.includes('neuropsychological intake questionnaire')) {
    return 'patient_questionnaire'
  }

  if (lowerPath.includes('referral')) {
    return 'referral_material'
  }

  if (lowerPath.includes('transcript')) {
    return 'academic_record'
  }

  if (lowerContent.includes('transcript')) {
    return 'academic_record'
  }

  if (lowerContent.includes('student health referral') || lowerContent.includes('referred to:')) {
    return 'referral_material'
  }

  if (lowerPath.includes('report') || lowerContent.includes('neuropsychological assessment report')) {
    return 'generated_report'
  }

  if (lowerPath.includes('evaluation')) {
    return 'prior_evaluation'
  }

  return 'unclassified_markdown'
}

function inferQualityIssues(relativePath, content) {
  const issues = []
  const lowerPath = relativePath.toLowerCase()
  const lowerContent = content.toLowerCase()

  if (lowerContent.includes('converted from') || lowerContent.includes('ocr-derived') || lowerPath.includes('transcript')) {
    issues.push('ocr_derived_markdown')
  }

  if (/\\[()\-.]/.test(content)) {
    issues.push('escaped_formatting_noise')
  }

  if (/\n-\s*$/.test(content) || lowerContent.includes('formatting may be simplified')) {
    issues.push('simplified_or_partial_formatting')
  }

  return Array.from(new Set(issues))
}

function detectWrapperSegments(content) {
  const lines = content.split(/\r?\n/)
  const wrapperSegments = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index].trim()
    const isWrapper =
      line.startsWith('Source:') ||
      line.includes('Converted from') ||
      line === '' ||
      /^#\s/.test(line)

    if (!isWrapper) {
      break
    }

    wrapperSegments.push({
      type: line.startsWith('Source:') ? 'source_reference' : line.includes('Converted from') ? 'conversion_note' : /^#\s/.test(line) ? 'wrapper_heading' : 'blank',
      startLine: index + 1,
      endLine: index + 1,
      text: lines[index]
    })
    index += 1
  }

  return wrapperSegments.filter((segment) => segment.type !== 'blank')
}

function splitLogicalSourceUnits({ relativePath, content, wrapperSegments }) {
  const lines = content.split(/\r?\n/)
  const wrapperEndLine = wrapperSegments.length > 0 ? Math.max(...wrapperSegments.map((segment) => segment.endLine)) : 0
  const unitHeadings = []

  for (let index = wrapperEndLine; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^##\s+/.test(line.trim())) {
      unitHeadings.push({ title: line.trim().replace(/^##\s+/, ''), lineNumber: index + 1 })
    }
  }

  if (unitHeadings.length >= 2) {
    return unitHeadings.map((heading, index) => {
      const nextHeading = unitHeadings[index + 1]
      const startLine = heading.lineNumber
      const endLine = nextHeading ? nextHeading.lineNumber - 1 : lines.length
      return {
        unitId: `${slugify(relativePath)}::${index + 1}`,
        title: heading.title,
        startLine,
        endLine,
        provenance: 'heading_split'
      }
    })
  }

  const firstContentLine = Math.max(wrapperEndLine + 1, 1)
  return [
    {
      unitId: `${slugify(relativePath)}::1`,
      title: inferDefaultUnitTitle(relativePath, lines[firstContentLine - 1] ?? ''),
      startLine: firstContentLine,
      endLine: lines.length,
      provenance: 'whole_file_default'
    }
  ]
}

function inferDefaultUnitTitle(relativePath, firstContentLine) {
  const headingMatch = firstContentLine.trim().match(/^#{1,6}\s+(.+)$/)
  if (headingMatch) {
    return headingMatch[1]
  }

  return path.basename(relativePath, '.md')
}

function decideInclusion({ kind, relativePath, sourceUnits }) {
  const lowerPath = relativePath.toLowerCase()
  const includableKinds = new Set([
    'clinician_intake_notes',
    'patient_questionnaire',
    'referral_material',
    'academic_record',
    'prior_evaluation'
  ])

  if (kind === 'generated_report') {
    return {
      include: false,
      reason: 'generated/final report excluded from working source set',
      hierarchyRole: 'excluded'
    }
  }

  if (sourceUnits.length === 0 || lowerPath.includes('scratch') || lowerPath.includes('.ds_store')) {
    return {
      include: false,
      reason: 'administrative or empty markdown source',
      hierarchyRole: 'excluded'
    }
  }

  if (!includableKinds.has(kind)) {
    return {
      include: false,
      reason: 'unclassified or non-clinical markdown source excluded from working source set',
      hierarchyRole: 'excluded'
    }
  }

  const hierarchyRole =
    kind === 'clinician_intake_notes'
      ? 'hierarchy 1: clinician-authored intake note'
      : kind === 'patient_questionnaire'
        ? 'hierarchy 1: contemporaneous intake/questionnaire'
        : kind === 'referral_material'
          ? 'hierarchy 2: referral material'
          : kind === 'academic_record'
            ? 'hierarchy 3 with OCR caution: academic record'
            : kind === 'prior_evaluation'
              ? 'hierarchy 2: prior evaluation'
              : 'hierarchy review: other markdown source'

  return {
    include: true,
    reason: `admitted markdown source for ${kind.replaceAll('_', ' ')}`,
    hierarchyRole
  }
}

function inferSourceReliability(kind) {
  if (kind === 'clinician_intake_notes') {
    return { sourceRole: 'clinician_history_source', tier: 'tier_1_primary', rank: 1 }
  }

  if (kind === 'patient_questionnaire') {
    return { sourceRole: 'patient_history_source', tier: 'tier_1_primary', rank: 1 }
  }

  if (kind === 'referral_material') {
    return { sourceRole: 'referral_context_source', tier: 'tier_2_contextual', rank: 2 }
  }

  if (kind === 'prior_evaluation') {
    return { sourceRole: 'prior_evaluation_source', tier: 'tier_2_contextual', rank: 2 }
  }

  if (kind === 'academic_record') {
    return { sourceRole: 'academic_context_source', tier: 'tier_3_contextual', rank: 3 }
  }

  if (kind === 'generated_report') {
    return { sourceRole: 'generated_output_source', tier: 'excluded', rank: 99 }
  }

  return { sourceRole: 'unclassified_source', tier: 'excluded', rank: 99 }
}

function createSourceInventoryMarkdown(candidates) {
  const lines = [
    '# Source Inventory',
    '',
    '| Candidate Path | Source Type | Include? | Quality | Source Units | Reason |',
    '|---|---|---|---|---|---|'
  ]

  for (const candidate of candidates) {
    lines.push(
      `| \`${candidate.path}\` | ${candidate.documentKind} | ${candidate.include ? 'yes' : 'no'} | ${candidate.qualityIssues.length > 0 ? candidate.qualityIssues.join(', ') : 'clean markdown'} | ${candidate.sourceUnits.length} | ${candidate.includeReason} |`
    )
  }

  lines.push('', '## Notes', '')
  for (const candidate of candidates) {
    lines.push(`- \`${candidate.relativePath}\``)
    lines.push(`  - wrapper segments: ${candidate.wrapperSegments.length}`)
    lines.push(`  - logical source units: ${candidate.sourceUnits.map((unit) => `${unit.title} (${unit.startLine}-${unit.endLine})`).join('; ')}`)
  }

  return lines.join('\n') + '\n'
}

function createInclusionLogMarkdown({ included, excluded }) {
  const lines = ['# Inclusion / Exclusion Log', '', '## Included Sources', '', '| Path | Why Included | Source Hierarchy Role |', '|---|---|---|']

  for (const entry of included) {
    lines.push(`| \`${entry.path}\` | ${entry.reason} | ${entry.hierarchyRole} |`)
  }

  lines.push('', '## Excluded Sources', '', '| Path | Why Excluded |', '|---|---|')
  for (const entry of excluded) {
    lines.push(`| \`${entry.path}\` | ${entry.reason} |`)
  }

  lines.push('', '## Overrides', '', '- none')
  return lines.join('\n') + '\n'
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}
