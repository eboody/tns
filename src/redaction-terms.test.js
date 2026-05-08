import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectSuggestedRedactionTermsForWorkspace,
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
      originalText: 'John J. Doe met John Doe and John.',
      redactionRanges: [{ start: 0, end: 11 }, { start: 29, end: 33 }],
      redactionTerms: [
        { matchedText: 'John J. Doe', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 },
        { matchedText: 'John', replacement: '[MANUAL_REDACTION]', entityType: 'MANUAL_REDACTION', occurrences: 1 }
      ]
    }
  ])

  assert.deepEqual(suggestions, ['Doe', 'John Doe'])
})

test('collectSuggestedRedactionTermsForWorkspace hides suggestions already redacted everywhere', () => {
  const suggestions = collectSuggestedRedactionTermsForWorkspace(
    [
      {
        originalText: 'John Doe met John.',
        redactionRanges: [{ start: 0, end: 8 }, { start: 13, end: 17 }]
      }
    ],
    [
      {
        matchedText: 'John Doe',
        replacement: '[MANUAL_REDACTION]',
        entityType: 'MANUAL_REDACTION',
        occurrences: 1,
        key: 'john doe::[MANUAL_REDACTION]::MANUAL_REDACTION'
      }
    ]
  )

  assert.deepEqual(suggestions, [])
})

test('collectSuggestedRedactionTermsForWorkspace keeps suggestions with uncovered occurrences', () => {
  const suggestions = collectSuggestedRedactionTermsForWorkspace(
    [
      {
        originalText: 'John Doe met John.',
        redactionRanges: [{ start: 0, end: 8 }]
      }
    ],
    [
      {
        matchedText: 'John Doe',
        replacement: '[MANUAL_REDACTION]',
        entityType: 'MANUAL_REDACTION',
        occurrences: 1,
        key: 'john doe::[MANUAL_REDACTION]::MANUAL_REDACTION'
      }
    ]
  )

  assert.deepEqual(suggestions, ['John'])
})
