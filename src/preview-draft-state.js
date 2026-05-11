import { batch, computed, signal } from '@preact/signals-core'

const MANUAL_REDACTION_REPLACEMENT = '[MANUAL_REDACTION]'
const MARK_TAG_PATTERN = /<mark\b([^>]*)>([\s\S]*?)<\/mark>/g
const ATTRIBUTE_PATTERN = /([\w:-]+)="([^"]*)"/g

export function createPreviewDraftState({ redactionSidebar }) {
  let nextPendingOperationId = 1
  let syncedWorkspaceKey = null
  const committedPreviews = signal([])
  const selectedPreviewPath = signal(null)
  const processingInFlight = signal(false)
  const saveInFlight = signal(false)
  const pendingOperations = signal([])
  const draftPreviewByPath = computed(() => buildDraftPreviewMap(
    committedPreviews.value,
    pendingOperations.value,
    redactionSidebar.pendingEdits.value
  ))
  const baseDraftTermsByPath = computed(() => buildDraftTermsByPath(
    committedPreviews.value,
    pendingOperations.value,
    []
  ))
  const draftTermsByPath = computed(() => buildDraftTermsByPath(
    committedPreviews.value,
    pendingOperations.value,
    redactionSidebar.pendingEdits.value
  ))

  const selectedPreview = computed(() => committedPreviews.value.find((preview) => (preview.path ?? '') === selectedPreviewPath.value) ?? null)
  const draftPreview = computed(() => draftPreviewByPath.value.get(selectedPreviewPath.value ?? '') ?? buildDraftPreview(null))
  const selectedBaseDraftTerms = computed(() => baseDraftTermsByPath.value.get(selectedPreviewPath.value ?? '') ?? [])
  const selectedDraftTerms = computed(() => draftTermsByPath.value.get(selectedPreviewPath.value ?? '') ?? [])
  const selectedDraftStatus = computed(() => {
    const preview = selectedPreview.value
    if (!preview) {
      return null
    }

    return buildDraftStatus(preview, draftPreviewByPath.value.get(preview.path ?? ''))
  })
  const hasPendingChanges = computed(() => {
    redactionSidebar.hasPendingEdits.value
    pendingOperations.value
    return Array.from(draftPreviewByPath.value.values()).some((preview) => preview.hasDraftChanges)
  })
  const saveButtonEnabled = computed(() => {
    if (saveInFlight.value || processingInFlight.value) {
      return false
    }

    return committedPreviews.value.length > 0 && hasPendingChanges.value
  })

  return {
    selectedPreview,
    pendingOperations,
    draftPreview,
    draftPreviewByPath,
    baseDraftTermsByPath,
    selectedBaseDraftTerms,
    draftTermsByPath,
    selectedDraftTerms,
    draftBeforeHtml: computed(() => draftPreview.value.beforeHtml),
    draftAfterHtml: computed(() => draftPreview.value.afterHtml),
    draftHighlightCount: computed(() => draftPreview.value.highlightCount),
    selectedDraftStatus,
    hasPendingChanges,
    saveButtonEnabled,
    draftStatusByPath(path) {
      const preview = committedPreviews.peek().find((candidate) => (candidate.path ?? '') === path)
      if (!preview) {
        return null
      }

      return buildDraftStatus(preview, draftPreviewByPath.peek().get(path ?? ''))
    },
    syncWorkspace(workspace) {
      const nextWorkspaceKey = workspaceDraftScopeKey(workspace)
      batch(() => {
        if (syncedWorkspaceKey !== null && syncedWorkspaceKey !== nextWorkspaceKey) {
          pendingOperations.value = []
        }
        syncedWorkspaceKey = nextWorkspaceKey
        committedPreviews.value = Array.isArray(workspace?.filePreviews) ? workspace.filePreviews : []
        selectedPreviewPath.value = workspace?.selectedPreviewPath ?? null
        processingInFlight.value = Boolean(workspace?.processingInFlight)
      })
    },
    queuePendingOperation(operation) {
      pendingOperations.value = [...pendingOperations.peek(), {
        ...operation,
        operationId: operation.operationId ?? `pending-op-${nextPendingOperationId++}`
      }]
    },
    takePendingOperations() {
      const queued = pendingOperations.peek()
      pendingOperations.value = []
      return queued
    },
    restorePendingOperations(operations) {
      if (!Array.isArray(operations) || operations.length === 0) {
        return
      }

      pendingOperations.value = [...operations, ...pendingOperations.peek()]
    },
    upsertPendingOperation(operationId, operation) {
      if (!operationId) {
        return
      }

      const existingOperations = pendingOperations.peek()
        .filter((candidate) => candidate.operationId !== operationId)

      if (!operation) {
        pendingOperations.value = existingOperations
        return
      }

      pendingOperations.value = [...existingOperations, {
        ...operation,
        operationId
      }]
    },
    removePendingOperation(operationId) {
      pendingOperations.value = pendingOperations.peek().filter((operation) => operation.operationId !== operationId)
    },
    excludePendingRecord(operationId, identity) {
      pendingOperations.value = pendingOperations.peek().map((operation) => {
        if (operation.operationId !== operationId) {
          return operation
        }

        const draftEffect = operation.draftEffect ?? {}
        return {
          ...operation,
          draftEffect: {
            ...draftEffect,
            excludedRecords: [
              ...(Array.isArray(draftEffect.excludedRecords) ? draftEffect.excludedRecords : []),
              identity
            ]
          }
        }
      })
    },
    setSaveInFlight(value) {
      saveInFlight.value = Boolean(value)
    }
  }
}

