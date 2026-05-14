import './styles.css'
import { effect, signal } from '@preact/signals-core'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { loadSavedRedactionTerms, saveSavedRedactionTerms } from './redaction-term-store.js'
import { createPreviewDraftState } from './preview-draft-state.js'
import { createPreviewInteractionState } from './preview-interaction-state.js'
import { setupPreviewInteractions } from './preview-interactions.js'
import { createRedactionSidebarController } from './redaction-sidebar-controller.js'
import { createWorkspaceProcessingController } from './workspace-processing-controller.js'
import {
  createRedactionSidebarState
} from './redaction-sidebar-state.js'
import { buildReviewNotice } from './review-notice.js'
import { imageOcrSourcePath } from './ocr-preview.js'
import {
  createWorkspaceState,
  failProcessing,
  finishProcessing,
  getFileReviewLabel,
  getSidebarScopedPreviews,
  getSelectedFileStatus,
  getSelectedPreview,
  replacePreviewArtifacts,
  selectPreviewPath,
  setSelectedInput,
  startProcessing,
  toggleWorkspaceHighlights
} from './workspace-state.js'

const inputPath = document.getElementById('inputPath')
const pickInput = document.getElementById('pickInput')
const pickFolder = document.getElementById('pickFolder')
const redactionTermInput = document.getElementById('redactionTermInput')
const findAndRedactButton = document.getElementById('findAndRedact')
const saveRedactionEditsButton = document.getElementById('saveRedactionEdits')
const redactionTermsList = document.getElementById('redactionTermsList')
const relatedRedactionTerms = document.getElementById('relatedRedactionTerms')
const resultsPanel = document.getElementById('resultsPanel')
const resultFiles = document.getElementById('resultFiles')
const previewPanel = document.getElementById('previewPanel')
const previewTitle = document.getElementById('previewTitle')
const selectedFileCount = document.getElementById('selectedFileCount')
const selectedFileStatus = document.getElementById('selectedFileStatus')
const previewHighlightCount = document.getElementById('previewHighlightCount')
const toggleHighlights = document.getElementById('toggleHighlights')
const previewNote = document.getElementById('previewNote')
const ocrImageReview = document.getElementById('ocrImageReview')
const ocrSourceImage = document.getElementById('ocrSourceImage')
const ocrImageError = document.getElementById('ocrImageError')
const editOcrText = document.getElementById('editOcrText')
const ocrTextEditor = document.getElementById('ocrTextEditor')
const ocrCorrectedText = document.getElementById('ocrCorrectedText')
const saveOcrText = document.getElementById('saveOcrText')
const cancelOcrText = document.getElementById('cancelOcrText')
const beforePreview = document.getElementById('beforePreview')
const afterPreview = document.getElementById('afterPreview')
const previewActionTooltip = document.getElementById('previewActionTooltip')
const previewActionLabel = document.getElementById('previewActionLabel')
const previewActionButtons = document.getElementById('previewActionButtons')
const summary = document.getElementById('summary')
const openOutput = document.getElementById('openOutput')
const openAudit = document.getElementById('openAudit')
const loadingOverlay = document.getElementById('loadingOverlay')
const loadingTitle = document.getElementById('loadingTitle')
const loadingMessage = document.getElementById('loadingMessage')
const workspace = signal(createWorkspaceState(
  'Desktop shell loaded. Choose a file or folder to start local processing automatically.'
))
const LARGE_PREVIEW_SCROLL_SYNC_TEXT_LIMIT = 300_000
const LARGE_PREVIEW_SCROLL_SYNC_HTML_LIMIT = 900_000
let savedRedactionTerms = loadSavedRedactionTerms()
const redactionSidebar = createRedactionSidebarState({ draftPreviewDelayMs: 140 })
const draftPreviewState = createPreviewDraftState({ redactionSidebar })
const previewInteractionState = createPreviewInteractionState()
redactionSidebar.setPersistedTerms(savedRedactionTerms)
let previewScrollSyncFrame = null
let suppressPreviewScrollSync = false
let saveRedactionEditsInFlight = false
let saveOcrTextInFlight = false
let ocrEditorPreviewPath = null
let ocrImageLoadToken = 0
let recentSelectionIntentUntil = 0
let lastSidebarPreviewSet = null
let lastSidebarPreviewPath = null
let lastSidebarTermsSignature = ''
let lastRenderedBeforeHtml = null
let lastRenderedAfterHtml = null
const activeRedactionTermId = signal(null)
const liveFindTerm = signal('')
let debugInputSequence = 0
const debugEvents = []

