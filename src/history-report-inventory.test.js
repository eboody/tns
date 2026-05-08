import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { bootstrapHistoryReportRun } from './history-report-bootstrap.js'
import { classifyMarkdownCandidate, runHistoryReportInventory } from './history-report-inventory.js'

test('classifyMarkdownCandidate separates wrapper text and splits logical source units by headings', () => {
  const candidate = classifyMarkdownCandidate({
    filePath: '/tmp/source/records-bundle.md',
    sourceDirectory: '/tmp/source',
    content: `# Records Bundle\n\nSource: original packet\n_Converted from OCR markdown._\n\n## USC Transcript\nBody A\n\n## Student Health Referral\nBody B\n`
  })

  assert.equal(candidate.documentKind, 'academic_record')
  assert.equal(candidate.wrapperSegments.length, 3)
  assert.equal(candidate.sourceUnits.length, 2)
  assert.equal(candidate.sourceUnits[0].title, 'USC Transcript')
  assert.equal(candidate.sourceUnits[1].title, 'Student Health Referral')
  assert.ok(candidate.qualityIssues.includes('ocr_derived_markdown'))
})

test('runHistoryReportInventory emits source registry and inclusion log for mixed markdown corpus', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'tns-repo-'))
  const sourceDirectory = path.join(repoRoot, 'Docs for Eran(1)')
  await mkdir(sourceDirectory)

  await Promise.all([
    writeFile(
      path.join(sourceDirectory, 'Deidentified - Intake Notes (SH) Adult.md'),
      `# Deidentified - Intake Notes (SH) Adult\n\nSource: packet\n_Converted from DOCX; some formatting may be simplified._\n\n## Intake Notes\n- lifelong time management\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'records-bundle.md'),
      `# Records Bundle\n\nSource: packet\n_Converted from OCR markdown._\n\n## USC Transcript\nGPA text\n\n## Student Health Referral\nReferral text\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, '2026-report.md'),
      `## PRESENTING INFORMATION/REASON FOR REFERRAL\n\nCLIENT is a 20-year-old...\n`,
      'utf8'
    ),
    writeFile(
      path.join(sourceDirectory, 'AGENTS.md'),
      `# Repo Instructions\n\n## Always Do\n- Run impact analysis before editing code.\n`,
      'utf8'
    )
  ])

  const bootstrap = await bootstrapHistoryReportRun({
    sourceDirectory,
    repoRoot,
    now: new Date('2026-05-07T14:00:00.000Z')
  })

  const result = await runHistoryReportInventory({
    sourceDirectory,
    repoRoot,
    runId: bootstrap.runId
  })

  assert.equal(result.includedCount, 2)
  assert.equal(result.excludedCount, 2)

  const registry = JSON.parse(await readFile(path.join(bootstrap.runRoot, '01-inventory', 'source-registry.json'), 'utf8'))
  const reliabilityMap = JSON.parse(await readFile(path.join(bootstrap.runRoot, '01-inventory', 'source-reliability-map.json'), 'utf8'))
  assert.equal(registry.status, 'inventory_complete')
  assert.equal(registry.candidates.length, 4)
  assert.equal(reliabilityMap.sources.length, 4)

  const reportCandidate = registry.candidates.find((candidate) => candidate.relativePath === '2026-report.md')
  assert.equal(reportCandidate.include, false)
  assert.equal(reportCandidate.documentKind, 'generated_report')

  const bundleCandidate = registry.candidates.find((candidate) => candidate.relativePath === 'records-bundle.md')
  assert.equal(bundleCandidate.sourceUnits.length, 2)
  assert.ok(bundleCandidate.qualityIssues.includes('ocr_derived_markdown'))

  const agentsCandidate = registry.candidates.find((candidate) => candidate.relativePath === 'AGENTS.md')
  assert.equal(agentsCandidate.include, false)
  assert.equal(agentsCandidate.documentKind, 'unclassified_markdown')

  const intakeCandidate = registry.candidates.find((candidate) => candidate.relativePath === 'Deidentified - Intake Notes (SH) Adult.md')
  assert.equal(intakeCandidate.sourceRole, 'clinician_history_source')
  assert.equal(intakeCandidate.sourceReliabilityTier, 'tier_1_primary')

  const reliabilitySource = reliabilityMap.sources.find((source) => source.relativePath === 'Deidentified - Intake Notes (SH) Adult.md')
  assert.equal(reliabilitySource.sourceReliabilityRank, 1)

  const inclusionLog = await readFile(path.join(bootstrap.runRoot, '01-inventory', 'inclusion-log.md'), 'utf8')
  assert.match(inclusionLog, /generated\/final report excluded from working source set/)
  assert.match(inclusionLog, /clinician-authored intake note/)
  assert.match(inclusionLog, /unclassified or non-clinical markdown source excluded from working source set/)

  const inventoryMarkdown = await readFile(path.join(bootstrap.runRoot, '01-inventory', 'source-inventory.md'), 'utf8')
  assert.match(inventoryMarkdown, /logical source units: USC Transcript/)
})
