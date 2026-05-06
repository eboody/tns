import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReviewNotice } from './review-notice.js'

test('buildReviewNotice keeps explanatory review reasons and drops status repetition', () => {
  const notice = buildReviewNotice(
    'Extraction provenance: docx_text. Non-text content omissions were detected during extraction, so embedded visual content may still require manual review. Structural extraction loss is suspected for this file, so table or form layout meaning may be flattened. This file requires low-confidence extraction review before relying on the extracted text alone.'
  )

  assert.equal(
    notice,
    'Non-text content omissions were detected during extraction, so embedded visual content may still require manual review. Structural extraction loss is suspected for this file, so table or form layout meaning may be flattened.'
  )
})

test('buildReviewNotice returns null when a note only repeats non-explanatory metadata', () => {
  assert.equal(buildReviewNotice('Extraction provenance: docx_text.'), null)
})
