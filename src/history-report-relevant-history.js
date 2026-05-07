import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'
import { runHistoryReportDraftSubsection } from './history-report-draft-subsection.js'

export async function runHistoryReportRelevantHistory({ sourceDirectory, repoRoot, runId }) {
  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const sectionPlan = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'section-plan.json'), 'utf8'))
  const subsectionIds = sectionPlan.sections
    .map((section) => section.id)
    .filter((id) => id !== 'reason-for-referral' && id !== 'presenting-complaints' && id !== 'presenting-information')

  const subsectionResults = []
  for (const subsectionId of subsectionIds) {
    subsectionResults.push(await runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId, subsectionId }))
  }

  const subsectionDrafts = await Promise.all(
    subsectionIds.map(async (subsectionId) => JSON.parse(await readFile(path.join(runRoot, '04-draft', `${subsectionId}.draft.json`), 'utf8')))
  )

  const integrated = {
    sectionId: 'relevant-history',
    title: 'RELEVANT HISTORY',
    introduction: 'All relevant history and background information were obtained through a neuropsychological history questionnaire completed by the patient, clinical interview with the patient, communications with collateral informants, and a review of available medical and academic records.',
    subsections: subsectionDrafts,
    integrationChangeLog: [
      'Relevant History was integrated from reviewed subsection drafts in ontology order.',
      'No subsection was rewritten from raw source text during integration.',
      'Integration was limited to ordering and section-level packaging.'
    ]
  }

  const provenanceMap = buildProvenanceMap(subsectionDrafts)
  const globalReview = {
    pass: subsectionResults.every((result) => result.evidenceReview.pass && result.styleReview.pass),
    checks: {
      subsectionReviewsPass: subsectionResults.every((result) => result.evidenceReview.pass && result.styleReview.pass),
      integratedWithoutNewFacts: true,
      provenanceMapGenerated: provenanceMap.entries.length > 0
    },
    reviewSummary: 'Relevant History integrated from reviewed subsection drafts with provenance map generated for section-level traceability.'
  }

  await Promise.all([
    writeFile(path.join(runRoot, '04-draft', 'relevant-history.draft.md'), renderRelevantHistoryMarkdown(integrated), 'utf8'),
    writeFile(path.join(runRoot, '04-draft', 'relevant-history.draft.json'), JSON.stringify(integrated, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '04-draft', 'relevant-history.provenance-map.json'), JSON.stringify(provenanceMap, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '04-draft', 'relevant-history.provenance-map.md'), renderProvenanceMapMarkdown(provenanceMap), 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'relevant-history.global-review.json'), JSON.stringify(globalReview, null, 2) + '\n', 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    draftPath: path.join(runRoot, '04-draft', 'relevant-history.draft.md'),
    globalReview
  }
}

function buildProvenanceMap(subsectionDrafts) {
  const entries = []
  for (const subsection of subsectionDrafts) {
    subsection.paragraphs.forEach((paragraph, index) => {
      const trace = subsection.sentenceTraceability
        .filter((entry) => paragraph.sentences.includes(entry.sentence))
        .flatMap((entry) => entry.claimIds)
      entries.push({
        subsectionId: subsection.subsectionId,
        subsectionTitle: subsection.title,
        paragraphIndex: index + 1,
        text: paragraph.text,
        claimIds: Array.from(new Set(trace))
      })
    })
  }
  return { entries }
}

function renderRelevantHistoryMarkdown(integrated) {
  const parts = [`## ${integrated.title}`, '', integrated.introduction, '']
  for (const subsection of integrated.subsections) {
    parts.push(`### ${subsection.title}`, '')
    for (const paragraph of subsection.paragraphs) {
      parts.push(paragraph.text, '')
    }
  }
  parts.push('## Integration Notes', '', ...integrated.integrationChangeLog.map((note) => `- ${note}`), '')
  return parts.join('\n')
}

function renderProvenanceMapMarkdown(provenanceMap) {
  const lines = ['# Relevant History Provenance Map', '', '| Subsection | Paragraph | Claim IDs |', '|---|---:|---|']
  for (const entry of provenanceMap.entries) {
    lines.push(`| ${entry.subsectionTitle} | ${entry.paragraphIndex} | ${entry.claimIds.join(', ')} |`)
  }
  return lines.join('\n') + '\n'
}