if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  window.__tnsDesktopDebug = {
    setWorkspaceFixture(nextWorkspace) {
      workspace.value = {
        ...workspace.peek(),
        ...nextWorkspace
      }
    },
    selectionWithinPreview() {
      return previewInteractions.selectionWithinPreview()
    },
    showSelectionTooltip() {
      previewInteractions.maybeShowAddRedactionTooltip()
      const rect = previewActionTooltip.getBoundingClientRect()
      return {
        hidden: previewActionTooltip.hidden,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        placement: previewActionTooltip.dataset.placement,
        arrowLeft: getComputedStyle(previewActionTooltip).getPropertyValue('--tooltip-arrow-left')
      }
    },
    redactionDebugState() {
      return {
        activeRedactionTermId: activeRedactionTermId.value,
        terms: redactionSidebar.sourceTerms.value.map((term) => redactionSidebarController.snapshotTermState(term)),
        persistedTerms: [...savedRedactionTerms],
        events: [...debugEvents]
      }
    },
    clearRedactionDebugEvents() {
      debugEvents.length = 0
    }
  }
}

toggleHighlights.addEventListener('click', () => {
  workspace.value = toggleWorkspaceHighlights(workspace.peek())
})

editOcrText.addEventListener('click', () => {
  startOcrTextCorrection()
})

cancelOcrText.addEventListener('click', () => {
  closeOcrTextCorrection()
})

saveOcrText.addEventListener('click', async () => {
  await saveOcrTextCorrection()
})

function syncRedactionSidebar(state, force = false) {
  const sidebarPreviews = getSidebarScopedPreviews(state)
  const sidebarPreviewPath = sidebarPreviews[0]?.path ?? null
  const sidebarTerms = draftPreviewState.selectedBaseDraftTerms.value
  const sidebarTermsSignature = sidebarTerms
    .map((term) => `${term.key}:${term.occurrences}`)
    .join('|')

  if (!force && (activeRedactionTermId.value !== null || (
    state.filePreviews === lastSidebarPreviewSet
    && sidebarPreviewPath === lastSidebarPreviewPath
    && sidebarTermsSignature === lastSidebarTermsSignature
  ))) {
    recordDebugEvent('skip-sidebar-sync', {
      force,
      activeRedactionTermId: activeRedactionTermId.value,
      samePreviewSet: state.filePreviews === lastSidebarPreviewSet,
      samePreviewPath: sidebarPreviewPath === lastSidebarPreviewPath,
      sameTerms: sidebarTermsSignature === lastSidebarTermsSignature,
      sidebarPreviewPath
    })
    return
  }

  redactionSidebar.syncFromDraftState({
    filePreviews: sidebarPreviews,
    terms: sidebarTerms
  })
  lastSidebarPreviewSet = state.filePreviews
  lastSidebarPreviewPath = sidebarPreviewPath
  lastSidebarTermsSignature = sidebarTermsSignature
  recordDebugEvent('sync-sidebar', {
    force,
    sidebarPreviewPath,
    termIds: redactionSidebar.sourceTerms.value.map((term) => term.id)
  })
}

function renderLoadingOverlay(state) {
  if (!state.processingInFlight) {
    loadingOverlay.hidden = true
    return
  }

  loadingTitle.textContent = state.inputPath.trim()
    ? 'Preparing review workspace…'
    : 'Processing selection…'
  loadingMessage.textContent = state.summary || 'Loading selected files and building previews.'
  loadingOverlay.hidden = false
}

function renderSelectedFileStrip(state) {
  const selectedStatus = getSelectedFileStatus(state)
  const selectedDraftStatus = draftPreviewState.selectedDraftStatus.value
  const reviewLabel = getFileReviewLabel(selectedStatus)
  previewTitle.textContent = selectedStatus?.path ?? 'No file selected'
  selectedFileCount.textContent = `${selectedDraftStatus?.replacements ?? selectedStatus?.replacements ?? 0} redactions`
  selectedFileStatus.textContent = selectedDraftStatus?.hasDraftChanges
    ? `${reviewLabel} • Draft changes pending`
    : reviewLabel
  selectedFileStatus.className = `status-badge ${selectedFileStatusClass(reviewLabel)}`
}

