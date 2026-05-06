import './styles.css'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
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
  setConfigPath,
  setSelectedInput,
  startProcessing,
  toggleWorkspaceHighlights
} from './workspace-state.js'

const inputPath = document.getElementById('inputPath')
const pickInput = document.getElementById('pickInput')
const pickFolder = document.getElementById('pickFolder')
const configPath = document.getElementById('configPath')
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
const previewActionButton = document.getElementById('previewActionButton')
const summary = document.getElementById('summary')
const openOutput = document.getElementById('openOutput')

let workspace = createWorkspaceState(
  'Desktop shell loaded. Choose a file or folder to start local processing automatically.'
)
let pendingPreviewAction = null

renderWorkspace()

toggleHighlights.addEventListener('click', () => {
  workspace = toggleWorkspaceHighlights(workspace)
  applyHighlightVisibility()
})

function setResultActionsEnabled(outputEnabled) {
  openOutput.disabled = !outputEnabled
}

function setInputControlsEnabled(enabled) {
  pickInput.disabled = !enabled
  pickFolder.disabled = !enabled
  configPath.disabled = !enabled
}

function renderWorkspace() {
  renderSelectedInput()
  renderResultFiles()
  renderSelectedFileStrip()
  renderPreview(getSelectedPreview(workspace))
  summary.textContent = workspace.summary
  setResultActionsEnabled(workspace.outputAvailable)
  setInputControlsEnabled(!workspace.processingInFlight)
  applyHighlightVisibility()
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
  summary.textContent = `Opening ${label} picker...`

  try {
    const selected = await open({
      directory,
      multiple: false
    })

    if (typeof selected === 'string') {
      workspace = setSelectedInput(workspace, selected)
      await processSelectedInput({ sourceLabel: label })
    } else {
      workspace = { ...workspace, summary: `${capitalize(label)} selection cancelled.` }
      renderWorkspace()
    }
  } catch (error) {
    workspace = { ...workspace, summary: `${capitalize(label)} picker error: ${String(error)}` }
    renderWorkspace()
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function renderSelectedInput() {
  inputPath.value = workspace.inputPath.trim()
}

async function processSelectedInput({ sourceLabel }) {
  const value = workspace.inputPath.trim()
  if (!value || workspace.processingInFlight) {
    return
  }

  workspace = startProcessing(workspace, `Processing selected ${sourceLabel}...`)
  renderWorkspace()

  try {
    const result = await invoke('run_replace_job', {
      input: value,
      config: configPath.value || null,
      includePatterns: [],
      excludePatterns: []
    })

    const replacements = result.replacements
    const nonTextOmissionsDetected = result.nonTextOmissionsDetected
    const reviewSummary = result.reviewSummary ?? ''
    const coverageNote = result.coverageNote ?? ''
    const outputPath = result.outputPath ?? ''
    const fileStatuses = result.fileStatuses ?? []
    const filePreviews = result.filePreviews ?? []

    const nextSummary = [
      `mode: live review (processed automatically after ${sourceLabel} selection)`,
      `replacements: ${replacements}`,
      `non-text omissions detected: ${nonTextOmissionsDetected}`,
      `output path: ${outputPath}`,
      'audit log: disabled',
      '',
      reviewSummary,
      '',
      `note: ${coverageNote}`
    ].join('\n')

    workspace = finishProcessing(workspace, {
      summary: nextSummary,
      fileStatuses,
      filePreviews,
      outputPath
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

    const item = fileListItem(path, kind, details)
    const previewIndex = workspace.filePreviews.findIndex((preview) => (preview.path ?? '') === path)
    if (previewIndex >= 0) {
      item.classList.add('preview-selectable')
      item.addEventListener('click', () => selectPreview(item, workspace.filePreviews[previewIndex]))
      if ((workspace.filePreviews[previewIndex].path ?? '') === workspace.selectedPreviewPath || (index === 0 && !workspace.selectedPreviewPath)) {
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

function isPreviewEditable(preview) {
  return Boolean(preview?.editingEnabled)
}

function replacePreviewState(updatedPreview, replacements) {
  workspace = replacePreviewArtifacts(workspace, updatedPreview, replacements)
  renderWorkspace()
}

function appendSummary(message) {
  summary.textContent = `${message}\n\n${summary.textContent}`
}

function targetElement(target) {
  return target instanceof Element ? target : target?.parentElement ?? null
}

function hidePreviewActionTooltip() {
  pendingPreviewAction = null
  previewActionTooltip.hidden = true
}

function showPreviewActionTooltip({ x, y, label, buttonText, action }) {
  pendingPreviewAction = action
  previewActionLabel.textContent = label
  previewActionButton.textContent = buttonText
  previewActionTooltip.hidden = false

  const tooltipWidth = 220
  const viewportPadding = 12
  const clampedLeft = Math.min(
    Math.max(x, viewportPadding),
    window.innerWidth - tooltipWidth - viewportPadding
  )
  const top = Math.max(y, viewportPadding)

  previewActionTooltip.style.left = `${clampedLeft}px`
  previewActionTooltip.style.top = `${top}px`
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
      rect: range.getBoundingClientRect()
    }
  }

  return null
}

async function handleRedactionRemoval(markElement) {
  const preview = getCurrentPreview()
  if (!preview || !isPreviewEditable(preview)) {
    return
  }

  const rect = markElement.getBoundingClientRect()
  showPreviewActionTooltip({
    x: rect.left,
    y: rect.bottom + 8,
    label: 'Remove this redaction and save the change to the output and audit files.',
    buttonText: 'Remove redaction',
    action: async () => {
      try {
        const result = await invoke('remove_redaction', {
          request: {
            ...toPreviewRequest(preview),
            start: Number(markElement.dataset.recordStart ?? 0),
            end: Number(markElement.dataset.recordEnd ?? 0),
            replacement: markElement.dataset.recordReplacement ?? ''
          }
        })
        replacePreviewState(result.preview, result.replacements)
        appendSummary('Removed selected redaction and updated output files.')
      } catch (error) {
        appendSummary(`Remove redaction error: ${String(error)}`)
      }
    }
  })
}

function maybeShowAddRedactionTooltip() {
  const preview = getCurrentPreview()
  if (!preview || !isPreviewEditable(preview)) {
    hidePreviewActionTooltip()
    return
  }

  const selection = selectionWithinPreview()
  if (!selection) {
    hidePreviewActionTooltip()
    return
  }

  const rect = selection.rect
  showPreviewActionTooltip({
    x: rect.left,
    y: rect.bottom + 8,
    label: 'Add a manual redaction for the selected text and save it to the output and audit files.',
    buttonText: 'Redact selection',
    action: async () => {
      try {
        const result = await invoke('add_manual_redaction', {
          request: {
            ...toPreviewRequest(preview),
            sourcePreview: selection.sourcePreview,
            selectionStart: selection.selectionStart,
            selectionEnd: selection.selectionEnd
          }
        })
        window.getSelection()?.removeAllRanges()
        replacePreviewState(result.preview, result.replacements)
        appendSummary('Added manual redaction and updated output files.')
      } catch (error) {
        appendSummary(`Add redaction error: ${String(error)}`)
      }
    }
  })
}

beforePreview.addEventListener('click', async (event) => {
  const mark = targetElement(event.target)?.closest('mark[data-record-start]')
  if (mark) {
    event.preventDefault()
    await handleRedactionRemoval(mark)
    return
  }
  maybeShowAddRedactionTooltip()
})

afterPreview.addEventListener('click', async (event) => {
  const mark = targetElement(event.target)?.closest('mark[data-record-start]')
  if (mark) {
    event.preventDefault()
    await handleRedactionRemoval(mark)
    return
  }
  maybeShowAddRedactionTooltip()
})

beforePreview.addEventListener('mouseup', (event) => {
  if (targetElement(event.target)?.closest('mark[data-record-start]')) {
    return
  }
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

afterPreview.addEventListener('mouseup', (event) => {
  if (targetElement(event.target)?.closest('mark[data-record-start]')) {
    return
  }
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

beforePreview.addEventListener('keyup', () => {
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

afterPreview.addEventListener('keyup', () => {
  setTimeout(maybeShowAddRedactionTooltip, 0)
})

previewActionButton.addEventListener('click', async () => {
  if (!pendingPreviewAction) {
    return
  }

  const action = pendingPreviewAction
  hidePreviewActionTooltip()
  await action()
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

configPath.addEventListener('change', async () => {
  workspace = setConfigPath(workspace, configPath.value)

  if (!workspace.inputPath.trim()) {
    return
  }

  await processSelectedInput({ sourceLabel: 'config' })
})

openOutput.addEventListener('click', async () => {
  try {
    await invoke('open_last_output_path')
  } catch (error) {
    summary.textContent = `Open output error: ${String(error)}\n\n${summary.textContent}`
  }
})
