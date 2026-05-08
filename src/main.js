import './styles.css'
import { effect } from '@preact/signals-core'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  createRedactionSidebarState
} from './redaction-sidebar-state.js'
import { buildReviewNotice } from './review-notice.js'
import {
  createWorkspaceState,
  failProcessing,
  finishProcessing,
  getFileReviewLabel,
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

let workspace = createWorkspaceState(
  'Desktop shell loaded. Choose a file or folder to start local processing automatically.'
)
const redactionSidebar = createRedactionSidebarState()
let pendingPreviewActions = null
let previewActionHideTimer = null
let previewScrollSyncFrame = null
let suppressPreviewScrollSync = false
let previewActionInFlight = false
let recentSelectionIntentUntil = 0
let lastSidebarPreviewSet = null
let activeRedactionTermId = null
const liveRedactionTimers = new Map()
const LIVE_REDACTION_DEBOUNCE_MS = 200

renderWorkspace()

effect(() => {
  renderRelatedRedactionSuggestions(redactionSidebar.relatedSuggestions.value)
})

if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  window.__tnsDesktopDebug = {
    setWorkspaceFixture(nextWorkspace) {
      workspace = {
        ...workspace,
        ...nextWorkspace
      }
      renderWorkspace()
    },
    selectionWithinPreview() {
      return selectionWithinPreview()
    },
    showSelectionTooltip() {
      maybeShowAddRedactionTooltip()
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
    }
  }
}

toggleHighlights.addEventListener('click', () => {
  workspace = toggleWorkspaceHighlights(workspace)
  applyHighlightVisibility()
})

function setResultActionsEnabled(enabled) {
  openOutput.disabled = !enabled
  openAudit.disabled = !enabled
}

function setInputControlsEnabled(enabled) {
  pickInput.disabled = !enabled
  pickFolder.disabled = !enabled
  const hasPreviews = workspace.filePreviews.length > 0
  findAndRedactButton.disabled = !enabled || !hasPreviews
  redactionTermInput.disabled = !enabled || !hasPreviews
}

function renderWorkspace() {
  syncRedactionSidebar()
  renderSelectedInput()
  if (activeRedactionTermId === null) {
    renderRedactionTermsPanel(redactionSidebar.sourceTerms.peek())
  }
  renderResultFiles()
  renderSelectedFileStrip()
  renderPreview(getSelectedPreview(workspace))
  renderLoadingOverlay()
  summary.textContent = workspace.summary
  setResultActionsEnabled(workspace.artifactsAvailable)
  setInputControlsEnabled(!workspace.processingInFlight)
  applyHighlightVisibility()
}

function syncRedactionSidebar(force = false) {
  if (!force && (activeRedactionTermId !== null || workspace.filePreviews === lastSidebarPreviewSet)) {
    return
  }

  redactionSidebar.syncFromPreviews(workspace.filePreviews)
  lastSidebarPreviewSet = workspace.filePreviews
}

function renderLoadingOverlay() {
  if (!workspace.processingInFlight) {
    loadingOverlay.hidden = true
    return
  }

  loadingTitle.textContent = workspace.inputPath.trim()
    ? 'Preparing review workspace…'
    : 'Processing selection…'
  loadingMessage.textContent = workspace.summary || 'Loading selected files and building previews.'
  loadingOverlay.hidden = false
}

function renderRedactionTermsPanel(terms) {
  redactionTermsList.replaceChildren()
  if (terms.length === 0) {
    redactionTermsList.appendChild(createTagListItem('No redaction terms yet. Select text or use find and redact.'))
  } else {
    for (const term of terms) {
      redactionTermsList.appendChild(createEditableTermListItem(term))
    }
  }
}

function renderRelatedRedactionSuggestions(suggestions) {
  relatedRedactionTerms.replaceChildren()
  if (suggestions.length === 0) {
    relatedRedactionTerms.appendChild(createTermChipPlaceholder('No related suggestions yet.'))
    return
  }

  for (const suggestion of suggestions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'term-chip secondary-button'
    button.textContent = suggestion
    button.addEventListener('click', async () => {
      redactionTermInput.value = suggestion
      await handleFindAndRedact()
    })
    relatedRedactionTerms.appendChild(button)
  }
}

