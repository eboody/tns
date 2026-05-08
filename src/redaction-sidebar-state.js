import { batch, computed, signal } from '@preact/signals-core'

import {
  collectSuggestedRedactionTermsForTerms,
  collectWorkspaceRedactionTerms,
  redactionTermKey
} from './redaction-terms.js'

export function createRedactionSidebarState() {
  let nextId = 1
  const sourceTerms = signal([])
  const termDrafts = signal(new Map())

  const suggestionTerms = computed(() => {
    const drafts = termDrafts.value

    return sourceTerms.value
      .map((term) => ({
        ...term,
        matchedText: normalizeDraft(drafts.get(term.id) ?? term.matchedText)
      }))
      .filter((term) => term.matchedText)
  })

  const relatedSuggestions = computed(() => collectSuggestedRedactionTermsForTerms(suggestionTerms.value))

  return {
    sourceTerms,
    relatedSuggestions,
    syncFromPreviews(filePreviews) {
      const nextTerms = collectWorkspaceRedactionTerms(filePreviews).map((term) => ({
        ...term,
        id: `term-${nextId++}`
      }))

      batch(() => {
        sourceTerms.value = nextTerms
        termDrafts.value = new Map()
      })
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
      return sourceTerms.peek().find((term) => term.id === id)?.matchedText ?? ''
    },
    applyCommittedValue(id, matchedText) {
      const normalized = normalizeDraft(matchedText)
      sourceTerms.value = sourceTerms.peek().map((term) => term.id === id
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