function selectedFileStatusClass(label) {
  if (label === 'Ready') {
    return 'status-good'
  }

  if (label === 'Needs attention') {
    return 'status-attention'
  }

  if (label === 'Needs manual review') {
    return 'status-warn'
  }

  return 'status-neutral'
}

pickInput.addEventListener('click', async () => {
  await pickInputPath({ directory: false, label: 'file' })
})

pickFolder.addEventListener('click', async () => {
  await pickInputPath({ directory: true, label: 'folder' })
})

async function pickInputPath({ directory, label }) {
  try {
    const selected = await open({ directory, multiple: false })

    if (typeof selected === 'string') {
      workspace.value = {
        ...setSelectedInput(workspace.peek(), selected),
        summary: `Selected ${label}. Preparing review workspace...`
      }
      await workspaceProcessingController.processSelectedInput({ sourceLabel: label })
      return
    }

    workspace.value = {
      ...workspace.peek(),
      summary: `${capitalize(label)} selection cancelled.`
    }
  } catch (error) {
    workspace.value = {
      ...workspace.peek(),
      summary: `${capitalize(label)} picker error: ${String(error)}`
    }
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
    })
  })
}

const previewInteractions = setupPreviewInteractions({
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
  draftPreviewState,
  replacePreviewState,
  replacePreviewStates,
  appendSummary,
  nextPaint,
  buildCrossFileDraftEffect,
  invoke,
  schedulePreviewScrollSync,
  rememberSelectionIntent,
  clearRecentSelectionIntent,
  hasRecentSelectionIntent
})

const redactionSidebarController = createRedactionSidebarController({
  redactionSidebar,
  activeRedactionTermId,
  redactionTermsList,
  relatedRedactionTerms,
  redactionTermInput,
  recordDebugEvent,
  onSuggestionSelected: async () => {
    await handleFindAndRedact()
  },
  onDeleteTermRequested: async ({ termId, committedTerm, displayedTerm }) => {
    const visibleTerm = displayedTerm || committedTerm
    if (!window.confirm(`Remove redaction term "${visibleTerm}" everywhere in this workspace?`)) {
      return
    }

    activeRedactionTermId.value = null
    redactionSidebar.resetDraft(termId)
    queuePendingRedactionOperation({
      queuedMessage: `Queued deletion of redaction term "${visibleTerm}". Press Save to apply it.`,
      draftEffect: {
        kind: 'delete-redaction-term',
        term: committedTerm
      },
      run: async () => await deleteRedactionTermById(termId, committedTerm)
    })
  },
  nextDebugInputId: () => `redaction-input-${++debugInputSequence}`
})

const workspaceProcessingController = createWorkspaceProcessingController({
  workspace,
  invoke,
  nextPaint,
  startProcessing,
  finishProcessing,
  failProcessing,
  queuePendingRedactionOperation,
  syncRedactionSidebar,
  saveSavedRedactionTerms,
  redactionSidebar,
  replacePreviewStates,
  appendSummary,
  getSavedRedactionTerms: () => savedRedactionTerms,
  setSavedRedactionTerms: (terms) => {
    savedRedactionTerms = terms
  }
})

effect(() => {
  redactionSidebarController.renderSuggestions(redactionSidebar.relatedSuggestions.value)
})

effect(() => {
  saveRedactionEditsButton.disabled = !draftPreviewState.saveButtonEnabled.value
})

effect(() => {
  const state = workspace.value
  draftPreviewState.syncWorkspace(state)
  draftPreviewState.selectedBaseDraftTerms.value
  syncRedactionSidebar(state)
})

effect(() => {
  renderSelectedInput(workspace.value.inputPath)
})

effect(() => {
  draftPreviewState.draftPreviewByPath.value
  renderResultFiles(workspace.value)
})

effect(() => {
  draftPreviewState.selectedDraftStatus.value
  renderSelectedFileStrip(workspace.value)
})

effect(() => {
  draftPreviewState.draftBeforeHtml.value
  draftPreviewState.draftAfterHtml.value
  draftPreviewState.draftHighlightCount.value
  renderPreview(draftPreviewState.selectedPreview.value)
})

effect(() => {
  renderLoadingOverlay(workspace.value)
})

