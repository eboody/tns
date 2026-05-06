export function createWorkspaceState(summary) {
  return {
    inputPath: '',
    configPath: '',
    fileStatuses: [],
    filePreviews: [],
    selectedPreviewPath: null,
    highlightsVisible: true,
    processingInFlight: false,
    outputAvailable: false,
    auditAvailable: false,
    summary
  }
}

export function setSelectedInput(state, inputPath) {
  return {
    ...state,
    inputPath
  }
}

export function setConfigPath(state, configPath) {
  return {
    ...state,
    configPath
  }
}

export function startProcessing(state, summary) {
  return {
    ...state,
    processingInFlight: true,
    outputAvailable: false,
    auditAvailable: false,
    fileStatuses: [],
    filePreviews: [],
    summary
  }
}

export function finishProcessing(state, { summary, fileStatuses, filePreviews, outputPath, auditOutputPath }) {
  const nextPreviews = Array.isArray(filePreviews) ? filePreviews : []
  const nextSelectedPath =
    nextPreviews.find((preview) => (preview.path ?? '') === state.selectedPreviewPath)?.path ??
    nextPreviews[0]?.path ??
    null

  return {
    ...state,
    processingInFlight: false,
    outputAvailable: Boolean(outputPath),
    auditAvailable: Boolean(auditOutputPath),
    fileStatuses: Array.isArray(fileStatuses) ? fileStatuses : [],
    filePreviews: nextPreviews,
    selectedPreviewPath: nextSelectedPath,
    summary
  }
}

export function failProcessing(state, summary) {
  return {
    ...state,
    processingInFlight: false,
    outputAvailable: false,
    auditAvailable: false,
    fileStatuses: [],
    filePreviews: [],
    selectedPreviewPath: null,
    summary
  }
}

export function selectPreviewPath(state, path) {
  return {
    ...state,
    selectedPreviewPath: path
  }
}

export function replacePreviewArtifacts(state, updatedPreview, replacements) {
  const previewPath = updatedPreview.path ?? ''

  return {
    ...state,
    filePreviews: state.filePreviews.map((preview) =>
      (preview.path ?? '') === previewPath ? updatedPreview : preview
    ),
    fileStatuses: state.fileStatuses.map((status) =>
      (status.path ?? '') === previewPath ? { ...status, replacements } : status
    ),
    selectedPreviewPath: state.selectedPreviewPath ?? previewPath
  }
}

export function setHighlightsVisible(state, visible) {
  return {
    ...state,
    highlightsVisible: visible
  }
}

export function toggleWorkspaceHighlights(state) {
  return setHighlightsVisible(state, !state.highlightsVisible)
}

export function getSelectedPreview(state) {
  return state.filePreviews.find((preview) => (preview.path ?? '') === state.selectedPreviewPath) ?? null
}

export function getSelectedFileStatus(state) {
  return state.fileStatuses.find((status) => (status.path ?? '') === state.selectedPreviewPath) ?? state.fileStatuses[0] ?? null
}

export function getFileReviewLabel(status) {
  if (!status) {
    return 'Waiting for input'
  }

  const kind = status.status ?? 'unknown'
  const needsReview =
    status.reviewSensitive ??
    status.lowConfidenceReviewRequired ??
    status.nonTextOmissionsDetected ??
    status.textDegradedDetected ??
    status.structuralLossSuspected ??
    false

  if (kind === 'unsupported' || kind === 'extraction_failed' || kind === 'skipped') {
    return 'Needs attention'
  }

  return needsReview ? 'Needs manual review' : 'Ready'
}
