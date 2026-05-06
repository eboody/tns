import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PROFILE_ID,
  getActiveProfile,
  getCurrentCaseContext,
  loadAppSettings,
  normalizeAppSettings,
  saveAppSettings,
  updateActiveProfileAndCaseContext
} from './settings-store.js'

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

test('saveAppSettings persists normalized split settings', () => {
  const storage = createMemoryStorage()

  const saved = saveAppSettings(
    {
      globalSettings: {
        activeProfileId: 'general'
      },
      profiles: [{
        id: ' general ',
        name: ' General ',
        patterns: {
          dates: { enabled: true, replacement: ' DATE ' },
          emails: { enabled: false, replacement: ' EMAIL ' },
          phones: { enabled: false, replacement: '' }
        },
        ner: { enabled: true, modelPath: ' /tmp/model.onnx ', tokenizerPath: ' /tmp/tokenizer.json ', minConfidence: '0.82' }
      }],
      currentCaseContext: {
        clientReplacement: '  CLIENT  ',
        clientVariants: ' Jane Doe\n\n Jane D. ',
        exactEntities: [{ entityType: '  provider ', replacement: ' PROVIDER ', variants: 'Dr. Smith\n Smith ' }]
      }
    },
    storage
  )

  assert.deepEqual(saved, {
    globalSettings: {
      activeProfileId: 'general'
    },
    profiles: [{
      id: 'general',
      name: 'General',
      patterns: {
        dates: { enabled: true, replacement: 'DATE' },
        emails: { enabled: false, replacement: 'EMAIL' },
        phones: { enabled: false, replacement: '[PHONE]' }
      },
      ner: { enabled: true, modelPath: '/tmp/model.onnx', tokenizerPath: '/tmp/tokenizer.json', minConfidence: '0.82' }
    }],
    currentCaseContext: {
      clientReplacement: 'CLIENT',
      clientVariants: 'Jane Doe\nJane D.',
      exactEntities: [{ entityType: 'provider', replacement: 'PROVIDER', variants: 'Dr. Smith\nSmith' }]
    }
  })
  assert.deepEqual(loadAppSettings(storage), saved)
})

test('normalizeAppSettings falls back for malformed values', () => {
  assert.deepEqual(normalizeAppSettings({ ner: { minConfidence: null }, exactEntities: [42] }), DEFAULT_APP_SETTINGS)
})

test('normalizeAppSettings migrates legacy mixed settings into General profile and current case context', () => {
  const normalized = normalizeAppSettings({
    clientReplacement: 'CLIENT',
    clientVariants: 'Jane Doe',
    exactEntities: [{ entityType: 'provider', replacement: '[PROVIDER]', variants: 'Dr. Smith' }],
    patterns: {
      dates: { enabled: true, replacement: '[DATE]' },
      emails: { enabled: false, replacement: '[EMAIL]' },
      phones: { enabled: false, replacement: '[PHONE]' }
    },
    ner: { enabled: true, modelPath: '/tmp/model.onnx', tokenizerPath: '/tmp/tokenizer.json', minConfidence: '0.75' }
  })

  assert.equal(normalized.globalSettings.activeProfileId, DEFAULT_PROFILE_ID)
  assert.deepEqual(normalized.profiles, [{
    id: 'general',
    name: 'General',
    patterns: {
      dates: { enabled: true, replacement: '[DATE]' },
      emails: { enabled: false, replacement: '[EMAIL]' },
      phones: { enabled: false, replacement: '[PHONE]' }
    },
    ner: { enabled: true, modelPath: '/tmp/model.onnx', tokenizerPath: '/tmp/tokenizer.json', minConfidence: '0.75' }
  }])
  assert.deepEqual(normalized.currentCaseContext, {
    clientReplacement: 'CLIENT',
    clientVariants: 'Jane Doe',
    exactEntities: [{ entityType: 'provider', replacement: '[PROVIDER]', variants: 'Dr. Smith' }]
  })
})

test('updateActiveProfileAndCaseContext updates only the split active settings surfaces', () => {
  const updated = updateActiveProfileAndCaseContext(DEFAULT_APP_SETTINGS, {
    profile: {
      patterns: {
        ...DEFAULT_APP_SETTINGS.profiles[0].patterns,
        dates: { enabled: true, replacement: '[DATE]' }
      }
    },
    caseContext: {
      clientReplacement: 'CLIENT',
      clientVariants: 'Jane Doe'
    }
  })

  assert.deepEqual(getActiveProfile(updated).patterns.dates, { enabled: true, replacement: '[DATE]' })
  assert.deepEqual(getCurrentCaseContext(updated), {
    clientReplacement: 'CLIENT',
    clientVariants: 'Jane Doe',
    exactEntities: []
  })
})