function workspaceDraftScopeKey(workspace) {
  const inputPath = typeof workspace?.inputPath === 'string' ? workspace.inputPath : ''
  const previewPaths = (Array.isArray(workspace?.filePreviews) ? workspace.filePreviews : [])
    .map((preview) => preview?.path ?? '')
    .join('\u0000')

  return `${inputPath}\u0001${previewPaths}`
}

export function buildDraftPreview(preview, pendingOperations, pendingTermEdits = []) {
  if (!preview) {
    return {
      beforeHtml: 'Original content preview will appear here.',
      afterHtml: 'Redacted output preview will appear here.',
      highlightCount: 0,
      hasDraftChanges: false
    }
  }

  const originalText = typeof preview.originalText === 'string' ? preview.originalText : null
  if (!originalText) {
    const beforeHtml = preview.originalHtml ?? 'Original preview unavailable.'
    const afterHtml = preview.redactedHtml ?? ''
    return {
      beforeHtml,
      afterHtml,
      highlightCount: countMarks(beforeHtml) + countMarks(afterHtml),
      hasDraftChanges: false
    }
  }

  const committedRecords = parseCommittedRedactionRecords(preview, originalText)
  const draftRecords = applyDraftOperations({
    preview,
    originalText,
    committedRecords,
    pendingOperations,
    pendingTermEdits
  })

  const beforeHtml = renderOriginalPreviewHtml(originalText, draftRecords)
  const afterHtml = renderRedactedPreviewHtml(originalText, draftRecords)

  return {
    beforeHtml,
    afterHtml,
    highlightCount: countMarks(beforeHtml) + countMarks(afterHtml),
    hasDraftChanges: !sameRedactionRecords(committedRecords, draftRecords)
  }
}

function buildDraftPreviewMap(previews, pendingOperations, pendingTermEdits) {
  return new Map(
    (Array.isArray(previews) ? previews : []).map((preview) => [
      preview.path ?? '',
      buildDraftPreview(preview, pendingOperations, pendingTermEdits)
    ])
  )
}

function buildDraftTermsByPath(previews, pendingOperations, pendingTermEdits) {
  return new Map(
    (Array.isArray(previews) ? previews : []).map((preview) => {
      const originalText = typeof preview?.originalText === 'string' ? preview.originalText : null
      if (!originalText) {
        return [preview.path ?? '', []]
      }

      const committedRecords = parseCommittedRedactionRecords(preview, originalText)
      const draftRecords = applyDraftOperations({
        preview,
        originalText,
        committedRecords,
        pendingOperations,
        pendingTermEdits
      })

      return [preview.path ?? '', buildDraftTerms(draftRecords)]
    })
  )
}