effect(() => {
  summary.textContent = workspace.value.summary
})

effect(() => {
  const state = workspace.value
  openOutput.disabled = !state.artifactsAvailable
  openAudit.disabled = !state.artifactsAvailable
})

effect(() => {
  const state = workspace.value
  const enabled = !state.processingInFlight
  const hasPreviews = state.filePreviews.length > 0
  pickInput.disabled = !enabled
  pickFolder.disabled = !enabled
  findAndRedactButton.disabled = !enabled || !hasPreviews
  redactionTermInput.disabled = !enabled || !hasPreviews
  editOcrText.disabled = !enabled || draftPreviewState.hasPendingChanges.value || saveOcrTextInFlight
  saveOcrText.disabled = !enabled || saveOcrTextInFlight
})

effect(() => {
  applyHighlightVisibility(workspace.value)
})

effect(() => {
  if (activeRedactionTermId.value === null) {
    redactionSidebarController.renderTerms(redactionSidebar.sourceTerms.value)
  }
})

effect(() => {
  const tooltip = previewInteractionState.tooltip.value
  previewActionLabel.textContent = tooltip.label
  previewActionButtons.replaceChildren(
    ...tooltip.actions.map((action, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `preview-action-button secondary-button ${action.variant ?? ''}`.trim()
      button.dataset.actionIndex = String(index)
      button.textContent = action.buttonText
      button.disabled = Boolean(action.disabled)
      return button
    })
  )
  previewActionTooltip.hidden = tooltip.hidden
  previewActionTooltip.setAttribute('aria-hidden', tooltip.ariaHidden)
  if (tooltip.state) {
    previewActionTooltip.dataset.state = tooltip.state
  } else {
    delete previewActionTooltip.dataset.state
  }
  if (tooltip.placement) {
    previewActionTooltip.dataset.placement = tooltip.placement
  } else {
    delete previewActionTooltip.dataset.placement
  }
  if (tooltip.arrowLeft !== null) {
    previewActionTooltip.style.setProperty('--tooltip-arrow-left', `${tooltip.arrowLeft}px`)
  }
  if (tooltip.left !== null) {
    previewActionTooltip.style.left = `${tooltip.left}px`
  }
  if (tooltip.top !== null) {
    previewActionTooltip.style.top = `${tooltip.top}px`
  }
})

function renderSelectedInput(inputPathValue) {
  inputPath.value = inputPathValue.trim()
}

function queuePendingRedactionOperation(operation) {
  draftPreviewState.queuePendingOperation(operation)
  appendSummary(operation.queuedMessage)
}

async function savePendingRedactionEdits() {
  const pendingEdits = redactionSidebar.pendingEdits.value
  const state = workspace.peek()
  if (saveRedactionEditsInFlight || !draftPreviewState.hasPendingChanges.value || state.processingInFlight || state.filePreviews.length === 0) {
    return
  }

  saveRedactionEditsInFlight = true
  draftPreviewState.setSaveInFlight(true)

  try {
    let appliedCount = 0
    const queuedOperations = draftPreviewState.takePendingOperations()
    const failedOperations = []

    for (const edit of pendingEdits) {
      const applied = await replaceRedactionTerm(edit.previousTerm, edit.nextTerm, {
        quiet: true,
        termId: edit.termId
      })
      if (!applied) {
        continue
      }

      appliedCount += 1
      redactionSidebar.applyCommittedValue(edit.termId, edit.nextTerm)
    }

    for (const operation of queuedOperations) {
      const applied = await operation.run()
      if (!applied) {
        failedOperations.push(operation)
        continue
      }

      appliedCount += 1
    }

    draftPreviewState.restorePendingOperations(failedOperations)

    activeRedactionTermId.value = null
    syncRedactionSidebar(workspace.peek(), true)

    if (appliedCount > 0) {
      appendSummary(`Saved ${appliedCount} redaction term edit${appliedCount === 1 ? '' : 's'}.`)
    }
  } finally {
    saveRedactionEditsInFlight = false
    draftPreviewState.setSaveInFlight(false)
  }
}

async function handleFindAndRedact() {
  const term = redactionTermInput.value.trim()
  const state = workspace.peek()
  if (!term || state.processingInFlight || saveRedactionEditsInFlight || state.filePreviews.length === 0) {
    return
  }

  queuePendingRedactionOperation(createFindAndRedactOperation(term))
  liveFindTerm.value = ''
  redactionTermInput.value = ''
}