function renderSelectedFileStrip() {
  const selectedStatus = getSelectedFileStatus(workspace)
  const reviewLabel = getFileReviewLabel(selectedStatus)
  previewTitle.textContent = selectedStatus?.path ?? 'No file selected'
  selectedFileCount.textContent = `${selectedStatus?.replacements ?? 0} redactions`
  selectedFileStatus.textContent = reviewLabel
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
  workspace = {
    ...workspace,
    processingInFlight: true,
    summary: `Opening ${label} picker...`
  }
  renderWorkspace()
  await nextPaint()

  try {
    const selected = await open({
      directory,
      multiple: false
    })

    if (typeof selected === 'string') {
      workspace = {
        ...setSelectedInput(workspace, selected),
        processingInFlight: false
      }
      await processSelectedInput({ sourceLabel: label })
    } else {
      workspace = {
        ...workspace,
        processingInFlight: false,
        summary: `${capitalize(label)} selection cancelled.`
      }
      renderWorkspace()
    }
  } catch (error) {
    workspace = {
      ...workspace,
      processingInFlight: false,
      summary: `${capitalize(label)} picker error: ${String(error)}`
    }
    renderWorkspace()
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

function renderSelectedInput() {
  inputPath.value = workspace.inputPath.trim()
}

function createTagListItem(text) {
  const item = document.createElement('li')
  item.className = 'term-list-item'
  item.textContent = text
  return item
}

function createEditableTermListItem(term) {
  const item = document.createElement('li')
  item.className = 'term-list-item term-list-item-row'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'term-list-input'
  input.value = term.matchedText
  input.setAttribute('aria-label', `Redaction term ${term.matchedText}`)
  input.title = `${term.occurrences} occurrence${term.occurrences === 1 ? '' : 's'}`
  item.appendChild(input)

  const actions = document.createElement('div')
  actions.className = 'term-list-actions'

  const flushEdit = async () => {
    clearLiveRedactionTimer(term.id)
    await applyLiveRedactionEdit(term.id)
    activeRedactionTermId = null
    syncRedactionSidebar(true)
    renderRedactionTermsPanel(redactionSidebar.sourceTerms.peek())
  }

  input.addEventListener('focus', () => {
    activeRedactionTermId = term.id
  })

  input.addEventListener('input', () => {
    redactionSidebar.setDraft(term.id, input.value)
    scheduleLiveRedactionEdit(term.id)
  })
  input.addEventListener('blur', () => {
    void flushEdit()
  })
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      input.blur()
      return
    }

    if (event.key === 'Escape') {
      const committedTerm = redactionSidebar.committedValueFor(term.id)
      redactionSidebar.resetDraft(term.id)
      input.value = committedTerm
      clearLiveRedactionTimer(term.id)
      input.blur()
    }
  })

  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'secondary-button term-list-action'
  deleteButton.textContent = '×'
  deleteButton.setAttribute('aria-label', `Delete redaction term ${term.matchedText}`)
  deleteButton.title = `Delete ${term.matchedText}`
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Remove redaction term "${term.matchedText}" everywhere in this workspace?`)) {
      return
    }

    activeRedactionTermId = null
    clearLiveRedactionTimer(term.id)
    await deleteRedactionTerm(term.matchedText)
  })

  actions.append(deleteButton)
  item.appendChild(actions)
  return item
}

function clearLiveRedactionTimer(termId) {
  const timer = liveRedactionTimers.get(termId)
  if (timer) {
    clearTimeout(timer)
    liveRedactionTimers.delete(termId)
  }
}

function scheduleLiveRedactionEdit(termId) {
  clearLiveRedactionTimer(termId)
  liveRedactionTimers.set(termId, setTimeout(() => {
    liveRedactionTimers.delete(termId)
    void applyLiveRedactionEdit(termId)
  }, LIVE_REDACTION_DEBOUNCE_MS))
}

async function applyLiveRedactionEdit(termId) {
  const nextTerm = redactionSidebar.draftValueFor(termId).trim()
  const committedTerm = redactionSidebar.committedValueFor(termId)

  if (!nextTerm || nextTerm === committedTerm || workspace.processingInFlight || workspace.filePreviews.length === 0) {
    return
  }

  const applied = await replaceRedactionTerm(committedTerm, nextTerm, { quiet: true })
  if (!applied) {
    return
  }

  redactionSidebar.applyCommittedValue(termId, nextTerm)

  if (redactionSidebar.draftValueFor(termId).trim() !== nextTerm) {
    scheduleLiveRedactionEdit(termId)
  }
}

function createTermChipPlaceholder(text) {
  const placeholder = document.createElement('span')
  placeholder.className = 'term-list-item'
  placeholder.textContent = text
  return placeholder
}

async function handleFindAndRedact() {
  const term = redactionTermInput.value.trim()
  if (!term || workspace.processingInFlight || workspace.filePreviews.length === 0) {
    return
  }

  try {
    const result = await invoke('find_and_redact_term', {
      request: {
        term,
        targets: allPreviewRequests()
      }
    })
    replacePreviewStates(result.updates ?? [])
    redactionTermInput.value = ''
    appendSummary(
      `Find and redact applied \"${term}\" across ${result.updatedTargets ?? 0} file(s). `
      + `${result.unchangedTargets ?? 0} file(s) already matched.`
    )
  } catch (error) {
    appendSummary(`Find and redact error: ${String(error)}`)
  }
}