function buildDraftTerms(records) {
  const entries = new Map()

  for (const record of Array.isArray(records) ? records : []) {
    const matchedText = normalizeTerm(record.matchedText)
    if (!matchedText) {
      continue
    }

    const replacement = normalizeTerm(record.replacement)
    const key = `${matchedText.toLowerCase()}::${replacement}::MANUAL_REDACTION`
    const identityKey = recordIdentityKey(record)
    const existing = entries.get(key)
    if (existing) {
      existing.occurrences += 1
      existing.identityKeys.add(identityKey)
      continue
    }

    entries.set(key, {
      key,
      identityKey,
      matchedText,
      replacement,
      entityType: 'MANUAL_REDACTION',
      occurrences: 1,
      identityKeys: new Set([identityKey])
    })
  }

  return Array.from(entries.values())
    .map((term) => ({
      ...term,
      identityKey: Array.from(term.identityKeys).sort().join('|')
    }))
    .sort((left, right) =>
      right.occurrences - left.occurrences || left.matchedText.localeCompare(right.matchedText)
    )
}

function recordIdentityKey(record) {
  if (record.committed) {
    return `${record.committedStart}:${record.committedEnd}:${record.committedReplacement}`
  }

  return `${record.start}:${record.end}:${record.replacement}:${record.operationId ?? 'draft'}`
}

function buildDraftStatus(preview, draftPreview) {
  if (!preview || !draftPreview) {
    return null
  }

  const committedBeforeHtml = preview.originalHtml ?? 'Original preview unavailable.'
  const committedAfterHtml = preview.redactedHtml ?? ''

  return {
    replacements: countMarks(draftPreview.afterHtml),
    hasDraftChanges: typeof draftPreview.hasDraftChanges === 'boolean'
      ? draftPreview.hasDraftChanges
      : draftPreview.beforeHtml !== committedBeforeHtml || draftPreview.afterHtml !== committedAfterHtml
  }
}

function sameRedactionRecords(leftRecords, rightRecords) {
  const left = normalizeRecordOrder(leftRecords).map(canonicalRecordSignature)
  const right = normalizeRecordOrder(rightRecords).map(canonicalRecordSignature)
  if (left.length !== right.length) {
    return false
  }

  return left.every((signature, index) => signature === right[index])
}

function canonicalRecordSignature(record) {
  return [
    record.start,
    record.end,
    normalizeTerm(record.matchedText).toLowerCase(),
    normalizeTerm(record.replacement)
  ].join('::')
}

export function parseCommittedRedactionRecords(preview, originalText = preview?.originalText ?? '') {
  const records = []
  const redactedHtml = preview?.redactedHtml ?? ''

  for (const match of redactedHtml.matchAll(MARK_TAG_PATTERN)) {
    const attrs = parseAttributes(match[1] ?? '')
    const start = Number(attrs['data-record-start'])
    const end = Number(attrs['data-record-end'])
    const replacement = decodeHtml(attrs['data-record-replacement'] ?? '')
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !replacement) {
      continue
    }

    records.push({
      start,
      end,
      replacement,
      label: decodeHtml(attrs['data-record-label'] ?? attrs.title ?? replacement),
      displayText: decodeHtml(match[2] ?? ''),
      matchedText: sliceUtf8Bytes(originalText, start, end),
      committed: true,
      committedStart: start,
      committedEnd: end,
      committedReplacement: replacement
    })
  }

  return normalizeRecordOrder(records)
}

function applyDraftOperations({ preview, originalText, committedRecords, pendingOperations, pendingTermEdits }) {
  let records = committedRecords.map(cloneRecord)

  for (const edit of Array.isArray(pendingTermEdits) ? pendingTermEdits : []) {
    records = applyReplaceRedactionTermEffect(records, originalText, edit)
  }

  for (const operation of Array.isArray(pendingOperations) ? pendingOperations : []) {
    const effect = operation?.draftEffect
    if (!effect) {
      continue
    }

    if (effect.previewPath && effect.previewPath !== (preview.path ?? '')) {
      continue
    }

    if (effect.kind === 'find-and-redact-term') {
      records = applyFindAndRedactTermEffect(records, originalText, effect, operation.operationId)
      continue
    }

    if (effect.kind === 'delete-redaction-term') {
      records = applyDeleteRedactionTermEffect(records, effect)
      continue
    }

    if (effect.kind === 'remove-redaction') {
      records = records.filter((record) => !sameRecordIdentity(record, effect))
      continue
    }

    if (effect.kind === 'add-manual-redaction') {
      records = applyManualRedactionEffect(records, originalText, effect, operation.operationId)
      continue
    }

    if (effect.kind === 'merge-manual-redaction') {
      records = applyMergeManualRedactionEffect(records, originalText, effect, operation.operationId)
      continue
    }

    if (effect.kind === 'apply-redaction-everywhere') {
      records = applyApplyRedactionEverywhereEffect(records, originalText, effect, operation.operationId)
      continue
    }

    if (effect.kind === 'remove-redaction-everywhere') {
      records = applyRemoveRedactionEverywhereEffect(records, effect)
    }
  }

  return renumberManualRedactions(records)
}

