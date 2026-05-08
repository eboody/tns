import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { deriveCaseId } from './history-report-bootstrap.js'

export async function finalizeHistoryReport({ sourceDirectory, repoRoot, runId }) {
  if (!sourceDirectory || !repoRoot || !runId) {
    throw new Error('sourceDirectory, repoRoot, and runId are required')
  }

  const resolvedSourceDirectory = path.resolve(sourceDirectory)
  const caseId = deriveCaseId(resolvedSourceDirectory)
  const runRoot = path.join(repoRoot, '.sandcastle', 'history-report', 'cases', caseId, 'runs', runId)
  const outputRoot = path.join(runRoot, '06-output')
  await mkdir(outputRoot, { recursive: true })

  const presenting = await readFile(path.join(runRoot, '04-draft', 'presenting-information.draft.md'), 'utf8')
  const relevant = await readFile(path.join(runRoot, '04-draft', 'relevant-history.draft.md'), 'utf8')
  const memo = await readFile(path.join(runRoot, '05-audit', 'clinician-memo.md'), 'utf8')
  const branching = await readFile(path.join(runRoot, '05-audit', 'branching-review.md'), 'utf8')

  const historyReport = [
    '# History Section Report',
    '',
    presenting.trim(),
    '',
    relevant.trim(),
    ''
  ].join('\n')

  const clinicianPacket = [
    '# Clinician Review Packet',
    '',
    memo.trim(),
    '',
    branching.trim(),
    ''
  ].join('\n')

  const historyPath = path.join(outputRoot, 'history-section-report.md')
  const packetPath = path.join(outputRoot, 'clinician-review-packet.md')

  await Promise.all([
    writeFile(historyPath, historyReport, 'utf8'),
    writeFile(packetPath, clinicianPacket, 'utf8')
  ])

  return {
    caseId,
    runId,
    runRoot,
    historyPath,
    packetPath
  }
}
