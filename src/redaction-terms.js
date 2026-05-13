const UTF8_ENCODER = new TextEncoder()

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
  const occurrenceIndex = buildWorkspaceOccurrenceIndex(filePreviews)
  return collectSuggestedRedactionTermsForTerms(existingTerms)
    .filter((candidate) => hasUnredactedWorkspaceOccurrence(occurrenceIndex, candidate))
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

function buildWorkspaceOccurrenceIndex(filePreviews) {
  return (Array.isArray(filePreviews) ? filePreviews : [])
    .map((preview) => {
      const originalText = normalizeTerm(preview?.originalText)
      if (!originalText) {
        return null
      }

      return {
        originalText,
        ranges: normalizedSortedRanges(preview?.redactionRanges)
      }
    })
    .filter(Boolean)
}

function hasUnredactedWorkspaceOccurrence(occurrenceIndex, candidate) {
  return occurrenceIndex.some(({ originalText, ranges }) =>
    previewHasUnredactedOccurrence(originalText, ranges, candidate)
  )
}

function previewHasUnredactedOccurrence(originalText, ranges, candidate) {
  for (const match of literalCaseInsensitiveMatches(originalText, candidate)) {
    if (!hasExactMatchBoundaries(
      originalText,
      match.start,
      match.end,
      match.text,
      match.startCodeUnits,
      match.endCodeUnits
    )) {
      continue
    }

    if (!overlapsAnySortedRange(match.start, match.end, ranges)) {
      return true
    }
  }

  return false
}

function* literalCaseInsensitiveMatches(text, candidate) {
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  const offsets = createUtf8OffsetMapper(text)

  for (const match of text.matchAll(regex)) {
    const matchedText = match[0] ?? ''
    const startCodeUnits = match.index ?? 0
    const endCodeUnits = startCodeUnits + matchedText.length

    yield {
      start: offsets.byteOffsetForCodeUnit(startCodeUnits),
      end: offsets.byteOffsetForCodeUnit(endCodeUnits),
      text: matchedText,
      startCodeUnits,
      endCodeUnits
    }
  }
}

function hasExactMatchBoundaries(text, start, end, matchedText, startCodeUnits, endCodeUnits) {
  const firstChar = matchedText[0]
  const lastChar = matchedText.at(-1)
  if (!firstChar || !lastChar) {
    return false
  }

  const resolvedStartCodeUnits = Number.isFinite(startCodeUnits)
    ? startCodeUnits
    : utf8ByteOffsetToCodeUnitOffset(text, start)
  const resolvedEndCodeUnits = Number.isFinite(endCodeUnits)
    ? endCodeUnits
    : utf8ByteOffsetToCodeUnitOffset(text, end)
  const leftOk = isWordish(firstChar)
    ? !isWordish(text[resolvedStartCodeUnits - 1] ?? '')
    : true
  const rightOk = isWordish(lastChar)
    ? !isWordish(text[resolvedEndCodeUnits] ?? '')
    : true

  return leftOk && rightOk
}

function createUtf8OffsetMapper(text) {
  const codeUnitToByte = new Array(text.length + 1)
  const byteToCodeUnit = new Map()
  let byteOffset = 0

  byteToCodeUnit.set(0, 0)

  for (let index = 0; index < text.length; index += 1) {
    codeUnitToByte[index] = byteOffset
    const codePoint = text.codePointAt(index)
    const char = String.fromCodePoint(codePoint)
    byteOffset += utf8ByteLength(char)

    if (codePoint > 0xffff) {
      index += 1
      codeUnitToByte[index] = byteOffset
    }

    byteToCodeUnit.set(byteOffset, index + 1)
  }

  codeUnitToByte[text.length] = byteOffset

  return {
    byteOffsetForCodeUnit(codeUnitOffset) {
      return codeUnitToByte[Math.max(0, Math.min(codeUnitOffset, text.length))] ?? byteOffset
    },
    codeUnitOffsetForByte(byteOffsetValue) {
      if (byteToCodeUnit.has(byteOffsetValue)) {
        return byteToCodeUnit.get(byteOffsetValue)
      }

      let closestCodeUnit = text.length
      for (const [knownByteOffset, codeUnitOffset] of byteToCodeUnit) {
        if (knownByteOffset > byteOffsetValue) {
          break
        }
        closestCodeUnit = codeUnitOffset
      }
      return closestCodeUnit
    }
  }
}

function utf8ByteOffsetToCodeUnitOffset(text, byteOffset) {
  return createUtf8OffsetMapper(text).codeUnitOffsetForByte(byteOffset)
}

function utf8ByteLength(text) {
  return UTF8_ENCODER.encode(text).length
}

function isWordish(char) {
  return /[\p{L}\p{N}_]/u.test(char)
}

function normalizedSortedRanges(ranges) {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      start: Number(range?.start ?? -1),
      end: Number(range?.end ?? -1)
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < range.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
}

function overlapsAnySortedRange(start, end, ranges) {
  let low = 0
  let high = ranges.length

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (ranges[mid].end <= start) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  const range = ranges[low]
  return Boolean(range && range.start < end && start < range.end)
}