function applyFindAndRedactTermEffect(records, originalText, effect, operationId) {
  const term = normalizeTerm(effect.term)
  if (!term) {
    return records
  }

  const remainingRecords = records.filter((record) => !sameMatchText(record.matchedText, term))
  const additions = buildExactMatchRedactions(originalText, [{
    matchedText: term,
    replacement: MANUAL_REDACTION_REPLACEMENT,
    label: 'Manual redaction',
    operationId,
    sourceKind: 'find-and-redact-term',
    sourceMode: 'exact_matches'
  }], remainingRecords, effect.excludedRecords)

  return normalizeRecordOrder([...remainingRecords, ...additions])
}

function applyDeleteRedactionTermEffect(records, effect) {
  const term = normalizeTerm(effect.term)
  if (!term) {
    return records
  }

  return records.filter((record) => !sameMatchText(record.matchedText, term))
}

function applyReplaceRedactionTermEffect(records, originalText, effect) {
  const previousTerm = normalizeTerm(effect.previousTerm)
  const nextTerm = normalizeTerm(effect.nextTerm)
  if (!previousTerm || !nextTerm) {
    return records
  }

  const remainingRecords = records.filter((record) => !sameMatchText(record.matchedText, previousTerm))
  const propagatedRecords = buildExactMatchRedactions(originalText, [{
    matchedText: nextTerm,
    replacement: MANUAL_REDACTION_REPLACEMENT,
    label: 'Manual redaction'
  }], remainingRecords)

  return normalizeRecordOrder([
    ...remainingRecords,
    ...propagatedRecords
  ])
}

function applyManualRedactionEffect(records, originalText, effect, operationId) {
  const mapped = mapSelectionToOriginalRange(originalText, records, effect.sourcePreview, effect.selectionStart, effect.selectionEnd)
  if (!mapped || overlapsExistingReplacement(records, mapped.start, mapped.end)) {
    return records
  }

  const matchedText = sliceUtf8Bytes(originalText, mapped.start, mapped.end)
  if (!matchedText.trim()) {
    return records
  }

  if (effect.redactionScope === 'file_exact_matches') {
    return normalizeRecordOrder([
      ...records,
      ...buildExactMatchRedactions(originalText, [{
        matchedText,
        replacement: MANUAL_REDACTION_REPLACEMENT,
        label: 'Manual redaction',
        operationId,
        sourceKind: 'add-manual-redaction',
        sourceMode: 'exact_matches'
      }], records, effect.excludedRecords)
    ])
  }

  return normalizeRecordOrder([...records, createRecord(mapped.start, mapped.end, MANUAL_REDACTION_REPLACEMENT, 'Manual redaction', matchedText, {
    operationId,
    sourceKind: 'add-manual-redaction',
    sourceMode: 'single_occurrence'
  })])
}

function applyMergeManualRedactionEffect(records, originalText, effect, operationId) {
  const mapped = mapSelectionToOriginalRangeForMerge(originalText, records, effect.sourcePreview, effect.selectionStart, effect.selectionEnd)
  if (!mapped) {
    return records
  }

  const overlap = mergedOverlapBounds(records, mapped.start, mapped.end)
  if (!overlap) {
    return records
  }

  const matchedText = sliceUtf8Bytes(originalText, overlap.start, overlap.end)
  if (!matchedText.trim()) {
    return records
  }

  return normalizeRecordOrder([
    ...records.filter((record) => !(overlap.start < record.end && overlap.end > record.start)),
    createRecord(overlap.start, overlap.end, MANUAL_REDACTION_REPLACEMENT, 'Manual redaction', matchedText, {
      operationId,
      sourceKind: 'merge-manual-redaction',
      sourceMode: 'single_occurrence'
    })
  ])
}

