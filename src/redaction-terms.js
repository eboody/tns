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
  return collectSuggestedRedactionTermsForTerms(existingTerms)
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
