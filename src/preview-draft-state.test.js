import test from 'node:test'
import assert from 'node:assert/strict'
import { signal } from '@preact/signals-core'

import { buildDraftPreview, createPreviewDraftState } from './preview-draft-state.js'

test('draft preview renders a queued manual redaction from draft state', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta gamma',
    originalHtml: 'alpha beta gamma',
    redactedHtml: 'alpha beta gamma'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'add-manual-redaction',
      previewPath: '/tmp/a.md',
      sourcePreview: 'original',
      selectionStart: 6,
      selectionEnd: 10,
      redactionScope: 'single_occurrence'
    }
  }])

  assert.match(draft.beforeHtml, /alpha <mark[^>]*>beta<\/mark> gamma/)
  assert.match(draft.afterHtml, /alpha <mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark> gamma/)
  assert.equal(draft.highlightCount, 2)
})

test('draft preview can map redacted selections back into original text for queued manual redactions', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta gamma',
    originalHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">beta</mark> gamma',
    redactedHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark> gamma'
  }
  const selectionStart = byteLength('alpha [MANUAL_REDACTION_1] ')
  const selectionEnd = selectionStart + byteLength('gamma')

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'add-manual-redaction',
      previewPath: '/tmp/a.md',
      sourcePreview: 'redacted',
      selectionStart,
      selectionEnd,
      redactionScope: 'single_occurrence'
    }
  }])

  assert.match(draft.afterHtml, /\[MANUAL_REDACTION_1\].*\[MANUAL_REDACTION_2\]/)
  assert.match(draft.beforeHtml, /<mark[^>]*>beta<\/mark> <mark[^>]*>gamma<\/mark>/)
})

test('draft preview removes committed redactions from draft state and renumbers manual labels', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta gamma',
    originalHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">beta</mark> <mark title="Manual redaction 2" data-record-start="11" data-record-end="16" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="2" data-record-label="Manual redaction 2">gamma</mark>',
    redactedHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark> <mark title="Manual redaction 2" data-record-start="11" data-record-end="16" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="2" data-record-label="Manual redaction 2">[MANUAL_REDACTION_2]</mark>'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'remove-redaction',
      previewPath: '/tmp/a.md',
      start: 6,
      end: 10,
      replacement: '[MANUAL_REDACTION]'
    }
  }])

  assert.doesNotMatch(draft.afterHtml, /MANUAL_REDACTION_2/)
  assert.match(draft.afterHtml, /alpha beta <mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark>/)
})

test('draft preview can propagate queued file exact-match manual redactions locally', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'Beta beta alphabet beta',
    originalHtml: 'Beta beta alphabet beta',
    redactedHtml: 'Beta beta alphabet beta'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'add-manual-redaction',
      previewPath: '/tmp/a.md',
      sourcePreview: 'original',
      selectionStart: 0,
      selectionEnd: 4,
      redactionScope: 'file_exact_matches'
    }
  }])

  const matches = draft.afterHtml.match(/MANUAL_REDACTION_/g) ?? []
  assert.equal(matches.length, 3)
  assert.match(draft.afterHtml, /alphabet/)
})

test('draft preview applies pending term edits before queued operations', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta betamax beta',
    originalHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">beta</mark> betamax <mark title="Manual redaction 2" data-record-start="19" data-record-end="23" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="2" data-record-label="Manual redaction 2">beta</mark>',
    redactedHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark> betamax <mark title="Manual redaction 2" data-record-start="19" data-record-end="23" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="2" data-record-label="Manual redaction 2">[MANUAL_REDACTION_2]</mark>'
  }

  const draft = buildDraftPreview(
    preview,
    [{ draftEffect: { kind: 'find-and-redact-term', term: 'alpha' } }],
    [{ previousTerm: 'beta', nextTerm: 'alpha' }]
  )

  const matches = draft.afterHtml.match(/MANUAL_REDACTION_/g) ?? []
  assert.equal(matches.length, 3)
  assert.doesNotMatch(draft.afterHtml, /betamax<mark/)
})

test('draft preview deletes queued redaction terms across the preview', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta gamma',
    originalHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">beta</mark> gamma',
    redactedHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark> gamma'
  }

  const draft = buildDraftPreview(preview, [{ draftEffect: { kind: 'delete-redaction-term', term: 'beta' } }])

  assert.equal(draft.afterHtml, 'alpha beta gamma')
})

test('draft preview applies and removes cross-file redaction effects by matched text', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'alpha beta alpha',
    originalHtml: 'alpha beta alpha',
    redactedHtml: 'alpha beta alpha'
  }

  const applied = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'apply-redaction-everywhere',
      matchedText: 'alpha',
      replacement: '[NAME]'
    }
  }])
  assert.match(applied.afterHtml, /<mark[^>]*>\[NAME\]<\/mark> beta <mark[^>]*>\[NAME\]<\/mark>/)

  const removed = buildDraftPreview(preview, [
    { draftEffect: { kind: 'apply-redaction-everywhere', matchedText: 'alpha', replacement: '[NAME]' } },
    { draftEffect: { kind: 'remove-redaction-everywhere', matchedText: 'alpha', replacement: '[NAME]' } }
  ])
  assert.equal(removed.afterHtml, 'alpha beta alpha')
})

test('save button enablement is derived from draft-state signals', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{ path: '/tmp/a.md', originalText: 'alpha', redactedHtml: 'alpha' }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  assert.equal(state.saveButtonEnabled.value, false)

  state.queuePendingOperation({ queuedMessage: 'queued', draftEffect: null })
  assert.equal(state.saveButtonEnabled.value, true)

  state.setSaveInFlight(true)
  assert.equal(state.saveButtonEnabled.value, false)
})

test('selected draft status exposes draft replacement count and pending flag', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'alpha beta gamma',
      originalHtml: 'alpha beta gamma',
      redactedHtml: 'alpha beta gamma'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  state.queuePendingOperation({
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'beta'
    }
  })

  assert.deepEqual(state.selectedDraftStatus.value, {
    replacements: 1,
    hasDraftChanges: true
  })
})

test('selected draft terms are derived from pending preview operations', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'alpha beta gamma',
      originalHtml: 'alpha beta gamma',
      redactedHtml: 'alpha beta gamma'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  state.queuePendingOperation({
    draftEffect: {
      kind: 'add-manual-redaction',
      previewPath: '/tmp/a.md',
      sourcePreview: 'original',
      selectionStart: byteLength('alpha '),
      selectionEnd: byteLength('alpha beta'),
      redactionScope: 'single_occurrence'
    }
  })

  assert.deepEqual(state.selectedDraftTerms.value.map((term) => ({
    matchedText: term.matchedText,
    occurrences: term.occurrences
  })), [{ matchedText: 'beta', occurrences: 1 }])
})

test('draft status by path stays committed when a preview has no pending changes', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [
      {
        path: '/tmp/a.md',
        originalText: 'alpha beta',
        originalHtml: 'alpha beta',
        redactedHtml: 'alpha beta'
      },
      {
        path: '/tmp/b.md',
        originalText: 'gamma delta',
        originalHtml: 'gamma delta',
        redactedHtml: 'gamma delta'
      }
    ],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  state.queuePendingOperation({
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'beta'
    }
  })

  assert.deepEqual(state.draftStatusByPath('/tmp/a.md'), {
    replacements: 1,
    hasDraftChanges: true
  })
  assert.deepEqual(state.draftStatusByPath('/tmp/b.md'), {
    replacements: 0,
    hasDraftChanges: false
  })
})

function byteLength(value) {
  return new TextEncoder().encode(value).length
}