function applyApplyRedactionEverywhereEffect(records, originalText, effect, operationId) {
  const matchedText = normalizeTerm(effect.matchedText)
  const replacement = normalizeTerm(effect.replacement)
  if (!matchedText || !replacement) {
    return records
  }

  const remainingRecords = records.filter((record) => !isPropagatedRecord(record, matchedText, replacement))
  const additions = buildExactMatchRedactions(originalText, [{
    matchedText,
    replacement,
    label: effect.label ?? replacement,
    operationId,
    sourceKind: 'apply-redaction-everywhere',
    sourceMode: 'exact_matches'
  }], remainingRecords, effect.excludedRecords)

  return normalizeRecordOrder([...remainingRecords, ...additions])
}

function applyRemoveRedactionEverywhereEffect(records, effect) {
  const matchedText = normalizeTerm(effect.matchedText)
  const replacement = normalizeTerm(effect.replacement)
  if (!matchedText || !replacement) {
    return records
  }

  return records.filter((record) => !(sameMatchText(record.matchedText, matchedText) && record.replacement === replacement))
}

function renderOriginalPreviewHtml(originalText, records) {
  let html = ''
  let cursor = 0

  for (const record of records) {
    const start = utf8ByteOffsetToCodeUnitOffset(originalText, record.start)
    const end = utf8ByteOffsetToCodeUnitOffset(originalText, record.end)
    if (start >= end) {
      continue
    }

    if (cursor < start) {
      html += escapeHtml(originalText.slice(cursor, start))
    }

    html += renderMarkedText(record, escapeHtml(originalText.slice(start, end)))
    cursor = end
  }

  if (cursor < originalText.length) {
    html += escapeHtml(originalText.slice(cursor))
  }

  return html
}

function renderRedactedPreviewHtml(originalText, records) {
  let html = ''
  let cursor = 0

  for (const record of records) {
    const start = utf8ByteOffsetToCodeUnitOffset(originalText, record.start)
    const end = utf8ByteOffsetToCodeUnitOffset(originalText, record.end)
    if (start >= end) {
      continue
    }

    if (cursor < start) {
      html += escapeHtml(originalText.slice(cursor, start))
    }

    html += renderMarkedText(record, escapeHtml(renderedReplacementText(record)))
    cursor = end
  }

  if (cursor < originalText.length) {
    html += escapeHtml(originalText.slice(cursor))
  }

  return html
}

function renderMarkedText(record, innerHtml) {
  const attrs = [
    `title="${escapeHtml(highlightLabel(record))}"`,
    `data-record-start="${record.start}"`,
    `data-record-end="${record.end}"`,
    `data-record-replacement="${escapeHtml(record.replacement)}"`,
    `data-record-label="${escapeHtml(highlightLabel(record))}"`,
    `data-record-committed="${record.committed ? 'true' : 'false'}"`
  ]

  if (record.committed) {
    attrs.push(`data-record-committed-start="${record.committedStart}"`)
    attrs.push(`data-record-committed-end="${record.committedEnd}"`)
    attrs.push(`data-record-committed-replacement="${escapeHtml(record.committedReplacement)}"`)
  }

  if (record.operationId) {
    attrs.push(`data-record-operation-id="${record.operationId}"`)
  }
  if (record.sourceKind) {
    attrs.push(`data-record-source-kind="${record.sourceKind}"`)
  }
  if (record.sourceMode) {
    attrs.push(`data-record-source-mode="${record.sourceMode}"`)
  }
  if (record.matchedText) {
    attrs.push(`data-record-matched-text="${escapeHtml(record.matchedText)}"`)
  }

  if (record.manualNumber !== null) {
    attrs.push(`data-manual-number="${record.manualNumber}"`)
  }

  return `<mark ${attrs.join(' ')}>${innerHtml}</mark>`
}

