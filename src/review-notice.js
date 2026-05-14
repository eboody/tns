const REASON_LABELS = {
  original_preview_unavailable:
    'Original preview is not available for this file type in the current desktop slice.',
  non_text_omissions_detected:
    'Non-text content omissions were detected during extraction, so embedded visual content may still require manual review.',
  text_degraded_detected:
    'Extracted text fidelity is degraded for this file, so review spacing and label boundaries carefully.',
  structural_loss_suspected:
    'Structural extraction loss is suspected for this file, so table or form layout meaning may be flattened.'
}

const OCR_REVIEW_NOTICE =
  'OCR was used for this file, so spelling, casing, and layout may be wrong; compare the extracted text against the original image before relying on it.'

export function buildReviewNotice(review) {
  if (!review || !Array.isArray(review.reasons)) {
    return null
  }

  const explanatorySentences = review.reasons.map((reason) => REASON_LABELS[reason]).filter(Boolean)
  if (review.extractionProvenance === 'ocr_text') {
    explanatorySentences.push(OCR_REVIEW_NOTICE)
  }

  if (explanatorySentences.length === 0) {
    return null
  }

  return explanatorySentences.join(' ')
}
