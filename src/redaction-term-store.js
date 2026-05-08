const STORAGE_KEY = 'tns-deid.desktop.redaction-terms'

export function loadSavedRedactionTerms(storage = globalThis.localStorage) {
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    return normalizeSavedRedactionTerms(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveSavedRedactionTerms(terms, storage = globalThis.localStorage) {
  const normalized = normalizeSavedRedactionTerms(terms)
  if (storage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }

  return normalized
}

export function normalizeSavedRedactionTerms(terms) {
  const unique = new Map()

  for (const term of Array.isArray(terms) ? terms : []) {
    const normalized = typeof term === 'string' ? term.trim() : ''
    if (!normalized) {
      continue
    }

    unique.set(normalized.toLowerCase(), normalized)
  }

  return Array.from(unique.values()).sort((left, right) => left.localeCompare(right))
}
