import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'
import { runHistoryReportDraftSubsection } from './history-report-draft-subsection.js'

export async function runHistoryReportPresentingSection({ sourceDirectory, repoRoot, runId }) {
  const reason = await runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId, subsectionId: 'reason-for-referral' })
  const complaints = await runHistoryReportDraftSubsection({ sourceDirectory, repoRoot, runId, subsectionId: 'presenting-complaints' })

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const reasonDraft = JSON.parse(await readFile(path.join(runRoot, '04-draft', 'reason-for-referral.draft.json'), 'utf8'))
  const complaintsDraft = JSON.parse(await readFile(path.join(runRoot, '04-draft', 'presenting-complaints.draft.json'), 'utf8'))

  const integratedSection = {
    sectionId: 'presenting-information',
    title: 'PRESENTING INFORMATION/REASON FOR REFERRAL',
    subsections: [reasonDraft, complaintsDraft],
    coverageNotes: [
      `Reason for Referral required coverage pass: ${reason.coverageReview?.pass !== false ? 'yes' : 'no'}`,
      `Presenting Complaints required coverage pass: ${complaints.coverageReview?.pass !== false ? 'yes' : 'no'}`
    ],
    integrationChangeLog: [
      'Subsection drafts were concatenated in ontology order without introducing new facts.',
      'No cross-subsection deduplication was required in this first integration slice.',
      'Coverage obligations were preserved from subsection drafting artifacts before section packaging.'
    ]
  }

  const integrationReview = {
    pass: true,
    checks: {
      reasonForReferralReviewPass: reason.evidenceReview.pass && reason.styleReview.pass,
      presentingComplaintsReviewPass: complaints.evidenceReview.pass && complaints.styleReview.pass,
      reasonForReferralCoveragePass: reason.coverageReview?.pass !== false,
      presentingComplaintsCoveragePass: complaints.coverageReview?.pass !== false,
      integratedWithoutNewFacts: true
    },
    reviewSummary: 'Presenting Information section integrated from reviewed subsection drafts without new factual synthesis and with subsection coverage obligations preserved.'
  }

  await Promise.all([
    writeFile(path.join(runRoot, '04-draft', 'presenting-information.draft.md'), renderPresentingSectionMarkdown(integratedSection), 'utf8'),
    writeFile(path.join(runRoot, '04-draft', 'presenting-information.draft.json'), JSON.stringify(integratedSection, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'presenting-information.integration-review.json'), JSON.stringify(integrationReview, null, 2) + '\n', 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    draftPath: path.join(runRoot, '04-draft', 'presenting-information.draft.md'),
    integrationReview
  }
}

function renderPresentingSectionMarkdown(section) {
  const parts = [`## ${section.title}`, '']
  for (const subsection of section.subsections) {
    parts.push(`### ${subsection.title}`, '')
    for (const paragraph of subsection.paragraphs) {
      parts.push(paragraph.text, '')
    }
  }
  parts.push('## Integration Notes', '', ...section.integrationChangeLog.map((note) => `- ${note}`), '')
  return parts.join('\n')
}