function createFindAndRedactOperation(term) {
  return {
    queuedMessage: `Queued find and redact for "${term}". Press Save to apply it.`,
    draftEffect: {
      kind: 'find-and-redact-term',
      term
    },
    run: async () => {
      try {
        const result = await invoke('find_and_redact_term', {
          request: {
            term,
            targets: allPreviewRequests()
          }
        })
        workspaceProcessingController.rememberSavedRedactionTerm(term)
        replacePreviewStates(result.updates ?? [])
        appendSummary(
          `Find and redact applied \"${term}\" across ${result.updatedTargets ?? 0} file(s). `
          + `${result.unchangedTargets ?? 0} file(s) already matched.`
        )
        if (redactionTermInput.value.trim() === term) {
          redactionTermInput.value = ''
        }
        return true
      } catch (error) {
        appendSummary(`Find and redact error: ${String(error)}`)
        return false
      }
    }
  }
}

async function deleteRedactionTerm(term) {
  return deleteRedactionTermById(null, term)
}

async function deleteRedactionTermById(termId, term) {
  try {
    const result = await invoke('remove_redaction_term', {
      request: {
        term,
        targets: allPreviewRequests()
      }
    })
    workspaceProcessingController.forgetSavedRedactionTerm(termId, term)
    replacePreviewStates(result.updates ?? [])
    appendSummary(
      `Deleted redaction term "${term}" from ${result.updatedTargets ?? 0} file(s). `
      + `${result.unchangedTargets ?? 0} file(s) had nothing to remove.`
    )
    return true
  } catch (error) {
    appendSummary(`Delete redaction term error: ${String(error)}`)
    return false
  }
}

async function replaceRedactionTerm(previousTerm, nextTerm, { quiet = false, termId = null } = {}) {
  try {
    const result = await invoke('replace_redaction_term', {
      request: {
        previousTerm,
        nextTerm,
        targets: allPreviewRequests()
      }
    })
    const updatedTargets = result.updatedTargets ?? 0
    const unchangedTargets = result.unchangedTargets ?? 0
    replacePreviewStates(result.updates ?? [])

    if (updatedTargets === 0) {
      if (!quiet) {
        appendSummary(
          `Could not replace redaction term "${previousTerm}" with "${nextTerm}". `
          + 'The edited text no longer matches an anchored source span.'
        )
      }
      return false
    }

    workspaceProcessingController.replaceSavedRedactionTerm(termId, previousTerm, nextTerm)

    if (!quiet) {
      appendSummary(
        `Replaced redaction term "${previousTerm}" with "${nextTerm}". `
        + `Updated ${updatedTargets} file(s). ${unchangedTargets} file(s) were unchanged.`
      )
    }
    return true
  } catch (error) {
    appendSummary(`${quiet ? 'Save pending redaction edits' : 'Save redaction term'} error: ${String(error)}`)
    return false
  }
}

