import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createWorkspaceState,
  failProcessing,
  finishProcessing,
  getFileReviewLabel,
  getSelectedPreview,
  getSelectedFileStatus,
  replacePreviewArtifacts,
  selectPreviewPath,
  setSelectedInput,
  startProcessing,
  toggleWorkspaceHighlights
} from './workspace-state.js'

test('processing success selects the first preview and enables artifacts when outputs exist', () => {
  let state = createWorkspaceState('ready')
  state = setSelectedInput(state, '/tmp/input.docx')
  state = startProcessing(state, 'processing')

  state = finishProcessing(state, {
    summary: 'done',
    fileStatuses: [{ path: '/tmp/input.docx', replacements: 4 }],
    filePreviews: [{ path: '/tmp/input.docx', redactedHtml: 'after' }],
    outputPath: '/tmp/output.md',
    auditOutputPath: '/tmp/output.audit.json'
  })

  assert.equal(state.processingInFlight, false)
  assert.equal(state.outputAvailable, true)
  assert.equal(state.selectedPreviewPath, '/tmp/input.docx')
  assert.equal(getSelectedPreview(state)?.path, '/tmp/input.docx')
})

test('processing success keeps the selected preview when it is still present', () => {
  let state = createWorkspaceState('ready')
  state = finishProcessing(state, {
    summary: 'first pass',
    fileStatuses: [
      { path: '/tmp/a.md', replacements: 1 },
      { path: '/tmp/b.md', replacements: 2 }
    ],
    filePreviews: [
      { path: '/tmp/a.md', redactedHtml: 'a' },
      { path: '/tmp/b.md', redactedHtml: 'b' }
    ],
    outputPath: '/tmp/out',
    auditOutputPath: '/tmp/audit'
  })
  state = selectPreviewPath(state, '/tmp/b.md')

  state = finishProcessing(state, {
    summary: 'rerun',
    fileStatuses: [
      { path: '/tmp/a.md', replacements: 1 },
      { path: '/tmp/b.md', replacements: 3 }
    ],
    filePreviews: [
      { path: '/tmp/a.md', redactedHtml: 'a2' },
      { path: '/tmp/b.md', redactedHtml: 'b2' }
    ],
    outputPath: '/tmp/out',
    auditOutputPath: '/tmp/audit'
  })

  assert.equal(state.selectedPreviewPath, '/tmp/b.md')
  assert.equal(getSelectedPreview(state)?.redactedHtml, 'b2')
})

test('replacing preview artifacts updates both preview and replacement count', () => {
  let state = finishProcessing(createWorkspaceState('ready'), {
    summary: 'done',
    fileStatuses: [{ path: '/tmp/a.md', replacements: 1 }],
    filePreviews: [{ path: '/tmp/a.md', redactedHtml: 'old' }],
    outputPath: '/tmp/out',
    auditOutputPath: '/tmp/audit'
  })

  state = replacePreviewArtifacts(state, { path: '/tmp/a.md', redactedHtml: 'new' }, 2)

  assert.equal(getSelectedPreview(state)?.redactedHtml, 'new')
  assert.equal(state.fileStatuses[0].replacements, 2)
})

test('failure clears preview state and leaves artifacts unavailable', () => {
  let state = finishProcessing(createWorkspaceState('ready'), {
    summary: 'done',
    fileStatuses: [{ path: '/tmp/a.md', replacements: 1 }],
    filePreviews: [{ path: '/tmp/a.md', redactedHtml: 'old' }],
    outputPath: '/tmp/out',
    auditOutputPath: '/tmp/audit'
  })

  state = failProcessing(state, 'Error: boom')

  assert.equal(state.outputAvailable, false)
  assert.equal(state.filePreviews.length, 0)
  assert.equal(state.selectedPreviewPath, null)
  assert.equal(state.summary, 'Error: boom')
})

test('highlight visibility toggles through workspace state', () => {
  const state = toggleWorkspaceHighlights(createWorkspaceState('ready'))
  assert.equal(state.highlightsVisible, false)
})

test('selected file status follows the selected preview path', () => {
  let state = finishProcessing(createWorkspaceState('ready'), {
    summary: 'done',
    fileStatuses: [
      { path: '/tmp/a.md', replacements: 1, status: 'processed' },
      { path: '/tmp/b.md', replacements: 2, status: 'processed', reviewSensitive: true }
    ],
    filePreviews: [{ path: '/tmp/a.md' }, { path: '/tmp/b.md' }],
    outputPath: '/tmp/out',
    auditOutputPath: '/tmp/audit'
  })

  state = selectPreviewPath(state, '/tmp/b.md')

  assert.equal(getSelectedFileStatus(state)?.path, '/tmp/b.md')
  assert.equal(getFileReviewLabel(getSelectedFileStatus(state)), 'Needs manual review')
})