async function deleteRedactionTerm(term) {
  try {
    const result = await invoke('remove_redaction_term', {
      request: {
        term,
        targets: allPreviewRequests()
      }
    })
    replacePreviewStates(result.updates ?? [])
    appendSummary(
      `Deleted redaction term "${term}" from ${result.updatedTargets ?? 0} file(s). `
      + `${result.unchangedTargets ?? 0} file(s) had nothing to remove.`
    )
  } catch (error) {
    appendSummary(`Delete redaction term error: ${String(error)}`)
  }
}

async function replaceRedactionTerm(previousTerm, nextTerm, { quiet = false } = {}) {
  try {
    const removed = await invoke('remove_redaction_term', {
      request: {
        term: previousTerm,
        targets: allPreviewRequests()
      }
    })
    replacePreviewStates(removed.updates ?? [])

    const added = await invoke('find_and_redact_term', {
      request: {
        term: nextTerm,
        targets: allPreviewRequests()
      }
    })
    replacePreviewStates(added.updates ?? [])

    if (!quiet) {
      appendSummary(
        `Replaced redaction term "${previousTerm}" with "${nextTerm}". `
        + `Removed from ${removed.updatedTargets ?? 0} file(s), added to ${added.updatedTargets ?? 0} file(s).`
      )
    }
    return true
  } catch (error) {
    appendSummary(`${quiet ? 'Live edit' : 'Edit'} redaction term error: ${String(error)}`)
    return false
  }
}

async function processSelectedInput({ sourceLabel }) {
  const value = workspace.inputPath.trim()
  if (!value || workspace.processingInFlight) {
    return
  }

  workspace = startProcessing(workspace, `Processing selected ${sourceLabel}...`)
  renderWorkspace()
  await nextPaint()

  try {
    const result = await invoke('run_replace_job', {
      input: value,
      config: null,
      settings: null,
      includePatterns: [],
      excludePatterns: []
    })

    const replacements = result.replacements
    const nonTextOmissionsDetected = result.nonTextOmissionsDetected
    const reviewSummary = result.reviewSummary ?? ''
    const coverageNote = result.coverageNote ?? ''
    const outputPath = result.outputPath ?? ''
    const auditOutputPath = result.auditOutputPath ?? ''
    const fileStatuses = result.fileStatuses ?? []
    const filePreviews = result.filePreviews ?? []

    const nextSummary = [
      `mode: live review (processed automatically after ${sourceLabel} selection)`,
      `replacements: ${replacements}`,
      `non-text omissions detected: ${nonTextOmissionsDetected}`,
      `output path: ${outputPath}`,
      `audit path: ${auditOutputPath}`,
      '',
      reviewSummary,
      '',
      `note: ${coverageNote}`
    ].join('\n')

    workspace = finishProcessing(workspace, {
      summary: nextSummary,
      fileStatuses,
      filePreviews,
      outputPath,
      auditOutputPath
    })
  } catch (error) {
    workspace = failProcessing(workspace, `Error: ${String(error)}`)
  }

  renderWorkspace()
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
  return workspace.filePreviews.find((preview) => (preview.path ?? '') === path) ?? null
}