function buildExactMatchRedactions(originalText, rules, existingRecords, excludedRecords = []) {
  const occupied = normalizeRecordOrder(existingRecords).map(cloneRecord)
  const additions = []

  for (const rule of [...rules].sort(compareExactMatchRules)) {
    for (const match of literalCaseInsensitiveMatches(originalText, rule.matchedText)) {
      const candidate = sliceUtf8Bytes(originalText, match.start, match.end)
      if (!hasExactMatchBoundaries(originalText, match.start, match.end, candidate)) {
        continue
      }

      if (overlapsExistingReplacement(occupied, match.start, match.end)) {
        continue
      }

      const record = createRecord(match.start, match.end, rule.replacement, rule.label, candidate, {
        operationId: rule.operationId ?? null,
        sourceKind: rule.sourceKind ?? null,
        sourceMode: rule.sourceMode ?? null
      })
      if (isExcludedDraftRecord(record, excludedRecords)) {
        continue
      }
      occupied.push(record)
      additions.push(record)
    }
  }

  return additions
}

function mapSelectionToOriginalRange(originalText, records, sourcePreview, selectionStart, selectionEnd) {
  if (selectionStart >= selectionEnd) {
    return null
  }

  const start = sourcePreview === 'redacted'
    ? mapRedactedOffsetToOriginal(records, selectionStart)
    : selectionStart
  const end = sourcePreview === 'redacted'
    ? mapRedactedOffsetToOriginal(records, selectionEnd)
    : selectionEnd

  if (start === null || end === null || !validateTextRange(originalText, start, end)) {
    return null
  }

  return { start, end }
}

function mapSelectionToOriginalRangeForMerge(originalText, records, sourcePreview, selectionStart, selectionEnd) {
  if (selectionStart >= selectionEnd) {
    return null
  }

  const start = sourcePreview === 'redacted'
    ? mapRedactedOffsetToOriginalForMerge(records, selectionStart, false)
    : selectionStart
  const end = sourcePreview === 'redacted'
    ? mapRedactedOffsetToOriginalForMerge(records, selectionEnd, true)
    : selectionEnd

  if (start === null || end === null || !validateTextRange(originalText, start, end)) {
    return null
  }

  return { start, end }
}

function mapRedactedOffsetToOriginal(records, offset) {
  let inputCursor = 0
  let outputCursor = 0

  for (const record of renumberManualRedactions(records)) {
    const unchangedLength = record.start - inputCursor
    const replacementStart = outputCursor + unchangedLength
    if (offset <= replacementStart) {
      return inputCursor + (offset - outputCursor)
    }

    const replacementEnd = replacementStart + utf8ByteLength(renderedReplacementText(record))
    if (offset < replacementEnd) {
      return null
    }

    inputCursor = record.end
    outputCursor = replacementEnd
  }

  return inputCursor + (offset - outputCursor)
}

function mapRedactedOffsetToOriginalForMerge(records, offset, useEndBoundary) {
  let inputCursor = 0
  let outputCursor = 0

  for (const record of renumberManualRedactions(records)) {
    const unchangedLength = record.start - inputCursor
    const replacementStart = outputCursor + unchangedLength
    if (offset <= replacementStart) {
      return inputCursor + (offset - outputCursor)
    }

    const replacementEnd = replacementStart + utf8ByteLength(renderedReplacementText(record))
    if (offset < replacementEnd) {
      return useEndBoundary ? record.end : record.start
    }

    inputCursor = record.end
    outputCursor = replacementEnd
  }

  return inputCursor + (offset - outputCursor)
}

function mergedOverlapBounds(records, start, end) {
  let mergeStart = start
  let mergeEnd = end
  let foundOverlap = false

  for (const record of records) {
    if (mergeStart < record.end && mergeEnd > record.start) {
      mergeStart = Math.min(mergeStart, record.start)
      mergeEnd = Math.max(mergeEnd, record.end)
      foundOverlap = true
    }
  }

  return foundOverlap ? { start: mergeStart, end: mergeEnd } : null
}

function overlapsExistingReplacement(records, start, end) {
  return records.some((record) => start < record.end && end > record.start)
}

function literalCaseInsensitiveMatches(text, candidate) {
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'giu')
  const matches = []

  for (const match of text.matchAll(regex)) {
    const matchedText = match[0] ?? ''
    const startCodeUnits = match.index ?? 0
    const endCodeUnits = startCodeUnits + matchedText.length

    matches.push({
      start: utf8ByteLength(text.slice(0, startCodeUnits)),
      end: utf8ByteLength(text.slice(0, endCodeUnits))
    })
  }

  return matches
}

