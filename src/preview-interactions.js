export function setupPreviewInteractions({
  beforePreview,
  afterPreview,
  previewActionTooltip,
  previewActionLabel,
  previewActionButtons,
  previewInteractionState,
  getCurrentPreview,
  toPreviewRequest,
  allPreviewRequests,
  queuePendingRedactionOperation,
  replacePreviewState,
  replacePreviewStates,
  appendSummary,
  nextPaint,
  buildCrossFileDraftEffect,
  draftPreviewState,
  invoke,
  schedulePreviewScrollSync,
  rememberSelectionIntent,
  clearRecentSelectionIntent,
  hasRecentSelectionIntent
}) {
  let previewActionHideTimer = null

  function targetElement(target) {
    return target instanceof Element ? target : target?.parentElement ?? null
  }

  function clearRedactionClass(className) {
    for (const mark of document.querySelectorAll(`.preview-text mark.${className}`)) {
      mark.classList.remove(className)
    }
  }

  function hasRedactionClass(className) {
    return document.querySelector(`.preview-text mark.${className}`) !== null
  }

  function setMatchingRedactionClass({ start, end, replacement }, className) {
    clearRedactionClass(className)

    for (const mark of document.querySelectorAll('.preview-text mark[data-record-start]')) {
      if (
        mark.dataset.recordStart === String(start)
        && mark.dataset.recordEnd === String(end)
        && mark.dataset.recordReplacement === replacement
      ) {
        mark.classList.add(className)
      }
    }
  }

  function clearFocusedRedactions() {
    clearRedactionClass('focused-redaction')
  }

  function clearHoveredRedactions() {
    clearRedactionClass('hovered-redaction')
  }

  function focusMatchingRedactions(identity) {
    setMatchingRedactionClass(identity, 'focused-redaction')
  }

  function hoverMatchingRedactions(identity) {
    setMatchingRedactionClass(identity, 'hovered-redaction')
  }

  function hidePreviewActionTooltip() {
    if (!previewInteractionState.isTooltipVisible() && !previewActionHideTimer && !hasRedactionClass('focused-redaction')) {
      return
    }

    if (previewActionHideTimer) {
      clearTimeout(previewActionHideTimer)
      previewActionHideTimer = null
    }

    const startedHide = previewInteractionState.beginTooltipHide()
    if (!startedHide) {
      return
    }

    clearFocusedRedactions()
    previewActionHideTimer = setTimeout(() => {
      previewInteractionState.finishTooltipHide()
      previewActionHideTimer = null
    }, 180)
  }

  function showPreviewActionTooltip({ rect, label, actions }) {
    if (previewActionHideTimer) {
      clearTimeout(previewActionHideTimer)
      previewActionHideTimer = null
    }

    previewInteractionState.showTooltip({ label, actions, layout: null })

    requestAnimationFrame(() => {
      const tooltipGap = 10
      const viewportPadding = 12
      const tooltipWidth = previewActionTooltip.offsetWidth || 240
      const tooltipHeight = previewActionTooltip.offsetHeight || 88
      const targetCenterX = rect.left + rect.width / 2
      const centeredLeft = targetCenterX - tooltipWidth / 2
      const clampedLeft = Math.min(
        Math.max(centeredLeft, viewportPadding),
        window.innerWidth - tooltipWidth - viewportPadding
      )
      const preferredTop = rect.top - tooltipHeight - tooltipGap
      const canPlaceAbove = preferredTop >= viewportPadding
      const top = canPlaceAbove
        ? preferredTop
        : Math.min(rect.bottom + tooltipGap, window.innerHeight - tooltipHeight - viewportPadding)
      const arrowLeft = Math.min(Math.max(targetCenterX - clampedLeft, 18), tooltipWidth - 18)

      previewInteractionState.patchTooltip({
        placement: canPlaceAbove ? 'top' : 'bottom',
        arrowLeft,
        left: clampedLeft,
        top
      })

      requestAnimationFrame(() => {
        previewInteractionState.markTooltipOpen()
      })
    })
  }

  function utf8ByteLength(value) {
    return new TextEncoder().encode(value).length
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

  function literalCaseInsensitiveMatches(text, candidate) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'giu')
    return Array.from(text.matchAll(regex), (match) => ({
      start: utf8ByteLength(text.slice(0, match.index ?? 0)),
      end: utf8ByteLength(text.slice(0, (match.index ?? 0) + (match[0] ?? '').length)),
      text: match[0] ?? ''
    }))
  }

  function isWordish(char) {
    return /[\p{L}\p{N}_]/u.test(char)
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

  function currentDraftRanges() {
    return Array.from(document.querySelectorAll('.preview-text mark[data-record-start]')).map((mark) => ({
      start: Number(mark.dataset.recordStart ?? 0),
      end: Number(mark.dataset.recordEnd ?? 0)
    }))
  }

  function overlapsRange(start, end, range) {
    return start < range.end && end > range.start
  }

  function hasAdditionalUnredactedMatches(preview, matchedText, currentIdentity) {
    const originalText = preview?.originalText ?? ''
    if (!originalText || !matchedText) {
      return false
    }

    const ranges = currentDraftRanges()
    return literalCaseInsensitiveMatches(originalText, matchedText).some((match) => {
      if (!hasExactMatchBoundaries(originalText, match.start, match.end, match.text)) {
        return false
      }
      if (match.start === currentIdentity.start && match.end === currentIdentity.end) {
        return false
      }
      return !ranges.some((range) => overlapsRange(match.start, match.end, range))
    })
  }

  function queueDraftExactMatchRedaction(preview, identity, matchedText) {
    queuePendingRedactionOperation({
      queuedMessage: `Queued redact-everywhere for "${matchedText}" in this file. Press Save to apply it.`,
      draftEffect: {
        kind: 'add-manual-redaction',
        previewPath: preview.path ?? '',
        sourcePreview: 'original',
        selectionStart: identity.start,
        selectionEnd: identity.end,
        redactionScope: 'file_exact_matches'
      },
      run: async () => {
        try {
          const result = await invoke('add_manual_redaction', {
            request: {
              ...toPreviewRequest(preview),
              sourcePreview: 'original',
              selectionStart: identity.start,
              selectionEnd: identity.end,
              redactionScope: 'file_exact_matches'
            }
          })
          replacePreviewState(result.preview, result.replacements)
          appendSummary('Added manual redaction for all exact matches and updated output files.')
          return true
        } catch (error) {
          appendSummary(`Add redaction error: ${String(error)}`)
          return false
        }
      }
    })
  }

  function absoluteCodeUnitOffset(root, node, offset) {
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(node, offset)
    return range.toString().length
  }

  function selectionAnchorRect(range) {
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
    const rect = rects[0] ?? range.getBoundingClientRect()

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom
    }
  }

  function selectionWithinPreview() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    const range = selection.getRangeAt(0)
    const containers = [
      { element: beforePreview, sourcePreview: 'original' },
      { element: afterPreview, sourcePreview: 'redacted' }
    ]

    for (const { element, sourcePreview } of containers) {
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
        continue
      }

      const fullText = element.textContent ?? ''
      const startCodeUnits = absoluteCodeUnitOffset(element, range.startContainer, range.startOffset)
      const endCodeUnits = absoluteCodeUnitOffset(element, range.endContainer, range.endOffset)
      if (startCodeUnits === endCodeUnits) {
        return null
      }

      return {
        sourcePreview,
        selectionStart: utf8ByteLength(fullText.slice(0, startCodeUnits)),
        selectionEnd: utf8ByteLength(fullText.slice(0, endCodeUnits)),
        rect: selectionAnchorRect(range)
      }
    }

    return null
  }

  function createManualRedactionAction(preview, selection, scope, successMessage) {
    return async () => {
      clearRecentSelectionIntent()
      window.getSelection()?.removeAllRanges()
      queuePendingRedactionOperation({
        queuedMessage: `${successMessage.replace('updated output files.', 'queued locally. Press Save to apply it.')}`,
        draftEffect: {
          kind: 'add-manual-redaction',
          previewPath: preview.path ?? '',
          sourcePreview: selection.sourcePreview,
          selectionStart: selection.selectionStart,
          selectionEnd: selection.selectionEnd,
          redactionScope: scope
        },
        run: async () => {
          try {
            const result = await invoke('add_manual_redaction', {
              request: {
                ...toPreviewRequest(preview),
                sourcePreview: selection.sourcePreview,
                selectionStart: selection.selectionStart,
                selectionEnd: selection.selectionEnd,
                redactionScope: scope
              }
            })
            replacePreviewState(result.preview, result.replacements)
            appendSummary(successMessage)
            return true
          } catch (error) {
            appendSummary(`Add redaction error: ${String(error)}`)
            return false
          }
        }
      })
    }
  }

  function createMergeManualRedactionAction(preview, selection) {
    return async () => {
      clearRecentSelectionIntent()
      window.getSelection()?.removeAllRanges()
      queuePendingRedactionOperation({
        queuedMessage: 'Queued merge into one redaction. Press Save to apply it.',
        draftEffect: {
          kind: 'merge-manual-redaction',
          previewPath: preview.path ?? '',
          sourcePreview: selection.sourcePreview,
          selectionStart: selection.selectionStart,
          selectionEnd: selection.selectionEnd
        },
        run: async () => {
          try {
            const result = await invoke('merge_manual_redaction', {
              request: {
                ...toPreviewRequest(preview),
                sourcePreview: selection.sourcePreview,
                selectionStart: selection.selectionStart,
                selectionEnd: selection.selectionEnd,
                redactionScope: 'single_occurrence'
              }
            })
            replacePreviewState(result.preview, result.replacements)
            appendSummary('Merged selection into one manual redaction and updated output files.')
            return true
          } catch (error) {
            appendSummary(`Merge redaction error: ${String(error)}`)
            return false
          }
        }
      })
    }
  }

  async function handleRedactionRemoval(markElement) {
    if (previewInteractionState.actionInFlight.peek()) {
      return
    }

    if (markElement.dataset.recordCommitted === 'false') {
      const preview = getCurrentPreview()
      const identity = {
        start: Number(markElement.dataset.recordStart ?? 0),
        end: Number(markElement.dataset.recordEnd ?? 0),
        replacement: markElement.dataset.recordReplacement ?? ''
      }
      const operationId = markElement.dataset.recordOperationId ?? null
      const matchedText = markElement.dataset.recordMatchedText ?? ''
      const sourceMode = markElement.dataset.recordSourceMode ?? ''
      const actions = [{
        buttonText: 'Remove redaction',
        run: async () => {
          if (!operationId) {
            return
          }
          if (sourceMode === 'exact_matches') {
            draftPreviewState.excludePendingRecord(operationId, identity)
          } else {
            draftPreviewState.removePendingOperation(operationId)
          }
          appendSummary('Removed pending draft redaction.')
        }
      }]

      if (preview && sourceMode !== 'exact_matches' && hasAdditionalUnredactedMatches(preview, matchedText, identity)) {
        actions.unshift({
          buttonText: 'Redact everywhere',
          variant: 'preview-action-button-accent',
          run: async () => {
            queueDraftExactMatchRedaction(preview, identity, matchedText)
          }
        })
      }

      focusMatchingRedactions(identity)
      showPreviewActionTooltip({
        rect: markElement.getBoundingClientRect(),
        label: 'Manage this draft redaction?',
        actions
      })
      return
    }

    const preview = getCurrentPreview()
    if (!preview) {
      return
    }

    const rect = markElement.getBoundingClientRect()
    const recordLabel = markElement.dataset.recordLabel ?? 'this redaction'
    const removalLabel = markElement.dataset.manualNumber
      ? `Manage ${recordLabel.toLowerCase()}?`
      : 'Manage this redaction?'
    const redactionIdentity = {
      start: Number(markElement.dataset.recordCommittedStart ?? markElement.dataset.recordStart ?? 0),
      end: Number(markElement.dataset.recordCommittedEnd ?? markElement.dataset.recordEnd ?? 0),
      replacement: markElement.dataset.recordCommittedReplacement ?? markElement.dataset.recordReplacement ?? ''
    }
    const request = {
      source: {
        preview: toPreviewRequest(preview),
        ...redactionIdentity
      },
      targets: allPreviewRequests()
    }

    focusMatchingRedactions({ ...redactionIdentity })
    showPreviewActionTooltip({
      rect,
      label: 'Checking available redaction actions…',
      actions: [{ buttonText: 'Loading…', disabled: true }]
    })

    let availability
    try {
      availability = await invoke('inspect_redaction_across_files', { request })
    } catch (error) {
      clearFocusedRedactions()
      hidePreviewActionTooltip()
      appendSummary(`Inspect redaction everywhere error: ${String(error)}`)
      return
    }

    const actions = []
    if ((availability?.applicableTargets ?? 0) > 0) {
      actions.push({
        buttonText: 'Apply everywhere',
        variant: 'preview-action-button-accent',
        run: async () => {
          queuePendingRedactionOperation({
            queuedMessage: 'Queued apply-everywhere redaction. Press Save to apply it.',
            draftEffect: buildCrossFileDraftEffect('apply-redaction-everywhere', preview, redactionIdentity),
            run: async () => {
              try {
                const result = await invoke('apply_redaction_to_all_files', { request })
                replacePreviewStates(result.updates ?? [])
                appendSummary(
                  `Applied this redaction across ${result.updatedTargets ?? 0} file(s). `
                  + `${result.unchangedTargets ?? 0} file(s) already matched.`
                )
                return true
              } catch (error) {
                appendSummary(`Apply redaction everywhere error: ${String(error)}`)
                return false
              }
            }
          })
        }
      })
    }

    if ((availability?.removableTargets ?? 0) > 0) {
      actions.push({
        buttonText: 'Remove everywhere',
        run: async () => {
          queuePendingRedactionOperation({
            queuedMessage: 'Queued remove-everywhere redaction. Press Save to apply it.',
            draftEffect: buildCrossFileDraftEffect('remove-redaction-everywhere', preview, redactionIdentity),
            run: async () => {
              try {
                const result = await invoke('remove_redaction_from_all_files', { request })
                replacePreviewStates(result.updates ?? [])
                appendSummary(
                  `Removed this redaction across ${result.updatedTargets ?? 0} file(s). `
                  + `${result.unchangedTargets ?? 0} file(s) had nothing to remove.`
                )
                return true
              } catch (error) {
                appendSummary(`Remove redaction everywhere error: ${String(error)}`)
                return false
              }
            }
          })
        }
      })
    }

    actions.push({
      buttonText: 'Remove here',
      run: async () => {
        queuePendingRedactionOperation({
          queuedMessage: 'Queued removal of the selected redaction from this file. Press Save to apply it.',
          draftEffect: {
            kind: 'remove-redaction',
            previewPath: preview.path ?? '',
            ...redactionIdentity
          },
          run: async () => {
            try {
              const result = await invoke('remove_redaction', {
                request: {
                  ...toPreviewRequest(preview),
                  ...redactionIdentity,
                  redactionScope: 'single_occurrence'
                }
              })
              replacePreviewState(result.preview, result.replacements)
              appendSummary('Removed selected redaction from this file.')
              return true
            } catch (error) {
              appendSummary(`Remove redaction error: ${String(error)}`)
              return false
            }
          }
        })
      }
    })

    showPreviewActionTooltip({ rect, label: removalLabel, actions })
  }

  function maybeShowAddRedactionTooltip() {
    const requestId = previewInteractionState.nextRequestId()
    void maybeShowAddRedactionTooltipAsync(requestId)
  }

  async function maybeShowAddRedactionTooltipAsync(requestId) {
    const preview = getCurrentPreview()
    if (!preview) {
      hidePreviewActionTooltip()
      return
    }

    const selection = selectionWithinPreview()
    if (!selection) {
      hidePreviewActionTooltip()
      return
    }

    showPreviewActionTooltip({
      rect: selection.rect,
      label: 'Checking available redaction options…',
      actions: [{ buttonText: 'Loading…', disabled: true }]
    })

    let availability
    try {
      availability = await invoke('inspect_manual_redaction', {
        request: {
          ...toPreviewRequest(preview),
          sourcePreview: selection.sourcePreview,
          selectionStart: selection.selectionStart,
          selectionEnd: selection.selectionEnd,
          redactionScope: 'file_exact_matches'
        }
      })
    } catch (_error) {
      if (requestId === previewInteractionState.requestId.peek()) {
        hidePreviewActionTooltip()
      }
      return
    }

    const latestSelection = selectionWithinPreview()
    if (
      requestId !== previewInteractionState.requestId.peek()
      || !latestSelection
      || latestSelection.sourcePreview !== selection.sourcePreview
      || latestSelection.selectionStart !== selection.selectionStart
      || latestSelection.selectionEnd !== selection.selectionEnd
    ) {
      return
    }

    const actions = []
    if (availability?.mergeable) {
      actions.push({
        buttonText: 'Merge into redaction',
        variant: 'preview-action-button-accent',
        run: createMergeManualRedactionAction(preview, selection)
      })
    } else if ((availability?.exactMatchCount ?? 0) > 1) {
      actions.push({
        buttonText: 'Redact all matches',
        variant: 'preview-action-button-accent',
        run: createManualRedactionAction(
          preview,
          selection,
          'file_exact_matches',
          'Added manual redaction for all exact matches and updated output files.'
        )
      })
    }

    if (!availability?.mergeable) {
      actions.push({
        buttonText: 'Redact this',
        run: createManualRedactionAction(
          preview,
          selection,
          'single_occurrence',
          'Added manual redaction for the selected occurrence and updated output files.'
        )
      })
    }

    showPreviewActionTooltip({
      rect: selection.rect,
      label: availability?.mergeable
        ? 'Merge this selection into one redaction?'
        : actions.length > 1
        ? 'Choose whether to redact just this occurrence or all exact matches in this file.'
        : 'Redact this selected text?',
      actions
    })
  }

  function handleRedactionHover(event) {
    const mark = targetElement(event.target)?.closest('mark[data-record-start]')
    if (!mark) {
      clearHoveredRedactions()
      return
    }

    hoverMatchingRedactions({
      start: Number(mark.dataset.recordStart ?? 0),
      end: Number(mark.dataset.recordEnd ?? 0),
      replacement: mark.dataset.recordReplacement ?? ''
    })
  }

  function handleRedactionHoverLeave(event) {
    const related = targetElement(event.relatedTarget)
    if (related?.closest('mark[data-record-start]')) {
      return
    }

    clearHoveredRedactions()
  }

  async function handlePreviewClick(event) {
    const mark = targetElement(event.target)?.closest('mark[data-record-start]')
    if (mark) {
      event.preventDefault()
      await handleRedactionRemoval(mark)
      return
    }

    if (selectionWithinPreview() || hasRecentSelectionIntent()) {
      event.preventDefault()
      maybeShowAddRedactionTooltip()
    }
  }

  function handlePreviewMouseUp() {
    if (!selectionWithinPreview()) {
      return
    }

    rememberSelectionIntent()
    requestAnimationFrame(maybeShowAddRedactionTooltip)
  }

  function handlePreviewKeyUp() {
    requestAnimationFrame(maybeShowAddRedactionTooltip)
  }

  function handlePreviewScroll(source, target) {
    hidePreviewActionTooltip()
    schedulePreviewScrollSync(source, target)
  }

  beforePreview.addEventListener('click', handlePreviewClick)
  afterPreview.addEventListener('click', handlePreviewClick)
  beforePreview.addEventListener('mouseover', handleRedactionHover)
  afterPreview.addEventListener('mouseover', handleRedactionHover)
  beforePreview.addEventListener('mouseout', handleRedactionHoverLeave)
  afterPreview.addEventListener('mouseout', handleRedactionHoverLeave)
  beforePreview.addEventListener('mouseup', handlePreviewMouseUp)
  afterPreview.addEventListener('mouseup', handlePreviewMouseUp)
  beforePreview.addEventListener('keyup', handlePreviewKeyUp)
  afterPreview.addEventListener('keyup', handlePreviewKeyUp)
  beforePreview.addEventListener('scroll', () => {
    handlePreviewScroll(beforePreview, afterPreview)
  }, { passive: true })
  afterPreview.addEventListener('scroll', () => {
    handlePreviewScroll(afterPreview, beforePreview)
  }, { passive: true })

  previewActionButtons.addEventListener('click', async (event) => {
    const button = targetElement(event.target)?.closest('button[data-action-index]')
    if (!button) {
      return
    }

    const action = previewInteractionState.actionRuns.peek()[Number(button.dataset.actionIndex)]
    if (!action) {
      return
    }

    previewInteractionState.actionInFlight.value = true
    hidePreviewActionTooltip()
    try {
      await action()
      await nextPaint()
    } finally {
      previewInteractionState.actionInFlight.value = false
    }
  })

  document.addEventListener('click', (event) => {
    if (previewActionTooltip.hidden) {
      return
    }

    if (previewActionTooltip.contains(event.target)) {
      return
    }

    if (targetElement(event.target)?.closest('.preview-text mark')) {
      return
    }

    hidePreviewActionTooltip()
  })

  return {
    selectionWithinPreview,
    maybeShowAddRedactionTooltip,
    hidePreviewActionTooltip
  }
}