function countHighlights(html) {
  return (html.match(/<mark\b/g) ?? []).length
}

function applyHighlightVisibility() {
  previewPanel.classList.toggle('highlights-hidden', !workspace.highlightsVisible)
  toggleHighlights.textContent = workspace.highlightsVisible ? 'Hide highlights' : 'Show highlights'
}

function renderPreview(preview) {
  if (!preview) {
    previewPanel.hidden = false
    hidePreviewActionTooltip()
    previewHighlightCount.textContent = '0 highlighted spans'
    previewNote.hidden = true
    previewNote.textContent = ''
    beforePreview.textContent = 'Original content preview will appear here.'
    afterPreview.textContent = 'Redacted output preview will appear here.'
    beforePreview.scrollTop = 0
    afterPreview.scrollTop = 0
    return
  }

  hidePreviewActionTooltip()
  previewTitle.textContent = preview.path ?? ''
  const note = buildReviewNotice(preview.review)
  const beforeHtml = preview.originalHtml ?? 'Original preview unavailable.'
  const afterHtml = preview.redactedHtml ?? ''
  const highlightCount = countHighlights(beforeHtml) + countHighlights(afterHtml)

  previewHighlightCount.textContent = `${highlightCount} highlighted spans`
  previewNote.hidden = !note
  previewNote.textContent = note
  beforePreview.innerHTML = beforeHtml
  afterPreview.innerHTML = afterHtml
}

function schedulePreviewScrollSync(source, target) {
  if (suppressPreviewScrollSync) {
    return
  }

  if (previewScrollSyncFrame) {
    cancelAnimationFrame(previewScrollSyncFrame)
  }

  previewScrollSyncFrame = requestAnimationFrame(() => {
    const sourceMax = Math.max(source.scrollHeight - source.clientHeight, 0)
    const targetMax = Math.max(target.scrollHeight - target.clientHeight, 0)
    const ratio = sourceMax > 0 ? source.scrollTop / sourceMax : 0

    suppressPreviewScrollSync = true
    target.scrollTop = ratio * targetMax
    requestAnimationFrame(() => {
      suppressPreviewScrollSync = false
    })
    previewScrollSyncFrame = null
  })
}

function selectPreview(item, preview) {
  for (const element of resultFiles.querySelectorAll('.preview-selected')) {
    element.classList.remove('preview-selected')
  }
  item.classList.add('preview-selected')
  workspace = selectPreviewPath(workspace, preview.path ?? null)
  renderPreview(preview)
}

function renderResultFiles() {
  const statuses = workspace.fileStatuses
  resultFiles.replaceChildren()

  if (statuses.length === 0) {
    resultsPanel.hidden = false
    resultFiles.appendChild(fileListItem('No processed files yet.'))
    return
  }

  for (const [index, status] of statuses.entries()) {
    const path = status.path ?? ''
    const kind = status.status ?? 'unknown'
    const replacements = status.replacements ?? 0
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
    const item = fileListItem(path, kind, details)

    if (preview) {
      item.classList.add('preview-selectable')
      item.addEventListener('click', () => {
        workspace = selectPreviewPath(workspace, preview.path ?? null)
        renderWorkspace()
      })
      if ((preview.path ?? '') === workspace.selectedPreviewPath || (index === 0 && !workspace.selectedPreviewPath)) {
        item.classList.add('preview-selected')
      }
    }
    resultFiles.appendChild(item)
  }
}

function getCurrentPreview() {
  return getSelectedPreview(workspace)
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
  workspace = replacePreviewArtifacts(workspace, updatedPreview, replacements)
  renderWorkspace()
}

function replacePreviewStates(updates) {
  for (const update of updates) {
    workspace = replacePreviewArtifacts(workspace, update.preview, update.replacements)
  }
  renderWorkspace()
}

function allPreviewRequests() {
  return workspace.filePreviews.map((preview) => toPreviewRequest(preview))
}

