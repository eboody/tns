import test from 'node:test'
import assert from 'node:assert/strict'

import { createRedactionSidebarState } from './redaction-sidebar-state.js'

test('sidebar state recomputes related suggestions from inline drafts', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      redactionTerms: [
        { matchedText: 'John J. Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  assert.deepEqual(state.relatedSuggestions.value, ['Doe', 'John', 'John Doe'])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')

  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state clears drafts when previews resync', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')
  assert.equal(state.draftValueFor(id), 'John')

  state.syncFromPreviews([
    {
      redactionTerms: [
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  assert.equal(state.draftValueFor(state.sourceTerms.value[0].id), 'John')
  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state can advance the committed term without clearing a newer draft', () => {
  const state = createRedactionSidebarState()

  state.syncFromPreviews([
    {
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John D')
  state.applyCommittedValue(id, 'John D')

  assert.equal(state.committedValueFor(id), 'John D')
  assert.equal(state.draftValueFor(id), 'John D')

  state.setDraft(id, 'John Do')
  state.applyCommittedValue(id, 'John D')

  assert.equal(state.committedValueFor(id), 'John D')
  assert.equal(state.draftValueFor(id), 'John Do')
})
