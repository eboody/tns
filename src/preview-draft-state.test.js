import test from 'node:test'
import assert from 'node:assert/strict'
import { signal } from '@preact/signals-core'

import { buildDraftPreview, createPreviewDraftState } from './preview-draft-state.js'
import { createRedactionSidebarState } from './redaction-sidebar-state.js'

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
  assert.equal(matches.length, 1)
  assert.doesNotMatch(draft.afterHtml, /betamax<mark/)
  assert.doesNotMatch(draft.afterHtml, /beta<mark/)
})

test('draft preview term edits use delete-and-refind semantics', () => {
  const preview = {
    path: '/tmp/a.md',
    originalText: 'Historical Results\nSchool MEADOWS ELEMENTARY SCHOOL\nStudent Surina Shah\n',
    originalHtml: 'Historical Results\nSchool MEADOWS ELEMENTARY SCHOOL\nStudent <mark title="Manual redaction 1" data-record-start="60" data-record-end="71" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">Surina Shah</mark>\n',
    redactedHtml: 'Historical Results\nSchool MEADOWS ELEMENTARY SCHOOL\nStudent <mark title="Manual redaction 1" data-record-start="60" data-record-end="71" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark>\n'
  }

  const draft = buildDraftPreview(preview, [], [{ previousTerm: 'Surina Shah', nextTerm: 'Surina' }])

  assert.equal(
    draft.afterHtml,
    'Historical Results\nSchool MEADOWS ELEMENTARY SCHOOL\nStudent <mark title="Manual redaction 1" data-record-start="60" data-record-end="66" data-record-replacement="[MANUAL_REDACTION]" data-record-label="Manual redaction 1" data-record-committed="false" data-record-matched-text="Surina" data-manual-number="1">[MANUAL_REDACTION_1]</mark> Shah\n'
  )
})

test('draft preview follows current-term textbox edits through sidebar signals', () => {
  const redactionSidebar = createRedactionSidebarState()
  const state = createPreviewDraftState({ redactionSidebar })
  const preview = {
    path: '/tmp/a.md',
    inputPath: '/tmp/a.md',
    originalText: 'John Doe met Jane.',
    originalHtml: 'J<mark data-record-start="1" data-record-end="8" data-record-replacement="[MANUAL_REDACTION]">ohn Doe</mark> met Jane.',
    redactedHtml: 'J<mark data-record-start="1" data-record-end="8" data-record-replacement="[MANUAL_REDACTION]">[MANUAL_REDACTION_1]</mark> met Jane.',
    redactionTerms: [{
      matchedText: 'ohn Doe',
      replacement: '[MANUAL_REDACTION]',
      entityType: 'MANUAL_REDACTION',
      occurrences: 1
    }]
  }

  state.syncWorkspace({
    filePreviews: [preview],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })
  redactionSidebar.syncFromDraftState({
    filePreviews: [preview],
    terms: state.selectedBaseDraftTerms.value
  })

  const termId = redactionSidebar.sourceTerms.value[0].id
  redactionSidebar.setDraft(termId, 'John Doe')

  assert.match(state.draftBeforeHtml.value, /^<mark[^>]*>John Doe<\/mark> met Jane\.$/)
  assert.match(state.draftAfterHtml.value, /^<mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark> met Jane\.$/)
  assert.equal(state.saveButtonEnabled.value, true)
})

test('current-term textbox edits preserve the existing replacement kind', () => {
  const draft = buildDraftPreview({
    originalText: 'John Doe met Jane. John Doe stayed.',
    redactedHtml: 'John <mark data-record-start="5" data-record-end="8" data-record-replacement="[NAME]" data-record-label="Name">[NAME]</mark> met Jane.'
      + ' John Doe stayed.'
  }, [], [{ previousTerm: 'Doe', nextTerm: 'John Doe' }])

  assert.match(draft.beforeHtml, /^<mark[^>]*data-record-replacement="\[NAME\]"[^>]*>John Doe<\/mark> met Jane\./)
  assert.match(draft.beforeHtml, /<mark[^>]*data-record-replacement="\[NAME\]"[^>]*>John Doe<\/mark> stayed\.$/)
  assert.match(draft.afterHtml, /^<mark[^>]*data-record-replacement="\[NAME\]"[^>]*>\[NAME\]<\/mark> met Jane\./)
  assert.match(draft.afterHtml, /<mark[^>]*data-record-replacement="\[NAME\]"[^>]*>\[NAME\]<\/mark> stayed\.$/)
  assert.doesNotMatch(draft.afterHtml, /MANUAL_REDACTION/)
})

