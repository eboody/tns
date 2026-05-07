import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function runHistoryReportDoctrineUpdates({ sourceDirectory, repoRoot, runId, editedDraftPath }) {
  if (!sourceDirectory || !repoRoot || !runId || !editedDraftPath) {
    throw new Error('sourceDirectory, repoRoot, runId, and editedDraftPath are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const originalDraft = await readFile(path.join(runRoot, '04-draft', 'presenting-information.draft.md'), 'utf8')
  const editedDraft = await readFile(path.resolve(editedDraftPath), 'utf8')
  const governingProfile = JSON.parse(await readFile(path.join(runRoot, '03-derived', 'governing-profile.json'), 'utf8'))

  const corrections = buildCorrections(originalDraft, editedDraft)
  const proposals = buildDoctrineProposals(corrections, governingProfile)
  const changeLog = {
    editedDraftPath: path.resolve(editedDraftPath),
    correctionCount: corrections.length,
    proposalCount: proposals.length,
    requiresHumanPromotion: true
  }

  await Promise.all([
    writeFile(path.join(runRoot, '05-audit', 'clinician-edit-corrections.json'), JSON.stringify({ corrections }, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'doctrine-update-proposals.json'), JSON.stringify({ proposals }, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'doctrine-change-log.json'), JSON.stringify(changeLog, null, 2) + '\n', 'utf8'),
    writeFile(path.join(runRoot, '05-audit', 'doctrine-update-proposals.md'), renderDoctrineProposalsMarkdown(proposals), 'utf8')
  ])

  return {
    caseId,
    runId,
    correctionCount: corrections.length,
    proposalCount: proposals.length,
    proposalPath: path.join(runRoot, '05-audit', 'doctrine-update-proposals.md')
  }
}

function buildCorrections(originalDraft, editedDraft) {
  const originalLines = originalDraft.split(/\r?\n/)
  const editedLines = editedDraft.split(/\r?\n/)
  const corrections = []
  const lineCount = Math.max(originalLines.length, editedLines.length)

  for (let index = 0; index < lineCount; index += 1) {
    const before = originalLines[index] ?? ''
    const after = editedLines[index] ?? ''
    if (before !== after) {
      corrections.push({ lineNumber: index + 1, before, after })
    }
  }

  return corrections
}

function buildDoctrineProposals(corrections, governingProfile) {
  const proposals = []
  const existingTerms = new Set(governingProfile.houseLexicon.global.terms.map((rule) => rule.preferredTerm.toLowerCase()))

  for (const correction of corrections) {
    const beforeWords = tokenize(correction.before)
    const afterWords = tokenize(correction.after)
    const addedWords = afterWords.filter((word) => !beforeWords.includes(word))
    const removedWords = beforeWords.filter((word) => !afterWords.includes(word))

    if (addedWords.length > 0) {
      const candidate = addedWords.find((word) => !existingTerms.has(word.toLowerCase()))
      if (candidate) {
        proposals.push({
          kind: 'candidate_style_update',
          title: `Consider promoting '${candidate}' into the house lexicon`,
          rationale: `Clinician edit introduced '${candidate}' where the generated draft used different wording.`,
          evidence: correction,
          requiresClinicianConfirmation: true
        })
      }
    }

    if (/Reason for Referral|Presenting Complaints\/Symptoms|Medical and Developmental History|Family History|Psychosocial History|Educational and Occupational History|Previous Evaluations/.test(correction.after) && correction.before !== correction.after) {
      proposals.push({
        kind: 'candidate_structure_update',
        title: `Consider preserving edited section heading '${correction.after.trim()}'`,
        rationale: 'Clinician edit adjusted visible section labeling.',
        evidence: correction,
        requiresClinicianConfirmation: true
      })
    }

    if (/\b(no|not|never|denied)\b/i.test(correction.after) && /\b(no|not|never|denied)\b/i.test(correction.before) === false) {
      proposals.push({
        kind: 'candidate_scope_rule_update',
        title: 'Consider tightening attribution or negation phrasing in generated drafts',
        rationale: 'Clinician edit introduced stronger negation/denial language than the generated version.',
        evidence: correction,
        requiresClinicianConfirmation: true
      })
    }
  }

  return dedupeProposals(proposals)
}

function dedupeProposals(proposals) {
  const seen = new Set()
  return proposals.filter((proposal) => {
    const key = `${proposal.kind}:${proposal.title}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function renderDoctrineProposalsMarkdown(proposals) {
  const lines = ['# Doctrine Update Proposals', '']
  if (proposals.length === 0) {
    lines.push('- No doctrine proposals were derived from the provided clinician edits.', '')
    return lines.join('\n')
  }

  for (const proposal of proposals) {
    lines.push(`## ${proposal.title}`, '')
    lines.push(`- Kind: ${proposal.kind}`)
    lines.push(`- Rationale: ${proposal.rationale}`)
    lines.push(`- Requires clinician confirmation: ${proposal.requiresClinicianConfirmation}`)
    lines.push(`- Evidence line ${proposal.evidence.lineNumber}:`)
    lines.push(`  - Before: ${proposal.evidence.before}`)
    lines.push(`  - After: ${proposal.evidence.after}`)
    lines.push('')
  }

  return lines.join('\n')
}
