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

  const sourceTerms = computed(() => workspaceTerms.value)
  const committedValueFor = (id) => sourceTerms.value.find((term) => term.id === id)?.matchedText ?? ''
  const draftValueFor = (id) => {
    const draft = termDrafts.value.get(id)
    if (typeof draft === 'string') {
      return draft
    }

    return committedValueFor(id)
  }

  const suggestionTerms = computed(() => {
    return sourceTerms.value
      .map((term) => ({
        ...term,
        matchedText: normalizeDraft(draftValueFor(term.id))
      }))
      .filter((term) => term.matchedText)
  })

  const relatedSuggestions = computed(() => collectSuggestedRedactionTermsForWorkspace(sourcePreviews.value, suggestionTerms.value))
  const pendingEdits = computed(() => sourceTerms.value
    .map((term) => {
      const nextTerm = normalizeDraft(draftValueFor(term.id))
      const previousTerm = committedValueFor(term.id)

      return {
        termId: term.id,
        previousTerm,
        nextTerm
      }
    })
    .filter((edit) => Boolean(edit.nextTerm) && edit.nextTerm !== edit.previousTerm))
  const hasPendingEdits = computed(() => pendingEdits.value.length > 0)

  return {
    sourcePreviews,
    sourceTerms,
    pendingEdits,
    hasPendingEdits,
    relatedSuggestions,
    syncFromDraftState({ filePreviews, terms }) {
      const existingIdsByKey = new Map(
        workspaceTerms.peek().map((term) => [term.key, term.id])
      )

      batch(() => {
        sourcePreviews.value = Array.isArray(filePreviews) ? filePreviews : []
        workspaceTerms.value = (Array.isArray(terms) ? terms : collectWorkspaceRedactionTerms(filePreviews)).map((term) => ({
          ...term,
          id: existingIdsByKey.get(term.key) ?? `workspace-term-${nextWorkspaceTermId++}`
        }))
        termDrafts.value = new Map(
          Array.from(termDrafts.peek().entries()).filter(([id]) =>
            workspaceTerms.value.some((term) => term.id === id)
          )
        )
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
    draftValueFor,
    committedValueFor,
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
