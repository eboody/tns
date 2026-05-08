import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectSuggestedRedactionTerms,
  collectWorkspaceRedactionTerms,
  deriveRelatedRedactionTerms
} from './redaction-terms.js'

test('collectWorkspaceRedactionTerms merges case-insensitive duplicates across previews', () => {
  const terms = collectWorkspaceRedactionTerms([
    {
      redactionTerms: [
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    },
    {
      redactionTerms: [
        { matchedText: 'JOHN', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 2 }
      ]
    }
  ])

  assert.deepEqual(terms, [
    {
      key: 'john::[MANUAL_REDACTION]::MANUAL_REDACTION',
      matchedText: 'John',
      replacement: '[MANUAL_REDACTION]',
      entityType: 'MANUAL_REDACTION',
      occurrences: 3
    }
  ])
})

test('deriveRelatedRedactionTerms suggests shorter person-name variants', () => {
  assert.deepEqual(deriveRelatedRedactionTerms('John J. Doe'), ['Doe', 'John', 'John Doe'])
  assert.deepEqual(deriveRelatedRedactionTerms('Elm Hall'), ['Elm', 'Hall'])
  assert.deepEqual(deriveRelatedRedactionTerms('lowercase phrase'), [])
})

test('collectSuggestedRedactionTerms omits already-redacted related terms', () => {
  const suggestions = collectSuggestedRedactionTerms([
    {
      redactionTerms: [
        { matchedText: 'John J. Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 },
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  assert.deepEqual(suggestions, ['Doe', 'John Doe'])
})