function appendSummary(message) {
  summary.textContent = `${message}\n\n${summary.textContent}`
}

function targetElement(target) {
  return target instanceof Element ? target : target?.parentElement ?? null
}

function clearRedactionClass(className) {
  for (const mark of document.querySelectorAll(`.preview-text mark.${className}`)) {
    mark.classList.remove(className)
  }
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
  pendingPreviewActions = null
  clearFocusedRedactions()
  if (previewActionHideTimer) {
    clearTimeout(previewActionHideTimer)
    previewActionHideTimer = null
  }

  previewActionTooltip.dataset.state = 'closing'
  previewActionTooltip.setAttribute('aria-hidden', 'true')
  previewActionHideTimer = setTimeout(() => {
    previewActionTooltip.hidden = true
    delete previewActionTooltip.dataset.state
    previewActionHideTimer = null
  }, 180)
}

function showPreviewActionTooltip({ rect, label, actions }) {
  if (previewActionHideTimer) {
    clearTimeout(previewActionHideTimer)
    previewActionHideTimer = null
  }

  pendingPreviewActions = Array.isArray(actions) ? actions : []
  previewActionLabel.textContent = label
  previewActionButtons.replaceChildren(
    ...pendingPreviewActions.map((action, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `preview-action-button secondary-button ${action.variant ?? ''}`.trim()
      button.dataset.actionIndex = String(index)
      button.textContent = action.buttonText
      return button
    })
  )
  previewActionTooltip.hidden = false
  previewActionTooltip.setAttribute('aria-hidden', 'false')
  previewActionTooltip.dataset.state = 'opening'

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

  previewActionTooltip.dataset.placement = canPlaceAbove ? 'top' : 'bottom'
  previewActionTooltip.style.setProperty('--tooltip-arrow-left', `${arrowLeft}px`)
  previewActionTooltip.style.left = `${clampedLeft}px`
  previewActionTooltip.style.top = `${top}px`

  requestAnimationFrame(() => {
    previewActionTooltip.dataset.state = 'open'
  })
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length
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

function rememberSelectionIntent() {
  recentSelectionIntentUntil = performance.now() + 250
}

function hasRecentSelectionIntent() {
  return performance.now() < recentSelectionIntentUntil
}

async function handleRedactionRemoval(markElement) {
  if (previewActionInFlight) {
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
    start: Number(markElement.dataset.recordStart ?? 0),
    end: Number(markElement.dataset.recordEnd ?? 0),
    replacement: markElement.dataset.recordReplacement ?? ''
  }
  const request = {
    source: {
      preview: toPreviewRequest(preview),
      ...redactionIdentity
    },
    targets: allPreviewRequests()
  }
  focusMatchingRedactions({
    ...redactionIdentity
  })

  let availability
  try {
    availability = await invoke('inspect_redaction_across_files', { request })
  } catch (error) {
    appendSummary(`Inspect redaction everywhere error: ${String(error)}`)
    return
  }

  const actions = []
  if ((availability?.applicableTargets ?? 0) > 0) {
    actions.push({
      buttonText: 'Apply everywhere',
      variant: 'preview-action-button-accent',
      run: async () => {
        try {
          const result = await invoke('apply_redaction_to_all_files', { request })
          replacePreviewStates(result.updates ?? [])
          appendSummary(
            `Applied this redaction across ${result.updatedTargets ?? 0} file(s). `
            + `${result.unchangedTargets ?? 0} file(s) already matched.`
          )
        } catch (error) {
          appendSummary(`Apply redaction everywhere error: ${String(error)}`)
        }
      }
    })
  }

  if ((availability?.removableTargets ?? 0) > 0) {
    actions.push({
      buttonText: 'Remove everywhere',
      run: async () => {
        try {
          const result = await invoke('remove_redaction_from_all_files', { request })
          replacePreviewStates(result.updates ?? [])
          appendSummary(
            `Removed this redaction across ${result.updatedTargets ?? 0} file(s). `
            + `${result.unchangedTargets ?? 0} file(s) had nothing to remove.`
          )
        } catch (error) {
          appendSummary(`Remove redaction everywhere error: ${String(error)}`)
        }
      }
    })
  }

  actions.push({
    buttonText: 'Remove here',
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
      } catch (error) {
        appendSummary(`Remove redaction error: ${String(error)}`)
      }
    }
  })

  showPreviewActionTooltip({
    rect,
    label: removalLabel,
    actions
  })
}

