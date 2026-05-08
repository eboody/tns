import { batch, computed, signal } from '@preact/signals-core'

import {
  collectSuggestedRedactionTermsForWorkspace,
  collectWorkspaceRedactionTerms,
  redactionTermKey
} from './redaction-terms.js'

export function createRedactionSidebarState() {
  let nextWorkspaceTermId = 1
  const sourcePreviews = signal([])
  const workspaceTerms = signal([])
  const persistedTerms = signal([])
  const termDrafts = signal(new Map())

  const sourceTerms = computed(() => mergePersistedTerms(
    workspaceTerms.value,
    persistedTerms.value
  ))

  const suggestionTerms = computed(() => {
    const drafts = termDrafts.value

    return sourceTerms.value
      .map((term) => ({
        ...term,
        matchedText: normalizeDraft(drafts.get(term.id) ?? term.matchedText)
      }))
      .filter((term) => term.matchedText)
  })

  const relatedSuggestions = computed(() => collectSuggestedRedactionTermsForWorkspace(sourcePreviews.value, suggestionTerms.value))

  return {
    sourcePreviews,
    sourceTerms,
    relatedSuggestions,
    syncFromPreviews(filePreviews) {
      const existingIdsByKey = new Map(
        workspaceTerms.peek().map((term) => [term.key, term.id])
      )

      batch(() => {
        sourcePreviews.value = Array.isArray(filePreviews) ? filePreviews : []
        workspaceTerms.value = collectWorkspaceRedactionTerms(filePreviews).map((term) => ({
          ...term,
          id: existingIdsByKey.get(term.key) ?? `workspace-term-${nextWorkspaceTermId++}`
        }))
        termDrafts.value = new Map()
      })
    },
    setPersistedTerms(terms) {
      persistedTerms.value = (Array.isArray(terms) ? terms : [])
        .map(normalizePersistedEntry)
        .filter(Boolean)
    },
    rememberPersistedTerm(matchedText) {
      const normalized = normalizePersistedEntry(matchedText)
      if (!normalized) {
        return
      }

      const existing = persistedTerms.peek().some((term) => term.key === normalized.key)
      if (existing) {
        return
      }

      persistedTerms.value = [...persistedTerms.peek(), normalized]
    },
    forgetPersistedTermById(id) {
      persistedTerms.value = persistedTerms.peek().filter((term) => term.id !== id)
    },
    replacePersistedTerm(id, matchedText) {
      const normalizedText = normalizeDraft(matchedText)
      if (!normalizedText) {
        return
      }

      persistedTerms.value = persistedTerms.peek().map((term) => term.id === id
        ? normalizePersistedEntry({ ...term, matchedText: normalizedText, id })
        : term)
    },
    setDraft(id, value) {
      const nextDrafts = new Map(termDrafts.peek())
      nextDrafts.set(id, value)
      termDrafts.value = nextDrafts
    },
    resetDraft(id) {
      const nextDrafts = new Map(termDrafts.peek())
      nextDrafts.delete(id)
      termDrafts.value = nextDrafts
    },
    draftValueFor(id) {
      const draft = termDrafts.peek().get(id)
      if (typeof draft === 'string') {
        return draft
      }

      return this.committedValueFor(id)
    },
    committedValueFor(id) {
      return sourceTerms.value.find((term) => term.id === id)?.matchedText ?? ''
    },
    applyCommittedValue(id, matchedText) {
      const normalized = normalizeDraft(matchedText)

      workspaceTerms.value = workspaceTerms.peek().map((term) => term.id === id || term.key === id
        ? {
            ...term,
            matchedText: normalized,
            key: redactionTermKey({ ...term, matchedText: normalized })
          }
        : term)

      persistedTerms.value = persistedTerms.peek().map((term) => term.id === id
        ? {
            ...term,
            matchedText: normalized,
            key: redactionTermKey({ ...term, matchedText: normalized })
          }
        : term)

      if (normalizeDraft(termDrafts.peek().get(id)) === normalized) {
        this.resetDraft(id)
      }
    }
  }
}

function normalizeDraft(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePersistedEntry(term) {
  const matchedText = normalizeDraft(term?.matchedText ?? term)
  if (!matchedText) {
    return null
  }

  const key = redactionTermKey({
    matchedText,
    replacement: '[MANUAL_REDACTION]',
    entityType: 'MANUAL_REDACTION'
  })

  return {
    id: term?.id ?? key,
    key,
    matchedText,
    replacement: '[MANUAL_REDACTION]',
    entityType: 'MANUAL_REDACTION'
  }
}

function mergePersistedTerms(workspaceTerms, persistedTerms) {
  const merged = new Map(
    workspaceTerms.map((term) => [term.key, { ...term, id: term.id ?? term.key }])
  )

  for (const persistedTerm of Array.isArray(persistedTerms) ? persistedTerms : []) {
    const matchedText = normalizeDraft(persistedTerm?.matchedText ?? persistedTerm)
    if (!matchedText) {
      continue
    }

    const key = redactionTermKey({
      matchedText,
      replacement: '[MANUAL_REDACTION]',
      entityType: 'MANUAL_REDACTION'
    })

    if (!merged.has(key)) {
      merged.set(key, {
        id: persistedTerm?.id ?? key,
        key,
        matchedText,
        replacement: '[MANUAL_REDACTION]',
        entityType: 'MANUAL_REDACTION',
        occurrences: 0
      })
      continue
    }

    const existing = merged.get(key)
    if (persistedTerm?.id) {
      existing.id = persistedTerm.id
    }
  }

  return Array.from(merged.values())
}
