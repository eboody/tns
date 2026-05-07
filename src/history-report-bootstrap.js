import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function deriveCaseId(sourceDirectory) {
  const baseName = path.basename(path.resolve(sourceDirectory))
  const normalized = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'case'
}

export function createRunId(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export async function bootstrapHistoryReportRun({
  sourceDirectory,
  repoRoot,
  now = new Date(),
  runId = createRunId(now)
}) {
  if (!sourceDirectory || !repoRoot) {
    throw new Error('sourceDirectory and repoRoot are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const sourceStats = await stat(resolvedSourceDirectory)
  if (!sourceStats.isDirectory()) {
    throw new Error(`sourceDirectory is not a directory: ${resolvedSourceDirectory}`)
  }

  const discoveredEntries = await readdir(resolvedSourceDirectory)
  const markdownCandidates = discoveredEntries
    .filter((entry) => entry.toLowerCase().endsWith('.md'))
    .sort((left, right) => left.localeCompare(right))

  const caseId = deriveCaseId(resolvedSourceDirectory)
  const caseRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId)
  const runRoot = path.join(caseRoot, 'runs', runId)

  const directories = [
    caseRoot,
    path.join(caseRoot, 'approved'),
    runRoot,
    path.join(runRoot, '00-brief'),
    path.join(runRoot, '01-inventory'),
    path.join(runRoot, '02-evidence'),
    path.join(runRoot, '03-derived'),
    path.join(runRoot, '04-draft'),
    path.join(runRoot, '05-audit'),
    path.join(repoRoot, 'ralph')
  ]

  for (const directory of directories) {
    await mkdir(directory, { recursive: true })
  }

  const reportBrief = {
    caseId,
    runId,
    sourceDirectory: resolvedSourceDirectory,
    ontologyVariant: 'unresolved',
    deliverableType: 'clinician-native neuropsych history report',
    interpretationLimits: 'bounded evidence-grounded synthesis only; no diagnosis or recommendation authorship',
    sourceAdmissionStatus: 'pending inventory',
    discoveredMarkdownCandidates: markdownCandidates
  }

  const privacyAssumption = {
    deidentificationAssumed: true,
    deidentificationPerformedBy: 'clinician_or_clinician_delegate',
    workflowDoesNotVerifyIdentifiers: true,
    recordedAt: now.toISOString()
  }

  const sourceRegistry = {
    caseId,
    runId,
    status: 'pending_inventory',
    sourceDirectory: resolvedSourceDirectory,
    discoveredMarkdownCandidates: markdownCandidates.map((entry) => ({
      path: path.join(resolvedSourceDirectory, entry),
      classificationStatus: 'unclassified'
    }))
  }

  const runSummary = {
    caseId,
    runId,
    status: 'initialized',
    currentSlice: '#70 bootstrap repo-local Sandcastle history-report run',
    notes: ['Workspace created and ready for source inventory.']
  }

  const ralphPrd = createRalphPrd()
  const progressMarkdown = createProgressMarkdown({ caseId, runId })
  const runbookMarkdown = createRunbookMarkdown()

  await Promise.all([
    writeJson(path.join(runRoot, '00-brief', 'report-brief.json'), reportBrief),
    writeFile(path.join(runRoot, '00-brief', 'report-brief.md'), createReportBriefMarkdown(reportBrief), 'utf8'),
    writeJson(path.join(runRoot, '00-brief', 'input-privacy-assumption.json'), privacyAssumption),
    writeJson(path.join(runRoot, '01-inventory', 'source-registry.json'), sourceRegistry),
    writeJson(path.join(runRoot, '05-audit', 'run-summary.json'), runSummary),
    writeFile(path.join(caseRoot, 'approved', 'latest.md'), '<!-- no approved report yet -->\n', 'utf8'),
    writeIfMissing(path.join(repoRoot, 'ralph', 'prd.json'), JSON.stringify(ralphPrd, null, 2) + '\n'),
    writeIfMissing(path.join(repoRoot, 'ralph', 'progress.md'), progressMarkdown),
    writeIfMissing(path.join(repoRoot, 'ralph', 'runbook.md'), runbookMarkdown)
  ])

  return {
    caseId,
    runId,
    caseRoot,
    runRoot,
    discoveredMarkdownCandidates: markdownCandidates
  }
}

function createReportBriefMarkdown(brief) {
  return [
    '# Report Brief',
    '',
    `- Case ID: \`${brief.caseId}\``,
    `- Run ID: \`${brief.runId}\``,
    `- Source Directory: \`${brief.sourceDirectory}\``,
    `- Ontology Variant: \`${brief.ontologyVariant}\``,
    `- Deliverable Type: \`${brief.deliverableType}\``,
    `- Interpretation Limits: \`${brief.interpretationLimits}\``,
    `- Source Admission Status: \`${brief.sourceAdmissionStatus}\``,
    `- Discovered Markdown Candidates: \`${brief.discoveredMarkdownCandidates.length}\``
  ].join('\n') + '\n'
}

function createRalphPrd() {
  return [
    prdItem('history-report-70', 'bootstrap', 'high', 'medium', 'Bootstrap repo-local Sandcastle history-report run', ['Run bootstrap entrypoint against a markdown fixture folder', 'Observe stable case/run workspace creation', 'Observe initial brief/privacy/run-summary artifacts'], true),
    prdItem('history-report-71', 'inventory', 'high', 'medium', 'Inventory markdown sources and split logical source units', ['Inventory a mixed markdown fixture folder', 'Observe source registry with logical source-unit support', 'Observe inclusion/exclusion log and quality notes'], false),
    prdItem('history-report-72', 'evidence', 'high', 'high', 'Derive segment annotations and attributed atomic claims', ['Generate segment annotations from admitted sources', 'Derive attributed atomic claims', 'Observe chronology/collateral/note-fragment metadata'], false),
    prdItem('history-report-73', 'planning', 'high', 'high', 'Classify case schema and plan section ownership', ['Classify adult vs transition-age vs child lifecycle', 'Emit section plan with salience and missingness', 'Observe primary section ownership per claim'], false),
    prdItem('history-report-74', 'style', 'high', 'high', 'Compile governing clinician profile from doctrine and exemplars', ['Compile clinician profile from doctrine and exemplars', 'Observe lexicon/quote/anti-style outputs', 'Stop for required human doctrine confirmation'], false),
    prdItem('history-report-75', 'drafting', 'high', 'high', 'Draft and review one subsection in clinician voice', ['Draft one subsection from approved claims', 'Run evidence review', 'Run style review'], false),
    prdItem('history-report-76', 'integration', 'high', 'high', 'Deliver full Presenting Information section end-to-end', ['Draft Presenting Information subsections', 'Integrate into one section', 'Verify traceability remains intact'], false),
    prdItem('history-report-77', 'integration', 'high', 'high', 'Deliver full Relevant History draft with global review', ['Draft all history subsections', 'Run global evidence/style review', 'Emit provenance map'], false),
    prdItem('history-report-78', 'memo', 'medium', 'medium', 'Generate clinician-native noteworthy questions memo', ['Generate memo from workflow artifacts', 'Verify clinician-native style', 'Verify memo remains non-interpretive'], false),
    prdItem('history-report-79', 'branching', 'medium', 'high', 'Handle prior-eval-heavy and conflict-heavy cases honestly', ['Run conflict-heavy fixture', 'Observe continuity/conflict artifacts', 'Observe correct hold/escalation behavior'], false),
    prdItem('history-report-80', 'maintenance', 'medium', 'high', 'Capture clinician edits as doctrine update proposals', ['Record clinician edits as case-specific corrections', 'Generate doctrine update proposals', 'Preserve human promotion step'], false)
  ]
}

function prdItem(id, category, priority, risk, description, verify, passes) {
  return { id, category, priority, risk, description, verify, passes }
}

function createProgressMarkdown({ caseId, runId }) {
  return [
    '# Ralph Progress',
    '',
    `- Current case: \`${caseId}\``,
    `- Current run: \`${runId}\``,
    '- Last completed slice: `#70 Bootstrap repo-local Sandcastle history-report run`',
    '- Next likely slice: `#71 Inventory markdown sources and split logical source units`',
    '- Notes: bootstrap established .sandcastle workspace, privacy assumption artifact, and Ralph backlog scaffolding.'
  ].join('\n') + '\n'
}

function createRunbookMarkdown() {
  return [
    '# Ralph Runbook',
    '',
    '## Guardrails',
    '',
    '- Inputs are de-identified markdown documents only.',
    '- Do not add diagnostic interpretation or recommendation authorship.',
    '- Prefer one logical issue-sized slice per iteration.',
    '- Stop at explicit HITL slices for doctrine/profile confirmation.',
    '',
    '## Feedback loops',
    '',
    '- `npm test`',
    '- targeted `node --test src/history-report-bootstrap.test.js` while iterating on bootstrap',
    '- `git status --short` before commit staging',
    '',
    '## Current stop condition',
    '',
    '- Work issue-by-issue from #70 through #80.',
    '- Commit after each completed issue-sized slice when explicitly requested by the user.',
    '- Pause at HITL issues unless doctrine confirmation is supplied.'
  ].join('\n') + '\n'
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

async function writeIfMissing(filePath, contents) {
  try {
    await access(filePath)
  } catch {
    await writeFile(filePath, contents, 'utf8')
  }
}