test('large current-term edits defer full live preview rebuild', () => {
  const originalText = `${'clinical note '.repeat(30_000)}: Jane Doe`
  const redactedHtml = originalText.replace(
    'Jane Doe',
    '<mark data-record-start="420002" data-record-end="420010" data-record-replacement="[NAME]" data-record-label="Name">[NAME]</mark>'
  )

  const draft = buildDraftPreview({
    originalText,
    originalHtml: redactedHtml.replace('[NAME]</mark>', 'Jane Doe</mark>'),
    redactedHtml
  }, [], [{ previousTerm: 'Jane Doe', nextTerm: ': Jane Doe' }])

  assert.equal(draft.livePreviewDeferred, true)
  assert.equal(draft.hasDraftChanges, true)
  assert.match(draft.beforeHtml, /<mark[^>]*>: Jane Doe<\/mark>/)
  assert.match(draft.afterHtml, /<mark[^>]*>\[NAME\]<\/mark>/)
  assert.ok(draft.afterHtml.length < 1_500)
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

  state.queuePendingOperation({ queuedMessage: 'queued', draftEffect: { kind: 'find-and-redact-term', term: 'alpha' } })
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

test('selected draft status ignores harmless committed markup normalization', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'alpha beta gamma',
      originalHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">beta</mark> gamma',
      redactedHtml: 'alpha <mark title="Manual redaction 1" data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]" data-manual-number="1" data-record-label="Manual redaction 1">[MANUAL_REDACTION_1]</mark> gamma'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  assert.deepEqual(state.selectedDraftStatus.value, {
    replacements: 1,
    hasDraftChanges: false
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

test('pending operations can be upserted for reactive textbox matching', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'John J. Doe met John Doe.',
      originalHtml: 'John J. Doe met John Doe.',
      redactedHtml: 'John J. Doe met John Doe.'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  state.upsertPendingOperation('live-find', {
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'John J. Doe'
    }
  })

  assert.deepEqual(state.selectedDraftTerms.value.map((term) => ({
    matchedText: term.matchedText,
    occurrences: term.occurrences
  })), [{ matchedText: 'John J. Doe', occurrences: 1 }])
  assert.match(state.draftAfterHtml.value, /<mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark> met John Doe\./)
  assert.equal(state.saveButtonEnabled.value, true)

  state.upsertPendingOperation('live-find', {
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'John Doe'
    }
  })

  assert.deepEqual(state.selectedDraftTerms.value.map((term) => ({
    matchedText: term.matchedText,
    occurrences: term.occurrences
  })), [{ matchedText: 'John Doe', occurrences: 1 }])
  assert.match(state.draftAfterHtml.value, /John J\. Doe met <mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark>\./)

  state.upsertPendingOperation('live-find', null)

  assert.deepEqual(state.selectedDraftTerms.value, [])
  assert.equal(state.draftAfterHtml.value, 'John J. Doe met John Doe.')
  assert.equal(state.saveButtonEnabled.value, false)
})

test('find redaction terms respect whole-term boundaries', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'Johnathan and Johnson met Johnny.',
      originalHtml: 'Johnathan and Johnson met Johnny.',
      redactedHtml: 'Johnathan and Johnson met Johnny.'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })

  state.upsertPendingOperation('live-find', {
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'John'
    }
  })

  assert.equal(state.draftAfterHtml.value, 'Johnathan and Johnson met Johnny.')
  assert.deepEqual(state.selectedDraftTerms.value, [])
})

test('draft merge can absorb text adjacent to an existing redaction', () => {
  const preview = {
    originalText: 'alpha beta gamma',
    redactedHtml: 'alpha <mark data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]">[MANUAL_REDACTION_1]</mark> gamma'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'merge-manual-redaction',
      sourcePreview: 'original',
      selectionStart: byteLength('alpha beta'),
      selectionEnd: byteLength('alpha beta gamma')
    }
  }])

  assert.match(draft.beforeHtml, /<mark[^>]*>beta gamma<\/mark>/)
  assert.equal(draft.hasDraftChanges, true)
})

test('draft merge expands partial-word selections to whole words', () => {
  const preview = {
    originalText: 'alpha beta gamma',
    redactedHtml: 'alpha <mark data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]">[MANUAL_REDACTION_1]</mark> gamma'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'merge-manual-redaction',
      sourcePreview: 'original',
      selectionStart: byteLength('alpha beta'),
      selectionEnd: byteLength('alpha beta ga')
    }
  }])

  assert.match(draft.beforeHtml, /<mark[^>]*>beta gamma<\/mark>/)
  assert.equal(draft.hasDraftChanges, true)
})

