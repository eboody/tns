export function collectWorkspaceRedactionTerms(filePreviews) {
  const entries = new Map()

  for (const preview of Array.isArray(filePreviews) ? filePreviews : []) {
    for (const term of Array.isArray(preview?.redactionTerms) ? preview.redactionTerms : []) {
      const matchedText = normalizeTerm(term?.matchedText)
      if (!matchedText) {
        continue
      }

      const replacement = normalizeTerm(term?.replacement)
      const entityType = normalizeTerm(term?.entityType)
      const key = redactionTermKey({ matchedText, replacement, entityType })
      const occurrences = Number(term?.occurrences ?? 0) || 0
      const existing = entries.get(key)

      if (existing) {
        existing.occurrences += Math.max(occurrences, 1)
        continue
      }

      entries.set(key, {
        key,
        matchedText,
        replacement,
        entityType,
        occurrences: Math.max(occurrences, 1)
      })
    }
  }

  return Array.from(entries.values()).sort((left, right) =>
    right.occurrences - left.occurrences || left.matchedText.localeCompare(right.matchedText)
  )
}

export function deriveRelatedRedactionTerms(term) {
  const normalized = normalizeTerm(term)
  if (!looksLikePersonName(normalized)) {
    return []
  }

  const words = normalized.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
  const substantiveWords = words.filter((word) => word.length > 1)
  const suggestions = new Set()

  if (substantiveWords.length >= 2) {
    suggestions.add(`${substantiveWords[0]} ${substantiveWords.at(-1)}`)
  }

  for (const word of substantiveWords) {
    suggestions.add(word)
  }

  suggestions.delete(normalized)
  return Array.from(suggestions).sort((left, right) => left.length - right.length || left.localeCompare(right))
}

export function collectSuggestedRedactionTerms(filePreviews) {
  const existingTerms = collectWorkspaceRedactionTerms(filePreviews)
  return collectSuggestedRedactionTermsForWorkspace(filePreviews, existingTerms)
}

export function collectSuggestedRedactionTermsForTerms(existingTerms) {
  const seen = new Set(existingTerms.map((term) => term.matchedText.toLowerCase()))
  const suggestions = []

  for (const term of existingTerms) {
    for (const candidate of deriveRelatedRedactionTerms(term.matchedText)) {
      const key = candidate.toLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      suggestions.push(candidate)
    }
  }

  return suggestions
}

export function collectSuggestedRedactionTermsForWorkspace(filePreviews, existingTerms) {
  return collectSuggestedRedactionTermsForTerms(existingTerms)
    .filter((candidate) => hasUnredactedWorkspaceOccurrence(filePreviews, candidate))
}

export function redactionTermKey(term) {
  const matchedText = normalizeTerm(term?.matchedText)
  const replacement = normalizeTerm(term?.replacement)
  const entityType = normalizeTerm(term?.entityType)
  return `${matchedText.toLowerCase()}::${replacement}::${entityType}`
}

function looksLikePersonName(value) {
  if (!value.includes(' ')) {
    return false
  }

  const words = value.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
  if (words.length < 2) {
    return false
  }

  return words.every((word) => /^[A-Z][a-z'’-]*$/.test(word))
}

function normalizeTerm(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasUnredactedWorkspaceOccurrence(filePreviews, candidate) {
  return (Array.isArray(filePreviews) ? filePreviews : []).some((preview) =>
    previewHasUnredactedOccurrence(preview, candidate)
  )
}

function previewHasUnredactedOccurrence(preview, candidate) {
  const originalText = normalizeTerm(preview?.originalText)
  if (!originalText) {
    return false
  }

  const ranges = Array.isArray(preview?.redactionRanges) ? preview.redactionRanges : []
  for (const match of literalCaseInsensitiveMatches(originalText, candidate)) {
    if (!hasExactMatchBoundaries(originalText, match.start, match.end, match.text)) {
      continue
    }

    if (!ranges.some((range) => overlapsRange(match.start, match.end, range))) {
      return true
    }
  }

  return false
}

function literalCaseInsensitiveMatches(text, candidate) {
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  const matches = []

  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0
    const matchedText = match[0] ?? ''
    matches.push({ start, end: start + matchedText.length, text: matchedText })
  }

  return matches
}

function hasExactMatchBoundaries(text, start, end, matchedText) {
  const firstChar = matchedText[0]
  const lastChar = matchedText.at(-1)
  if (!firstChar || !lastChar) {
    return false
  }

  const leftOk = isWordish(firstChar)
    ? !isWordish(text[start - 1] ?? '')
    : true
  const rightOk = isWordish(lastChar)
    ? !isWordish(text[end] ?? '')
    : true

  return leftOk && rightOk
}

function isWordish(char) {
  return /[\p{L}\p{N}_]/u.test(char)
}

function overlapsRange(start, end, range) {
  const rangeStart = Number(range?.start ?? -1)
  const rangeEnd = Number(range?.end ?? -1)
  return start < rangeEnd && end > rangeStart
}
