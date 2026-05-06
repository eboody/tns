const EXPLANATION_PATTERNS = [
  /original preview is not available/i,
  /non-text content omissions were detected/i,
  /extracted text fidelity is degraded/i,
  /structural extraction loss is suspected/i
]

export function buildReviewNotice(rawNote) {
  if (!rawNote) {
    return null
  }

  const sentences = rawNote
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const explanatorySentences = sentences.filter((sentence) =>
    EXPLANATION_PATTERNS.some((pattern) => pattern.test(sentence))
  )

  if (explanatorySentences.length === 0) {
    return null
  }

  return explanatorySentences.join(' ')
}
