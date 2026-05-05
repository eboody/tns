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
const previewNote = document.getElementById('previewNote')
const beforePreview = document.getElementById('beforePreview')
const afterPreview = document.getElementById('afterPreview')
const summary = document.getElementById('summary')
const runReview = document.getElementById('runReview')
const runReplace = document.getElementById('runReplace')
const openOutput = document.getElementById('openOutput')
const openAudit = document.getElementById('openAudit')

summary.textContent = 'Desktop shell loaded. Choose a file or folder, then run review or replace.'
setResultActionsEnabled(false)
renderSelectedInput()
renderPreview(null)

let currentFilePreviews = []

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

function renderPreview(preview) {
  if (!preview) {
    previewPanel.hidden = false
    previewTitle.textContent = 'Select a processed file to inspect its before/after preview.'
    previewNote.hidden = true
    previewNote.textContent = ''
    beforePreview.textContent = 'Original content preview will appear here.'
    afterPreview.textContent = 'Redacted output preview will appear here.'
    return
  }

  previewTitle.textContent = preview.path ?? ''
  const note = preview.previewNote ?? preview.preview_note ?? ''
  previewNote.hidden = !note
  previewNote.textContent = note
  beforePreview.innerHTML = preview.originalHtml ?? preview.original_html ?? 'Original preview unavailable.'
  afterPreview.innerHTML = preview.redactedHtml ?? preview.redacted_html ?? ''
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
  currentFilePreviews = Array.isArray(filePreviews) ? filePreviews : []
  resultFiles.replaceChildren()
  resultsPanel.hidden = statuses.length === 0
  renderPreview(currentFilePreviews[0])

  for (const [index, status] of statuses.entries()) {
    const path = status.path ?? ''
    const kind = status.status ?? 'unknown'
    const replacements = status.replacements ?? 0
    const reviewSensitive = status.reviewSensitive ?? status.review_sensitive ?? false
    const omissions =
      status.nonTextOmissionsDetected ?? status.non_text_omissions_detected ?? false
    const outputPath = status.outputPath ?? status.output_path ?? ''

    const details = [
      `${replacements} replacements`,
      reviewSensitive ? 'review-sensitive' : 'no review flags',
      omissions ? 'non-text omissions' : null,
      outputPath ? `output: ${outputPath}` : null
    ]
      .filter(Boolean)
      .join(' · ')

    const item = fileListItem(path, kind, details)
    const previewIndex = currentFilePreviews.findIndex((preview) => (preview.path ?? '') === path)
    if (previewIndex >= 0) {
      item.classList.add('preview-selectable')
      item.addEventListener('click', () => selectPreview(item, currentFilePreviews[previewIndex]))
      if (index === 0) {
        item.classList.add('preview-selected')
      }
    }
    resultFiles.appendChild(item)
  }
}

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
