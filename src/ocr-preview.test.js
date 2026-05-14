import test from 'node:test'
import assert from 'node:assert/strict'

import { imageOcrSourcePath } from './ocr-preview.js'

test('imageOcrSourcePath returns image inputs for OCR-derived previews', () => {
  assert.equal(
    imageOcrSourcePath({
      inputPath: '/tmp/Transcript.PNG',
      review: { extractionProvenance: 'ocr_text' }
    }),
    '/tmp/Transcript.PNG'
  )
})

test('imageOcrSourcePath preserves original image after corrected OCR source is substituted', () => {
  assert.equal(
    imageOcrSourcePath({
      inputPath: '/tmp/redacted/.ocr-reviewed/Transcript.md',
      ocrSourceImagePath: '/tmp/Transcript.PNG',
      review: { extractionProvenance: 'ocr_text' }
    }),
    '/tmp/Transcript.PNG'
  )
})

test('imageOcrSourcePath excludes non-image and non-OCR previews', () => {
  assert.equal(
    imageOcrSourcePath({
      inputPath: '/tmp/scan.pdf',
      review: { extractionProvenance: 'ocr_text' }
    }),
    null
  )
  assert.equal(
    imageOcrSourcePath({
      inputPath: '/tmp/scan.png',
      review: { extractionProvenance: 'docx_text' }
    }),
    null
  )
})
