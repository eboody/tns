import './styles.css'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { buildReviewNotice } from './review-notice.js'
import { buildRuntimeSettingsPayload } from './runtime-settings.js'
import { loadAppSettings, normalizeAppSettings, saveAppSettings } from './settings-store.js'
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
const editSettings = document.getElementById('editSettings')
const settingsSummary = document.getElementById('settingsSummary')
const settingsOverlay = document.getElementById('settingsOverlay')
const closeSettings = document.getElementById('closeSettings')
const cancelSettings = document.getElementById('cancelSettings')
const saveSettingsButton = document.getElementById('saveSettings')
const addExactEntity = document.getElementById('addExactEntity')
const exactEntitiesList = document.getElementById('exactEntitiesList')
const settingsClientReplacement = document.getElementById('settingsClientReplacement')
const settingsClientVariants = document.getElementById('settingsClientVariants')
const settingsDatesEnabled = document.getElementById('settingsDatesEnabled')
const settingsDatesReplacement = document.getElementById('settingsDatesReplacement')
const settingsEmailsEnabled = document.getElementById('settingsEmailsEnabled')
const settingsEmailsReplacement = document.getElementById('settingsEmailsReplacement')
const settingsPhonesEnabled = document.getElementById('settingsPhonesEnabled')
const settingsPhonesReplacement = document.getElementById('settingsPhonesReplacement')
const settingsNerEnabled = document.getElementById('settingsNerEnabled')
const settingsNerModelPath = document.getElementById('settingsNerModelPath')
const settingsNerTokenizerPath = document.getElementById('settingsNerTokenizerPath')
const settingsNerMinConfidence = document.getElementById('settingsNerMinConfidence')
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
const openAudit = document.getElementById('openAudit')
const loadingOverlay = document.getElementById('loadingOverlay')
const loadingTitle = document.getElementById('loadingTitle')
const loadingMessage = document.getElementById('loadingMessage')

let appSettings = loadAppSettings()
let settingsOpen = false
let workspace = createWorkspaceState(
  'Desktop shell loaded. Choose a file or folder to start local processing automatically.'
)
let pendingPreviewAction = null

renderWorkspace()

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
  editSettings.disabled = !enabled
}

function renderWorkspace() {
  renderSelectedInput()
  renderSettingsSummary()
  renderResultFiles()
  renderSelectedFileStrip()
  renderPreview(getSelectedPreview(workspace))
  renderLoadingOverlay()
  renderSettingsOverlay()
  summary.textContent = workspace.summary
  setResultActionsEnabled(workspace.artifactsAvailable)
  setInputControlsEnabled(!workspace.processingInFlight)
  applyHighlightVisibility()
}

