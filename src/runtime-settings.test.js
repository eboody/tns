import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRuntimeSettingsPayload } from './runtime-settings.js'

test('buildRuntimeSettingsPayload separates reusable profile policy from case context', () => {
  const payload = buildRuntimeSettingsPayload({
    profile: {
      patterns: {
        dates: { enabled: true, replacement: '[DATE]' },
        emails: { enabled: false, replacement: '[EMAIL]' },
        phones: { enabled: true, replacement: '[PHONE]' }
      },
      ner: {
        enabled: true,
        modelPath: '/tmp/model.onnx',
        tokenizerPath: '/tmp/tokenizer.json',
        minConfidence: '0.82'
      }
    },
    caseContext: {
      clientReplacement: 'CLIENT',
      clientVariants: 'Jane Doe\n Jane D. ',
      exactEntities: [
        { entityType: 'provider', replacement: '[PROVIDER]', variants: 'Dr. Smith\n Smith' },
        { entityType: '', replacement: '', variants: '' }
      ]
    }
  })

  assert.deepEqual(payload, {
    profile: {
      patterns: {
        dates: { enabled: true, replacement: '[DATE]' },
        emails: { enabled: false, replacement: '[EMAIL]' },
        phones: { enabled: true, replacement: '[PHONE]' }
      },
      ner: {
        enabled: true,
        modelPath: '/tmp/model.onnx',
        tokenizerPath: '/tmp/tokenizer.json',
        minConfidence: 0.82
      }
    },
    caseContext: {
      clientReplacement: 'CLIENT',
      clientVariants: ['Jane Doe', 'Jane D.'],
      exactEntities: [
        {
          entityType: 'provider',
          replacement: '[PROVIDER]',
          variants: ['Dr. Smith', 'Smith']
        }
      ]
    }
  })
})
