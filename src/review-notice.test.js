import test from 'node:test'
import assert from 'node:assert/strict'

import { buildReviewNotice } from './review-notice.js'

test('buildReviewNotice keeps explanatory review reasons and drops status repetition', () => {
  const notice = buildReviewNotice({
    extractionProvenance: 'docx_text',
    requiresManualReview: true,
    reasons: ['non_text_omissions_detected', 'structural_loss_suspected']
  })

  assert.equal(
    notice,
    'Non-text content omissions were detected during extraction, so embedded visual content may still require manual review. Structural extraction loss is suspected for this file, so table or form layout meaning may be flattened.'
  )
})

test('buildReviewNotice returns null when a note only repeats non-explanatory metadata', () => {
  assert.equal(
    buildReviewNotice({
      extractionProvenance: 'docx_text',
      requiresManualReview: true,
      reasons: []
    }),
    null
  )
})
