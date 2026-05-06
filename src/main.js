import './styles.css'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const inputPath = document.getElementById('inputPath')
const pickInput = document.getElementById('pickInput')
const pickFolder = document.getElementById('pickFolder')
const configPath = document.getElementById('configPath')
const selectedFiles = document.getElementById('selectedFiles')
const resultsPanel = document.getElementById('resultsPanel')
const resultFiles = document.getElementById('resultFiles')
const previewPanel = document.getElementById('previewPanel')
const previewTitle = document.getElementById('previewTitle')
const previewHighlightCount = document.getElementById('previewHighlightCount')
const toggleHighlights = document.getElementById('toggleHighlights')
const previewNote = document.getElementById('previewNote')
const beforePreview = document.getElementById('beforePreview')
const afterPreview = document.getElementById('afterPreview')
const previewActionTooltip = document.getElementById('previewActionTooltip')
const previewActionLabel = document.getElementById('previewActionLabel')
const previewActionButton = document.getElementById('previewActionButton')
const summary = document.getElementById('summary')
const runReview = document.getElementById('runReview')
const runReplace = document.getElementById('runReplace')
const openOutput = document.getElementById('openOutput')
const openAudit = document.getElementById('openAudit')

summary.textContent = 'Desktop shell loaded. Choose a file or folder, then run review or replace.'
let currentFilePreviews = []
let currentFileStatuses = []
let selectedPreviewPath = null
let highlightsVisible = true
let pendingPreviewAction = null

setResultActionsEnabled(false)
renderSelectedInput()
renderPreview(null)

setHighlightVisibility(true)

toggleHighlights.addEventListener('click', () => {
  setHighlightVisibility(!highlightsVisible)
})

