import { batch, computed, signal } from '@preact/signals-core'

import {
  collectSuggestedRedactionTermsForWorkspace,
  collectWorkspaceRedactionTerms,
  redactionTermKey
} from './redaction-terms.js'

export function createRedactionSidebarState() {
  let nextWorkspaceTermId = 1
  let syncedWorkspaceKey = null
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
      const nextWorkspaceKey = sidebarDraftScopeKey(filePreviews)
      const preserveDrafts = syncedWorkspaceKey === null || syncedWorkspaceKey === nextWorkspaceKey
      const existingIdsByKey = new Map(
        workspaceTerms.peek().map((term) => [term.identityKey ?? term.key, term.id])
      )
      const existingDraftsByIdentityKey = new Map(
        (preserveDrafts ? workspaceTerms.peek() : [])
          .map((term) => {
            const draft = termDrafts.peek().get(term.id)
            return draft === undefined
              ? null
              : [term.identityKey ?? term.key, draft]
          })
          .filter(Boolean)
      )

      batch(() => {
        syncedWorkspaceKey = nextWorkspaceKey
        sourcePreviews.value = Array.isArray(filePreviews) ? filePreviews : []
        workspaceTerms.value = (Array.isArray(terms) ? terms : collectWorkspaceRedactionTerms(filePreviews)).map((term) => ({
          ...term,
          id: existingIdsByKey.get(term.identityKey ?? term.key) ?? `workspace-term-${nextWorkspaceTermId++}`
        }))
        termDrafts.value = new Map(
          workspaceTerms.value.flatMap((term) => {
            const draft = existingDraftsByIdentityKey.get(term.identityKey ?? term.key)
            return draft === undefined ? [] : [[term.id, draft]]
          })
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

function sidebarDraftScopeKey(filePreviews) {
  return (Array.isArray(filePreviews) ? filePreviews : [])
    .map((preview) => `${preview?.inputPath ?? preview?.input_path ?? ''}\u0000${preview?.path ?? ''}`)
    .join('\u0001')
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
