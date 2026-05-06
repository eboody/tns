import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_APP_SETTINGS, loadAppSettings, normalizeAppSettings, saveAppSettings } from './settings-store.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }
}

test('loadAppSettings returns defaults when storage is empty', () => {
  assert.deepEqual(loadAppSettings(createMemoryStorage()), DEFAULT_APP_SETTINGS)
})

test('saveAppSettings persists normalized structured settings', () => {
  const storage = createMemoryStorage()

  const saved = saveAppSettings(
    {
      clientReplacement: '  CLIENT  ',
      clientVariants: ' Jane Doe\n\n Jane D. ',
      exactEntities: [{ entityType: '  provider ', replacement: ' PROVIDER ', variants: 'Dr. Smith\n Smith ' }],
      patterns: {
        dates: { enabled: true, replacement: ' DATE ' },
        emails: { enabled: false, replacement: ' EMAIL ' },
        phones: { enabled: false, replacement: '' }
      },
      ner: { enabled: true, modelPath: ' /tmp/model.onnx ', tokenizerPath: ' /tmp/tokenizer.json ', minConfidence: '0.82' }
    },
    storage
  )

  assert.deepEqual(saved, {
    clientReplacement: 'CLIENT',
    clientVariants: 'Jane Doe\nJane D.',
    exactEntities: [{ entityType: 'provider', replacement: 'PROVIDER', variants: 'Dr. Smith\nSmith' }],
    patterns: {
      dates: { enabled: true, replacement: 'DATE' },
      emails: { enabled: false, replacement: 'EMAIL' },
      phones: { enabled: false, replacement: '[PHONE]' }
    },
    ner: { enabled: true, modelPath: '/tmp/model.onnx', tokenizerPath: '/tmp/tokenizer.json', minConfidence: '0.82' }
  })
  assert.deepEqual(loadAppSettings(storage), saved)
})

test('normalizeAppSettings falls back for malformed values', () => {
  assert.deepEqual(normalizeAppSettings({ ner: { minConfidence: null }, exactEntities: [42] }), {
    ...DEFAULT_APP_SETTINGS
  })
})