function hasExactMatchBoundaries(text, start, end, matchedText) {
  const firstChar = matchedText[0]
  const lastChar = matchedText.at(-1)
  if (!firstChar || !lastChar) {
    return false
  }

  const startCodeUnits = utf8ByteOffsetToCodeUnitOffset(text, start)
  const endCodeUnits = utf8ByteOffsetToCodeUnitOffset(text, end)
  const leftOk = isWordish(firstChar) ? !isWordish(text[startCodeUnits - 1] ?? '') : true
  const rightOk = isWordish(lastChar) ? !isWordish(text[endCodeUnits] ?? '') : true

  return leftOk && rightOk
}

function isWordish(char) {
  return /[\p{L}\p{N}_]/u.test(char)
}

function validateTextRange(text, start, end) {
  if (start > utf8ByteLength(text) || end > utf8ByteLength(text) || start >= end) {
    return false
  }

  const startCodeUnits = utf8ByteOffsetToCodeUnitOffset(text, start)
  const endCodeUnits = utf8ByteOffsetToCodeUnitOffset(text, end)
  return utf8ByteLength(text.slice(0, startCodeUnits)) === start
    && utf8ByteLength(text.slice(0, endCodeUnits)) === end
}

function sliceUtf8Bytes(text, start, end) {
  return text.slice(
    utf8ByteOffsetToCodeUnitOffset(text, start),
    utf8ByteOffsetToCodeUnitOffset(text, end)
  )
}

function utf8ByteOffsetToCodeUnitOffset(value, targetBytes) {
  let bytes = 0
  let codeUnits = 0

  for (const char of value) {
    if (bytes >= targetBytes) {
      break
    }

    bytes += utf8ByteLength(char)
    codeUnits += char.length
  }

  return codeUnits
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length
}

function renumberManualRedactions(records) {
  let manualNumber = 0

  return normalizeRecordOrder(records).map((record) => {
    if (!isManualRedaction(record)) {
      return {
        ...record,
        manualNumber: null,
        displayText: record.replacement
      }
    }

    manualNumber += 1
    return {
      ...record,
      manualNumber,
      label: `Manual redaction ${manualNumber}`,
      displayText: `[MANUAL_REDACTION_${manualNumber}]`
    }
  })
}

function renderedReplacementText(record) {
  return record.displayText ?? record.replacement
}

function highlightLabel(record) {
  return isManualRedaction(record)
    ? `Manual redaction ${record.manualNumber}`
    : record.label ?? record.replacement
}

function isManualRedaction(record) {
  return record.replacement === MANUAL_REDACTION_REPLACEMENT
}

function createRecord(start, end, replacement, label, matchedText, source = {}) {
  return {
    start,
    end,
    replacement,
    label,
    displayText: replacement,
    matchedText,
    operationId: source.operationId ?? null,
    sourceKind: source.sourceKind ?? null,
    sourceMode: source.sourceMode ?? null,
    committed: false,
    committedStart: null,
    committedEnd: null,
    committedReplacement: null
  }
}

function isExcludedDraftRecord(record, excludedRecords) {
  return (Array.isArray(excludedRecords) ? excludedRecords : []).some((excluded) => sameRecordIdentity(record, excluded))
}

function sameRecordIdentity(record, identity) {
  return record.start === identity.start
    && record.end === identity.end
    && record.replacement === identity.replacement
}

function normalizeRecordOrder(records) {
  return [...records].sort((left, right) => left.start - right.start || left.end - right.end)
}

function cloneRecord(record) {
  return { ...record }
}

function countMarks(html) {
  return (html.match(/<mark\b/g) ?? []).length
}

function sameMatchText(left, right) {
  return normalizeTerm(left).toLowerCase() === normalizeTerm(right).toLowerCase()
}

function normalizeTerm(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isPropagatedRecord(record, matchedText, replacement) {
  return sameMatchText(record.matchedText, matchedText) && record.replacement === replacement
}

function compareExactMatchRules(left, right) {
  return right.matchedText.length - left.matchedText.length
    || left.replacement.localeCompare(right.replacement)
    || left.matchedText.localeCompare(right.matchedText)
}

function parseAttributes(attributeText) {
  const attributes = {}

  for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]] = match[2]
  }

  return attributes
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function decodeHtml(text) {
  return String(text)
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&')
}