function createManualRedactionAction(preview, selection, scope, successMessage) {
  return async () => {
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
      window.getSelection()?.removeAllRanges()
      replacePreviewState(result.preview, result.replacements)
      appendSummary(successMessage)
    } catch (error) {
      appendSummary(`Add redaction error: ${String(error)}`)
    }
  }
}

function createMergeManualRedactionAction(preview, selection) {
  return async () => {
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
      window.getSelection()?.removeAllRanges()
      replacePreviewState(result.preview, result.replacements)
      appendSummary('Merged selection into one manual redaction and updated output files.')
    } catch (error) {
      appendSummary(`Merge redaction error: ${String(error)}`)
    }
  }
}

function maybeShowAddRedactionTooltip() {
  void maybeShowAddRedactionTooltipAsync()
}

async function maybeShowAddRedactionTooltipAsync() {
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
    hidePreviewActionTooltip()
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
      : 'Redact this selected text?'
    ,
    actions
  })
}

beforePreview.addEventListener('click', async (event) => {
  if (selectionWithinPreview() || hasRecentSelectionIntent()) {
    event.preventDefault()
    setTimeout(maybeShowAddRedactionTooltip, 0)
    return
  }

  const mark = targetElement(event.target)?.closest('mark[data-record-start]')
  if (mark) {
    event.preventDefault()
    await handleRedactionRemoval(mark)
  }
})

afterPreview.addEventListener('click', async (event) => {
  if (selectionWithinPreview() || hasRecentSelectionIntent()) {
    event.preventDefault()
    setTimeout(maybeShowAddRedactionTooltip, 0)
    return
  }

  const mark = targetElement(event.target)?.closest('mark[data-record-start]')
  if (mark) {
    event.preventDefault()
    await handleRedactionRemoval(mark)
  }
})

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

beforePreview.addEventListener('mouseover', handleRedactionHover)
afterPreview.addEventListener('mouseover', handleRedactionHover)
beforePreview.addEventListener('mouseout', handleRedactionHoverLeave)
afterPreview.addEventListener('mouseout', handleRedactionHoverLeave)

beforePreview.addEventListener('mouseup', (event) => {
  if (selectionWithinPreview()) {
    rememberSelectionIntent()
  }
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

afterPreview.addEventListener('mouseup', (event) => {
  if (selectionWithinPreview()) {
    rememberSelectionIntent()
  }
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

beforePreview.addEventListener('keyup', () => {
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

afterPreview.addEventListener('keyup', () => {
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

beforePreview.addEventListener('scroll', () => {
  hidePreviewActionTooltip()
  schedulePreviewScrollSync(beforePreview, afterPreview)
})
afterPreview.addEventListener('scroll', () => {
  hidePreviewActionTooltip()
  schedulePreviewScrollSync(afterPreview, beforePreview)
})
findAndRedactButton.addEventListener('click', handleFindAndRedact)
redactionTermInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    await handleFindAndRedact()
  }
})

previewActionButtons.addEventListener('click', async (event) => {
  const button = targetElement(event.target)?.closest('button[data-action-index]')
  if (!button) {
    return
  }

  const action = pendingPreviewActions?.[Number(button.dataset.actionIndex)]?.run
  if (!action) {
    return
  }

  previewActionInFlight = true
  hidePreviewActionTooltip()
  try {
    await action()
    await nextPaint()
  } finally {
    previewActionInFlight = false
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

openOutput.addEventListener('click', async () => {
  try {
    await invoke('open_last_output_path')
  } catch (error) {
    summary.textContent = `Open output error: ${String(error)}\n\n${summary.textContent}`
  }
})

openAudit.addEventListener('click', async () => {
  try {
    await invoke('open_last_audit_output_path')
  } catch (error) {
    summary.textContent = `Open audit error: ${String(error)}\n\n${summary.textContent}`
  }
})