function setResultActionsEnabled(enabled) {
  openOutput.disabled = !enabled
  openAudit.disabled = !enabled
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
      inputPath.value = selected
      renderSelectedInput()
      summary.textContent = `Selected ${label}: ${selected}`
    } else {
      summary.textContent = `${capitalize(label)} selection cancelled.`
    }
  } catch (error) {
    summary.textContent = `${capitalize(label)} picker error: ${String(error)}`
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

inputPath.addEventListener('input', renderSelectedInput)

function renderSelectedInput() {
  const value = inputPath.value.trim()
  selectedFiles.replaceChildren()
  if (!value) {
    selectedFiles.appendChild(fileListItem('No file or folder selected yet.'))
    return
  }

  selectedFiles.appendChild(fileListItem(value, 'ready'))
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

function setHighlightVisibility(visible) {
  highlightsVisible = visible
  previewPanel.classList.toggle('highlights-hidden', !visible)
  toggleHighlights.textContent = visible ? 'Hide highlights' : 'Show highlights'
}

function renderPreview(preview) {
  if (!preview) {
    previewPanel.hidden = false
    selectedPreviewPath = null
    hidePreviewActionTooltip()
    previewTitle.textContent = 'Select a processed file to inspect its before/after preview.'
    previewHighlightCount.textContent = '0 highlighted spans'
    previewNote.hidden = true
    previewNote.textContent = ''
    beforePreview.textContent = 'Original content preview will appear here.'
    afterPreview.textContent = 'Redacted output preview will appear here.'
    return
  }

  selectedPreviewPath = preview.path ?? null
  hidePreviewActionTooltip()
  previewTitle.textContent = preview.path ?? ''
  const note = preview.previewNote ?? preview.preview_note ?? ''
  const beforeHtml = preview.originalHtml ?? preview.original_html ?? 'Original preview unavailable.'
  const afterHtml = preview.redactedHtml ?? preview.redacted_html ?? ''
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
  renderPreview(preview)
}

function renderResultFiles(fileStatuses, filePreviews = []) {
  const statuses = Array.isArray(fileStatuses) ? fileStatuses : []
  currentFileStatuses = statuses
  currentFilePreviews = Array.isArray(filePreviews) ? filePreviews : []
  resultFiles.replaceChildren()
  resultsPanel.hidden = statuses.length === 0
  const initialPreview =
    currentFilePreviews.find((preview) => (preview.path ?? '') === selectedPreviewPath) ??
    currentFilePreviews[0] ??
    null
  renderPreview(initialPreview)

  for (const [index, status] of statuses.entries()) {
    const path = status.path ?? ''
    const kind = status.status ?? 'unknown'
    const replacements = status.replacements ?? 0
    const reviewSensitive = status.reviewSensitive ?? status.review_sensitive ?? false
    const omissions =
      status.nonTextOmissionsDetected ?? status.non_text_omissions_detected ?? false
    const degraded = status.textDegradedDetected ?? status.text_degraded_detected ?? false
    const structuralLoss = status.structuralLossSuspected ?? status.structural_loss_suspected ?? false
    const lowConfidence =
      status.lowConfidenceReviewRequired ?? status.low_confidence_review_required ?? false
    const provenance = status.extractionProvenance ?? status.extraction_provenance ?? ''
    const outputPath = status.outputPath ?? status.output_path ?? ''

    const details = [
      `${replacements} replacements`,
      reviewSensitive ? 'review-sensitive' : 'no review flags',
      provenance ? `provenance: ${provenance}` : null,
      omissions ? 'non-text omissions' : null,
      degraded ? 'text degraded' : null,
      structuralLoss ? 'structural loss suspected' : null,
      lowConfidence ? 'low-confidence review' : null,
      outputPath ? `output: ${outputPath}` : null
    ]
      .filter(Boolean)
      .join(' · ')

    const item = fileListItem(path, kind, details)
    const previewIndex = currentFilePreviews.findIndex((preview) => (preview.path ?? '') === path)
    if (previewIndex >= 0) {
      item.classList.add('preview-selectable')
      item.addEventListener('click', () => selectPreview(item, currentFilePreviews[previewIndex]))
      if ((currentFilePreviews[previewIndex].path ?? '') === selectedPreviewPath || (index === 0 && !selectedPreviewPath)) {
        item.classList.add('preview-selected')
      }
    }
    resultFiles.appendChild(item)
  }
}

function getCurrentPreview() {
  return currentFilePreviews.find((preview) => (preview.path ?? '') === selectedPreviewPath) ?? null
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
  const previewPath = updatedPreview.path ?? ''
  currentFilePreviews = currentFilePreviews.map((preview) =>
    (preview.path ?? '') === previewPath ? updatedPreview : preview
  )
  currentFileStatuses = currentFileStatuses.map((status) =>
    (status.path ?? '') === previewPath ? { ...status, replacements } : status
  )
  renderResultFiles(currentFileStatuses, currentFilePreviews)
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
  if (!preview) {
    return
  }

  const rect = markElement.getBoundingClientRect()
  showPreviewActionTooltip({
    x: rect.left,
    y: rect.bottom + 8,
    label: 'Remove this redaction from the output and audit files.',
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
  if (!preview) {
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
    label: 'Add a manual redaction for the selected text.',
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

runReview.addEventListener('click', async () => {
  if (!inputPath.value.trim()) {
    summary.textContent = 'Please choose or enter an input file or folder first.'
    return
  }

  summary.textContent = 'Running local review workflow...'
  setResultActionsEnabled(false)
  renderResultFiles([], [])

  try {
    const result = await invoke('run_review_job', {
      input: inputPath.value,
      config: configPath.value || null,
      includePatterns: [],
      excludePatterns: []
    })

    const replacements = result.replacements
    const nonTextOmissionsDetected =
      result.nonTextOmissionsDetected ?? result.non_text_omissions_detected ?? false
    const reviewSummary = result.reviewSummary ?? result.review_summary ?? ''
    const coverageNote = result.coverageNote ?? result.coverage_note ?? ''
    const fileStatuses = result.fileStatuses ?? result.file_statuses ?? []

    summary.textContent = [
      'mode: review (no files written)',
      `replacements: ${replacements}`,
      `non-text omissions detected: ${nonTextOmissionsDetected}`,
      '',
      reviewSummary,
      '',
      `note: ${coverageNote}`
    ].join('\n')
    renderResultFiles(fileStatuses, [])
  } catch (error) {
    summary.textContent = `Error: ${String(error)}`
  }
})

runReplace.addEventListener('click', async () => {
  if (!inputPath.value.trim()) {
    summary.textContent = 'Please choose or enter an input file or folder first.'
    return
  }

  summary.textContent = 'Running local replace workflow...'
  setResultActionsEnabled(false)
  renderResultFiles([], [])

  try {
    const result = await invoke('run_replace_job', {
      input: inputPath.value,
      config: configPath.value || null,
      includePatterns: [],
      excludePatterns: []
    })

    const replacements = result.replacements
    const nonTextOmissionsDetected =
      result.nonTextOmissionsDetected ?? result.non_text_omissions_detected ?? false
    const reviewSummary = result.reviewSummary ?? result.review_summary ?? ''
    const coverageNote = result.coverageNote ?? result.coverage_note ?? ''
    const outputPath = result.outputPath ?? result.output_path ?? ''
    const auditOutputPath = result.auditOutputPath ?? result.audit_output_path ?? ''
    const fileStatuses = result.fileStatuses ?? result.file_statuses ?? []
    const filePreviews = result.filePreviews ?? result.file_previews ?? []

    summary.textContent = [
      'mode: replace (files written)',
      `replacements: ${replacements}`,
      `non-text omissions detected: ${nonTextOmissionsDetected}`,
      `output path: ${outputPath}`,
      `audit path: ${auditOutputPath}`,
      '',
      reviewSummary,
      '',
      `note: ${coverageNote}`
    ].join('\n')
    renderResultFiles(fileStatuses, filePreviews)
    setResultActionsEnabled(true)
  } catch (error) {
    summary.textContent = `Error: ${String(error)}`
  }
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
