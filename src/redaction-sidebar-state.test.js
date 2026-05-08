import test from 'node:test'
import assert from 'node:assert/strict'

import { createRedactionSidebarState } from './redaction-sidebar-state.js'

test('sidebar state recomputes related suggestions from inline drafts', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      originalText: 'John J. Doe met John.',
      redactionRanges: [{ start: 0, end: 11 }],
      redactionTerms: [
        { matchedText: 'John J. Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ], [])

  assert.deepEqual(state.relatedSuggestions.value, ['John'])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')

  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state clears drafts when previews resync', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      originalText: 'John Doe',
      redactionRanges: [{ start: 0, end: 8 }],
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ], [])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')
  assert.equal(state.draftValueFor(id), 'John')

  state.syncFromPreviews([
    {
      originalText: 'John',
      redactionRanges: [{ start: 0, end: 4 }],
      redactionTerms: [
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ], [])

  assert.equal(state.draftValueFor(state.sourceTerms.value[0].id), 'John')
  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state can advance the committed term without clearing a newer draft', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      originalText: 'John Doe',
      redactionRanges: [{ start: 0, end: 8 }],
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ], [])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John D')
  state.applyCommittedValue(id, 'John D')

  const updatedId = state.sourceTerms.value[0].id
  assert.equal(state.committedValueFor(updatedId), 'John D')
  assert.equal(state.draftValueFor(updatedId), 'John D')

  state.setDraft(updatedId, 'John Do')
  state.applyCommittedValue(updatedId, 'John D')

  assert.equal(state.committedValueFor(state.sourceTerms.value[0].id), 'John D')
  assert.equal(state.draftValueFor(updatedId), 'John Do')
})

test('sidebar state preserves saved manual terms across preview loads', () => {
  const state = createRedactionSidebarState()

  state.setPersistedTerms(['John Doe'])
  state.syncFromPreviews([])

  assert.equal(state.sourceTerms.value[0].matchedText, 'John Doe')
  assert.equal(state.sourceTerms.value[0].occurrences, 0)
})