function recordDebugEvent(type, detail) {
  if (!(window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
    return
  }

  debugEvents.push({ type, at: performance.now(), detail })
  if (debugEvents.length > 200) {
    debugEvents.shift()
  }
}

function fileListItem(primary, badge, secondary) {
  const item = document.createElement('li')
  const primaryText = document.createElement('span')
  primaryText.className = 'file-primary'
  primaryText.textContent = primary
  item.appendChild(primaryText)

  if (badge) {
    const badgeText = document.createElement('span')
    badgeText.className = `status-badge status-${badge.replaceAll('_', '-')}`
    badgeText.textContent = badge.replaceAll('_', ' ')
    item.appendChild(badgeText)
  }

  if (secondary) {
    const secondaryText = document.createElement('span')
    secondaryText.className = 'file-secondary'
    secondaryText.textContent = secondary
    item.appendChild(secondaryText)
  }

  return item
}

function getPreviewByPath(path) {
  return workspace.peek().filePreviews.find((preview) => (preview.path ?? '') === path) ?? null
}

function applyHighlightVisibility(state) {
  previewPanel.classList.toggle('highlights-hidden', !state.highlightsVisible)
  toggleHighlights.textContent = state.highlightsVisible ? 'Hide highlights' : 'Show highlights'
}

function renderPreview(preview) {
  if (!preview) {
    previewPanel.hidden = false
    previewInteractions.hidePreviewActionTooltip()
    previewHighlightCount.textContent = '0 highlighted spans'
    previewPanel.classList.remove('large-preview-scroll')
    previewNote.hidden = true
    previewNote.textContent = ''
    hideOcrImageReview()
    beforePreview.textContent = 'Original content preview will appear here.'
    afterPreview.textContent = 'Redacted output preview will appear here.'
    lastRenderedBeforeHtml = null
    lastRenderedAfterHtml = null
    beforePreview.scrollTop = 0
    afterPreview.scrollTop = 0
    return
  }

  previewInteractions.hidePreviewActionTooltip()
  previewTitle.textContent = preview.path ?? ''
  const note = buildReviewNotice(preview.review)
  const liveTerm = liveFindTerm.value
  const beforeHtml = applyLiveFindHighlight(draftPreviewState.draftBeforeHtml.value, liveTerm)
  const afterHtml = applyLiveFindHighlight(draftPreviewState.draftAfterHtml.value, liveTerm)
  const largePreviewScroll = isLargePreviewForScroll(preview, beforeHtml, afterHtml)
  const previewDeferredNote = draftPreviewState.livePreviewDeferred.value
    ? 'Showing a focused first-match preview for this large file while editing current terms. Save applies the textbox change across the document.'
    : null
  const scrollPerformanceNote = largePreviewScroll
    ? 'Synced preview scrolling is paused for this large file to keep scrolling responsive.'
    : null

  previewPanel.classList.toggle('large-preview-scroll', largePreviewScroll)
  renderOcrImageReview(preview)
  previewNote.hidden = !(note || previewDeferredNote || scrollPerformanceNote)
  previewNote.textContent = [note, previewDeferredNote, scrollPerformanceNote].filter(Boolean).join(' ')
  if (beforeHtml !== lastRenderedBeforeHtml) {
    beforePreview.innerHTML = beforeHtml
    lastRenderedBeforeHtml = beforeHtml
  }
  if (afterHtml !== lastRenderedAfterHtml) {
    afterPreview.innerHTML = afterHtml
    lastRenderedAfterHtml = afterHtml
  }
  previewHighlightCount.textContent = `${draftPreviewState.draftHighlightCount.value} highlighted spans`
}

function renderOcrImageReview(preview) {
  const sourcePath = imageOcrSourcePath(preview)
  if (!sourcePath) {
    hideOcrImageReview()
    return
  }

  if (ocrEditorPreviewPath !== null && ocrEditorPreviewPath !== (preview.path ?? null)) {
    closeOcrTextCorrection()
  }

  const loadToken = ++ocrImageLoadToken
  ocrImageError.hidden = true
  ocrImageError.textContent = ''
  ocrSourceImage.removeAttribute('src')
  ocrSourceImage.alt = `Original image used for OCR: ${preview.path ?? sourcePath}`
  ocrImageReview.hidden = false
  void loadOcrSourceImage(preview, loadToken)
}

function hideOcrImageReview() {
  ocrImageLoadToken += 1
  closeOcrTextCorrection()
  ocrImageReview.hidden = true
  ocrImageError.hidden = true
  ocrImageError.textContent = ''
  ocrSourceImage.removeAttribute('src')
  ocrSourceImage.alt = 'Original image used for OCR'
}

async function loadOcrSourceImage(preview, loadToken) {
  try {
    const result = await invoke('load_ocr_source_image', {
      request: {
        preview: toPreviewRequest(preview)
      }
    })
    if (loadToken !== ocrImageLoadToken) {
      return
    }
    ocrSourceImage.src = result.dataUrl ?? ''
    if (result.path) {
      ocrSourceImage.alt = `Original image used for OCR: ${result.path}`
    }
  } catch (error) {
    if (loadToken !== ocrImageLoadToken) {
      return
    }
    ocrImageError.textContent = `Original image preview unavailable: ${String(error)}`
    ocrImageError.hidden = false
  }
}

function startOcrTextCorrection() {
  const preview = getCurrentPreview()
  if (!preview || !imageOcrSourcePath(preview)) {
    return
  }
  if (draftPreviewState.hasPendingChanges.value) {
    appendSummary('Save pending redaction edits before correcting OCR text.')
    return
  }

  ocrEditorPreviewPath = preview.path ?? null
  ocrCorrectedText.value = preview.originalText ?? ''
  ocrTextEditor.hidden = false
  ocrCorrectedText.focus()
}

function closeOcrTextCorrection() {
  ocrEditorPreviewPath = null
  ocrCorrectedText.value = ''
  ocrTextEditor.hidden = true
}

async function saveOcrTextCorrection() {
  const preview = getCurrentPreview()
  if (!preview || !imageOcrSourcePath(preview) || saveOcrTextInFlight) {
    return
  }

  const correctedText = ocrCorrectedText.value.trimEnd()
  if (!correctedText.trim()) {
    appendSummary('Corrected OCR text cannot be empty.')
    return
  }

  saveOcrTextInFlight = true
  saveOcrText.disabled = true
  editOcrText.disabled = true
  try {
    const result = await invoke('correct_ocr_text', {
      request: {
        preview: toPreviewRequest(preview),
        correctedText
      }
    })
    replacePreviewState(result.preview, result.replacements ?? 0)
    closeOcrTextCorrection()
    appendSummary(`Saved corrected OCR text for ${preview.path ?? 'selected file'} and rebuilt redactions.`)
  } catch (error) {
    appendSummary(`Correct OCR text error: ${String(error)}`)
  } finally {
    saveOcrTextInFlight = false
  }
}

function isLargePreviewForScroll(preview, beforeHtml, afterHtml) {
  const originalLength = typeof preview?.originalText === 'string' ? preview.originalText.length : 0
  return originalLength > LARGE_PREVIEW_SCROLL_SYNC_TEXT_LIMIT
    || beforeHtml.length + afterHtml.length > LARGE_PREVIEW_SCROLL_SYNC_HTML_LIMIT
}

function applyLiveFindHighlight(html, term) {
  const normalizedTerm = typeof term === 'string' ? term.trim() : ''
  if (!normalizedTerm) {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html
  const textNodes = []
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !literalCaseInsensitiveMatcher(normalizedTerm).test(node.nodeValue)) {
        return NodeFilter.FILTER_REJECT
      }

      if (node.parentElement?.closest('.pending-redaction-highlight')) {
        return NodeFilter.FILTER_REJECT
      }

      return NodeFilter.FILTER_ACCEPT
    }
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    textNodes.push(node)
  }

  for (const textNode of textNodes) {
    highlightLiveFindTextNode(textNode, normalizedTerm)
  }

  return template.innerHTML
}