function renderSettingsSummary() {
  const configuredExactEntities = appSettings.exactEntities.filter(hasMeaningfulExactEntity)
  const configuredPatterns = [appSettings.patterns.dates, appSettings.patterns.emails, appSettings.patterns.phones].filter((rule) => rule.enabled).length
  const hasClientAliases = Boolean(appSettings.clientReplacement || appSettings.clientVariants)
  const hasNerOverride = Boolean(appSettings.ner.enabled)

  if (!hasClientAliases && configuredExactEntities.length === 0 && configuredPatterns === 0 && !hasNerOverride) {
    settingsSummary.textContent = 'No persistent de-identification settings configured. The default app pipeline will be used.'
    return
  }

  const parts = []
  if (hasClientAliases) {
    parts.push('client aliases')
  }
  if (configuredExactEntities.length > 0) {
    parts.push(`${configuredExactEntities.length} exact rule${configuredExactEntities.length === 1 ? '' : 's'}`)
  }
  if (configuredPatterns > 0) {
    parts.push(`${configuredPatterns} pattern replacement${configuredPatterns === 1 ? '' : 's'}`)
  }
  if (hasNerOverride) {
    parts.push('custom NER override')
  }

  settingsSummary.textContent = `Persistent settings active: ${parts.join(', ')}.`
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

function renderSettingsOverlay() {
  settingsOverlay.hidden = !settingsOpen
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

function populateSettingsForm(settings) {
  settingsClientReplacement.value = settings.clientReplacement
  settingsClientVariants.value = settings.clientVariants
  settingsDatesEnabled.checked = settings.patterns.dates.enabled
  settingsDatesReplacement.value = settings.patterns.dates.replacement
  settingsEmailsEnabled.checked = settings.patterns.emails.enabled
  settingsEmailsReplacement.value = settings.patterns.emails.replacement
  settingsPhonesEnabled.checked = settings.patterns.phones.enabled
  settingsPhonesReplacement.value = settings.patterns.phones.replacement
  settingsNerEnabled.checked = settings.ner.enabled
  settingsNerModelPath.value = settings.ner.modelPath
  settingsNerTokenizerPath.value = settings.ner.tokenizerPath
  settingsNerMinConfidence.value = settings.ner.minConfidence

  exactEntitiesList.replaceChildren()
  const entities = settings.exactEntities.length > 0 ? settings.exactEntities : []
  for (const entity of entities) {
    exactEntitiesList.appendChild(createExactEntityRow(entity))
  }
}

function createExactEntityRow(entity = { entityType: '', replacement: '', variants: '' }) {
  const row = document.createElement('section')
  row.className = 'exact-entity-card'
  row.innerHTML = `
    <div class="exact-entity-card-header">
      <p class="exact-entity-card-title">Exact rule</p>
      <button type="button" class="secondary-button exact-entity-remove">Remove</button>
    </div>
    <label class="field-group">
      <span>Entity type</span>
      <input class="exact-entity-type" type="text" placeholder="provider" value="${escapeAttribute(entity.entityType)}" />
    </label>
    <label class="field-group">
      <span>Replacement label</span>
      <input class="exact-entity-replacement" type="text" placeholder="[PROVIDER]" value="${escapeAttribute(entity.replacement)}" />
    </label>
    <label class="field-group">
      <span>Variants</span>
      <textarea class="exact-entity-variants" rows="4" placeholder="One alias per line">${escapeHtml(entity.variants)}</textarea>
    </label>
  `
  row.querySelector('.exact-entity-remove')?.addEventListener('click', () => {
    row.remove()
  })
  return row
}

function readSettingsForm() {
  return normalizeAppSettings({
    clientReplacement: settingsClientReplacement.value,
    clientVariants: settingsClientVariants.value,
    exactEntities: Array.from(exactEntitiesList.querySelectorAll('.exact-entity-card')).map((row) => ({
      entityType: row.querySelector('.exact-entity-type')?.value ?? '',
      replacement: row.querySelector('.exact-entity-replacement')?.value ?? '',
      variants: row.querySelector('.exact-entity-variants')?.value ?? ''
    })),
    patterns: {
      dates: { enabled: settingsDatesEnabled.checked, replacement: settingsDatesReplacement.value },
      emails: { enabled: settingsEmailsEnabled.checked, replacement: settingsEmailsReplacement.value },
      phones: { enabled: settingsPhonesEnabled.checked, replacement: settingsPhonesReplacement.value }
    },
    ner: {
      enabled: settingsNerEnabled.checked,
      modelPath: settingsNerModelPath.value,
      tokenizerPath: settingsNerTokenizerPath.value,
      minConfidence: settingsNerMinConfidence.value
    }
  })
}

function hasMeaningfulExactEntity(entity) {
  return Boolean(entity.entityType || entity.replacement || entity.variants)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value)
}

function openSettingsDialog() {
  if (workspace.processingInFlight) {
    return
  }

  populateSettingsForm(appSettings)
  settingsOpen = true
  renderWorkspace()
}

function closeSettingsDialog() {
  settingsOpen = false
  renderWorkspace()
}

async function saveSettingsAndMaybeRerun() {
  appSettings = saveAppSettings(readSettingsForm())
  settingsOpen = false
  if (!workspace.inputPath.trim()) {
    workspace = {
      ...workspace,
      summary: 'Saved persistent de-identification settings for future runs.'
    }
  }
  renderWorkspace()

  if (workspace.inputPath.trim()) {
    await processSelectedInput({ sourceLabel: 'settings' })
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
      settings: buildRuntimeSettingsPayload(appSettings),
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

function showPreviewActionTooltip({ rect, label, buttonText, action }) {
  pendingPreviewAction = action
  previewActionLabel.textContent = label
  previewActionButton.textContent = buttonText
  previewActionTooltip.hidden = false

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

async function handleRedactionRemoval(markElement) {
  const preview = getCurrentPreview()
  if (!preview) {
    return
  }

  const rect = markElement.getBoundingClientRect()
  const recordLabel = markElement.dataset.recordLabel ?? 'this redaction'
  const removalLabel = markElement.dataset.manualNumber
    ? `Remove ${recordLabel.toLowerCase()}?`
    : 'Remove this redaction?'
  showPreviewActionTooltip({
    rect,
    label: removalLabel,
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

  showPreviewActionTooltip({
    rect: selection.rect,
    label: 'Add redaction for selected text?',
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
  }
})

afterPreview.addEventListener('click', async (event) => {
  const mark = targetElement(event.target)?.closest('mark[data-record-start]')
  if (mark) {
    event.preventDefault()
    await handleRedactionRemoval(mark)
  }
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

beforePreview.addEventListener('scroll', hidePreviewActionTooltip)
afterPreview.addEventListener('scroll', hidePreviewActionTooltip)
editSettings.addEventListener('click', openSettingsDialog)
closeSettings.addEventListener('click', closeSettingsDialog)
cancelSettings.addEventListener('click', closeSettingsDialog)
addExactEntity.addEventListener('click', () => {
  exactEntitiesList.appendChild(createExactEntityRow())
})
saveSettingsButton.addEventListener('click', saveSettingsAndMaybeRerun)
settingsOverlay.addEventListener('click', (event) => {
  if (event.target === settingsOverlay) {
    closeSettingsDialog()
  }
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsOpen) {
    closeSettingsDialog()
  }
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