test('removing a draft merged redaction restores the redaction it subsumed', () => {
  const preview = {
    originalText: 'alpha beta gamma',
    redactedHtml: 'alpha <mark data-record-start="6" data-record-end="10" data-record-replacement="[MANUAL_REDACTION]">[MANUAL_REDACTION_1]</mark> gamma'
  }

  const draft = buildDraftPreview(preview, [
    {
      operationId: 'merge-beta-gamma',
      draftEffect: {
        kind: 'merge-manual-redaction',
        sourcePreview: 'original',
        selectionStart: byteLength('alpha beta'),
        selectionEnd: byteLength('alpha beta gamma')
      }
    },
    {
      draftEffect: {
        kind: 'remove-redaction',
        start: byteLength('alpha '),
        end: byteLength('alpha beta gamma'),
        replacement: '[MANUAL_REDACTION]'
      }
    }
  ])

  assert.match(draft.beforeHtml, /^alpha <mark[^>]*>beta<\/mark> gamma$/)
  assert.match(draft.afterHtml, /^alpha <mark[^>]*>\[MANUAL_REDACTION_1\]<\/mark> gamma$/)
})

test('removing an expanded current-term redaction restores its original inner redaction', () => {
  const expandedText = 'Jane Doe demonstrated anxious-like behaviors related to her performance and a desire to do well'
  const preview = {
    originalText: `${expandedText}.`,
    redactedHtml: '<mark data-record-start="0" data-record-end="8" data-record-replacement="[NAME]" data-record-label="Name">[NAME]</mark>'
      + ' demonstrated anxious-like behaviors related to her performance and a desire to do well.'
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'remove-redaction',
      start: 0,
      end: byteLength(expandedText),
      replacement: '[NAME]'
    }
  }], [{ previousTerm: 'Jane Doe', nextTerm: expandedText }])

  assert.match(draft.beforeHtml, /^<mark[^>]*>Jane Doe<\/mark> demonstrated anxious-like behaviors/)
  assert.match(draft.afterHtml, /^<mark[^>]*>\[NAME\]<\/mark> demonstrated anxious-like behaviors/)
})

test('removing a large redaction reapplies other visible redaction terms inside its text', () => {
  const largeText = 'Jane Doe demonstrated anxious-like behaviors related to her performance and a desire to do well'
  const fullText = `${largeText}. Later Jane Doe returned.`
  const laterStart = byteLength(`${largeText}. Later `)
  const laterEnd = laterStart + byteLength('Jane Doe')
  const preview = {
    originalText: fullText,
    redactedHtml: `<mark data-record-start="0" data-record-end="${byteLength(largeText)}" data-record-replacement="[NAME]" data-record-label="Name">[NAME]</mark>`
      + `. Later <mark data-record-start="${laterStart}" data-record-end="${laterEnd}" data-record-replacement="[NAME]" data-record-label="Name">[NAME]</mark> returned.`
  }

  const draft = buildDraftPreview(preview, [{
    draftEffect: {
      kind: 'remove-redaction',
      start: 0,
      end: byteLength(largeText),
      replacement: '[NAME]'
    }
  }])

  assert.match(draft.beforeHtml, /^<mark[^>]*>Jane Doe<\/mark> demonstrated anxious-like behaviors/)
  assert.match(draft.afterHtml, /^<mark[^>]*>\[NAME\]<\/mark> demonstrated anxious-like behaviors/)
  assert.equal((draft.afterHtml.match(/<mark[^>]*>\[NAME\]<\/mark>/g) ?? []).length, 2)
})

test('pending operations are cleared when the workspace draft scope changes', () => {
  const redactionSidebar = { hasPendingEdits: signal(false), pendingEdits: signal([]) }
  const state = createPreviewDraftState({ redactionSidebar })

  state.syncWorkspace({
    inputPath: '/tmp/first.txt',
    filePreviews: [{
      path: '/tmp/a.md',
      originalText: 'alpha beta',
      originalHtml: 'alpha beta',
      redactedHtml: 'alpha beta'
    }],
    selectedPreviewPath: '/tmp/a.md',
    processingInFlight: false
  })
  state.upsertPendingOperation('live-find', {
    draftEffect: {
      kind: 'find-and-redact-term',
      term: 'beta'
    }
  })
  assert.equal(state.saveButtonEnabled.value, true)

  state.syncWorkspace({
    inputPath: '/tmp/second.txt',
    filePreviews: [{
      path: '/tmp/b.md',
      originalText: 'beta gamma',
      originalHtml: 'beta gamma',
      redactedHtml: 'beta gamma'
    }],
    selectedPreviewPath: '/tmp/b.md',
    processingInFlight: false
  })

  assert.equal(state.pendingOperations.value.length, 0)
  assert.equal(state.draftAfterHtml.value, 'beta gamma')
  assert.equal(state.saveButtonEnabled.value, false)
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
