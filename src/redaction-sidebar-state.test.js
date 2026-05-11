import test from 'node:test'
import assert from 'node:assert/strict'

import { createRedactionSidebarState } from './redaction-sidebar-state.js'

test('sidebar state recomputes related suggestions from inline drafts', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({ filePreviews: [
    {
      originalText: 'John J. Doe met John.',
      redactionRanges: [{ start: 0, end: 11 }],
      redactionTerms: [
        { matchedText: 'John J. Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ] })

  assert.deepEqual(state.relatedSuggestions.value, ['John'])

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')

  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state keeps draft edits separate from committed redaction terms until applied', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({ filePreviews: [
    {
      originalText: 'John Doe met John.',
      redactionRanges: [{ start: 0, end: 8 }],
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ] })

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')

  assert.equal(state.draftValueFor(id), 'John')
  assert.equal(state.committedValueFor(id), 'John Doe')
  assert.equal(state.sourceTerms.value[0].matchedText, 'John Doe')
})

test('sidebar state clears drafts when previews resync', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({ filePreviews: [
    {
      originalText: 'John Doe',
      redactionRanges: [{ start: 0, end: 8 }],
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ] })

  const id = state.sourceTerms.value[0].id
  state.setDraft(id, 'John')
  assert.equal(state.draftValueFor(id), 'John')

  state.syncFromDraftState({ filePreviews: [
    {
      originalText: 'John',
      redactionRanges: [{ start: 0, end: 4 }],
      redactionTerms: [
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ] })

  assert.equal(state.draftValueFor(state.sourceTerms.value[0].id), 'John')
  assert.deepEqual(state.relatedSuggestions.value, [])
})

test('sidebar state can advance the committed term without clearing a newer draft', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({ filePreviews: [
    {
      originalText: 'John Doe',
      redactionRanges: [{ start: 0, end: 8 }],
      redactionTerms: [
        { matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ] })

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

test('sidebar state does not surface saved manual terms without matching preview terms', () => {
  const state = createRedactionSidebarState()

  state.setPersistedTerms(['John Doe'])
  state.syncFromDraftState({ filePreviews: [] })

  assert.deepEqual(state.sourceTerms.value, [])
})

test('sidebar state preserves drafts for surviving term ids across draft-state syncs', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({
    filePreviews: [{ originalText: 'alpha beta' }],
    terms: [
      { key: 'alpha::[MANUAL_REDACTION]::MANUAL_REDACTION', matchedText: 'alpha', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 },
      { key: 'beta::[MANUAL_REDACTION]::MANUAL_REDACTION', matchedText: 'beta', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
    ]
  })

  const alphaId = state.sourceTerms.value.find((term) => term.matchedText === 'alpha').id
  state.setDraft(alphaId, 'alpha revised')

  state.syncFromDraftState({
    filePreviews: [{ originalText: 'alpha beta gamma' }],
    terms: [
      { key: 'alpha::[MANUAL_REDACTION]::MANUAL_REDACTION', matchedText: 'alpha', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 },
      { key: 'gamma::[MANUAL_REDACTION]::MANUAL_REDACTION', matchedText: 'gamma', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
    ]
  })

  const nextAlphaId = state.sourceTerms.value.find((term) => term.matchedText === 'alpha').id
  assert.equal(nextAlphaId, alphaId)
  assert.equal(state.draftValueFor(alphaId), 'alpha revised')
  assert.equal(state.sourceTerms.value.some((term) => term.matchedText === 'beta'), false)
})

test('sidebar state clears stale drafts when the workspace draft scope changes', () => {
  const state = createRedactionSidebarState()

  state.syncFromDraftState({
    filePreviews: [{ inputPath: '/tmp/first.txt', path: '/tmp/first.txt', originalText: 'John Doe' }],
    terms: [
      { key: 'john doe::[MANUAL_REDACTION]::MANUAL_REDACTION', identityKey: '0:8:[MANUAL_REDACTION]', matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
    ]
  })

  const firstId = state.sourceTerms.value[0].id
  state.setDraft(firstId, 'John')

  state.syncFromDraftState({
    filePreviews: [{ inputPath: '/tmp/second.txt', path: '/tmp/second.txt', originalText: 'John Doe' }],
    terms: [
      { key: 'john doe::[MANUAL_REDACTION]::MANUAL_REDACTION', identityKey: '0:8:[MANUAL_REDACTION]', matchedText: 'John Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
    ]
  })

  const nextId = state.sourceTerms.value[0].id
  assert.equal(state.draftValueFor(nextId), 'John Doe')
})
