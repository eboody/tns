import test from 'node:test'
import assert from 'node:assert/strict'

import { loadSavedRedactionTerms, normalizeSavedRedactionTerms, saveSavedRedactionTerms } from './redaction-term-store.js'

function createMemoryStorage() {
  const data = new Map()
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    }
  }
}

test('normalizeSavedRedactionTerms trims empties and deduplicates case-insensitively', () => {
  assert.deepEqual(normalizeSavedRedactionTerms(['  John  ', '', 'john', 'Jane']), ['Jane', 'john'])
})

test('saveSavedRedactionTerms persists normalized terms', () => {
  const storage = createMemoryStorage()
  const saved = saveSavedRedactionTerms(['john', ' John Doe '], storage)

  assert.deepEqual(saved, ['john', 'John Doe'])
  assert.deepEqual(loadSavedRedactionTerms(storage), ['john', 'John Doe'])
})

test('loadSavedRedactionTerms returns empty list for malformed storage', () => {
  const storage = createMemoryStorage()
  storage.setItem('tns-deid.desktop.redaction-terms', '{bad json')
  assert.deepEqual(loadSavedRedactionTerms(storage), [])
})