function highlightLiveFindTextNode(textNode, term) {
  const text = textNode.nodeValue ?? ''
  const matcher = literalCaseInsensitiveMatcher(term)
  const fragment = document.createDocumentFragment()
  let cursor = 0

  for (const match of text.matchAll(matcher)) {
    const matchedText = match[0] ?? ''
    const start = match.index ?? 0
    const end = start + matchedText.length
    if (start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, start)))
    }

    const highlight = document.createElement('span')
    highlight.className = 'pending-redaction-highlight'
    highlight.textContent = matchedText
    fragment.append(highlight)
    cursor = end
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)))
  }

  textNode.replaceWith(fragment)
}

function literalCaseInsensitiveMatcher(term) {
  return new RegExp(escapeRegex(term), 'giu')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function schedulePreviewScrollSync(source, target) {
  if (suppressPreviewScrollSync) {
    return
  }

  if (previewPanel.classList.contains('large-preview-scroll')) {
    return
  }

  if (previewScrollSyncFrame) {
    cancelAnimationFrame(previewScrollSyncFrame)
  }

  previewScrollSyncFrame = requestAnimationFrame(() => {
    const sourceMax = Math.max(source.scrollHeight - source.clientHeight, 0)
    const targetMax = Math.max(target.scrollHeight - target.clientHeight, 0)
    const ratio = sourceMax > 0 ? source.scrollTop / sourceMax : 0
    const nextTargetScrollTop = ratio * targetMax

    if (Math.abs(target.scrollTop - nextTargetScrollTop) < 1) {
      previewScrollSyncFrame = null
      return
    }

    suppressPreviewScrollSync = true
    target.scrollTop = nextTargetScrollTop
    requestAnimationFrame(() => {
      suppressPreviewScrollSync = false
    })
    previewScrollSyncFrame = null
  })
}

function renderResultFiles(state) {
  const statuses = state.fileStatuses
  resultFiles.replaceChildren()

  if (statuses.length === 0) {
    resultsPanel.hidden = false
    resultFiles.appendChild(fileListItem('No processed files yet.'))
    return
  }

  for (const [index, status] of statuses.entries()) {
    const path = status.path ?? ''
    const draftStatus = draftPreviewState.draftStatusByPath(path)
    const kind = status.status ?? 'unknown'
    const replacements = draftStatus?.replacements ?? status.replacements ?? 0
    const reviewSensitive = status.reviewSensitive ?? false
    const omissions = status.nonTextOmissionsDetected ?? false
    const degraded = status.textDegradedDetected ?? false
    const structuralLoss = status.structuralLossSuspected ?? false
    const lowConfidence = status.lowConfidenceReviewRequired ?? false
    const provenance = status.extractionProvenance ?? ''
    const outputPath = status.outputPath ?? ''

    const details = getFileReviewLabel({
      status: kind,
      replacements,
      reviewSensitive,
      nonTextOmissionsDetected: omissions,
      textDegradedDetected: degraded,
      structuralLossSuspected: structuralLoss,
      lowConfidenceReviewRequired: lowConfidence,
      extractionProvenance: provenance,
      outputPath
    })

    const preview = getPreviewByPath(path)
    const item = fileListItem(
      path,
      kind,
      draftStatus?.hasDraftChanges
        ? `${details} • ${replacements} redactions • Draft changes pending`
        : `${details} • ${replacements} redactions`
    )

    if (preview) {
      item.classList.add('preview-selectable')
      item.addEventListener('click', () => {
        workspace.value = selectPreviewPath(workspace.peek(), preview.path ?? null)
      })
      if ((preview.path ?? '') === state.selectedPreviewPath || (index === 0 && !state.selectedPreviewPath)) {
        item.classList.add('preview-selected')
      }
    }
    resultFiles.appendChild(item)
  }
}

function getCurrentPreview() {
  return getSelectedPreview(workspace.peek())
}

function toPreviewRequest(preview) {
  return {
    path: preview.path,
    inputPath: preview.inputPath ?? preview.input_path,
    outputPath: preview.outputPath ?? preview.output_path,
    auditOutputPath: preview.auditOutputPath ?? preview.audit_output_path
  }
}

function replacePreviewState(updatedPreview, replacements) {
  workspace.value = replacePreviewArtifacts(workspace.peek(), updatedPreview, replacements)
}

function replacePreviewStates(updates) {
  for (const update of updates) {
    workspace.value = replacePreviewArtifacts(workspace.peek(), update.preview, update.replacements)
  }
}

function allPreviewRequests() {
  return workspace.peek().filePreviews.map((preview) => toPreviewRequest(preview))
}

function appendSummary(message) {
  workspace.value = {
    ...workspace.peek(),
    summary: `${message}\n\n${workspace.peek().summary}`
  }
}

function rememberSelectionIntent() {
  recentSelectionIntentUntil = performance.now() + 80
}

function clearRecentSelectionIntent() {
  recentSelectionIntentUntil = 0
}

function hasRecentSelectionIntent() {
  return performance.now() < recentSelectionIntentUntil
}

function buildCrossFileDraftEffect(kind, preview, redactionIdentity) {
  const originalText = preview?.originalText ?? ''
  const matchedText = typeof originalText === 'string'
    ? sliceUtf8Bytes(originalText, redactionIdentity.start, redactionIdentity.end)
    : ''

  return {
    kind,
    matchedText,
    replacement: redactionIdentity.replacement,
    label: redactionIdentity.replacement
  }
}

findAndRedactButton.addEventListener('click', handleFindAndRedact)
saveRedactionEditsButton.addEventListener('click', savePendingRedactionEdits)
redactionTermInput.addEventListener('input', () => {
  liveFindTerm.value = redactionTermInput.value
})
redactionTermInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    await handleFindAndRedact()
  }
})

openOutput.addEventListener('click', async () => {
  try {
    await invoke('open_last_output_path')
  } catch (error) {
    appendSummary(`Open output error: ${String(error)}`)
  }
})

openAudit.addEventListener('click', async () => {
  try {
    await invoke('open_last_audit_output_path')
  } catch (error) {
    appendSummary(`Open audit error: ${String(error)}`)
  }
})
