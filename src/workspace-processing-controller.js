export function createWorkspaceProcessingController({
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
  getSavedRedactionTerms,
  setSavedRedactionTerms
}) {
  async function applySavedRedactionTermsToWorkspace() {
    const terms = getSavedRedactionTerms()
    if (terms.length === 0 || workspace.peek().filePreviews.length === 0) {
      return
    }

    for (const term of terms) {
      queuePendingRedactionOperation({
        queuedMessage: `Queued saved redaction term "${term}". Press Save to apply it.`,
        draftEffect: {
          kind: 'find-and-redact-term',
          term
        },
        run: async () => {
          try {
            const result = await invoke('find_and_redact_term', {
              request: {
                term,
                targets: workspace.peek().filePreviews.map(toPreviewRequest)
              }
            })
            replacePreviewStates(result.updates ?? [])
            appendSummary(
              `Applied saved redaction term "${term}" across ${result.updatedTargets ?? 0} file(s). `
              + `${result.unchangedTargets ?? 0} file(s) already matched.`
            )
            return true
          } catch (error) {
            appendSummary(`Saved redaction term error: ${String(error)}`)
            return false
          }
        }
      })
    }

    syncRedactionSidebar(workspace.peek(), true)
  }

  async function processSelectedInput({ sourceLabel }) {
    const state = workspace.peek()
    const value = state.inputPath.trim()
    if (!value || state.processingInFlight) {
      return
    }

    workspace.value = startProcessing(state, `Processing selected ${sourceLabel}...`)
    await nextPaint()

    try {
      const result = await invoke('run_replace_job', {
        input: value,
        config: null,
        settings: null,
        includePatterns: [],
        excludePatterns: []
      })

      const nextSummary = [
        `mode: live review (processed automatically after ${sourceLabel} selection)`,
        `replacements: ${result.replacements}`,
        `non-text omissions detected: ${result.nonTextOmissionsDetected}`,
        `output path: ${result.outputPath ?? ''}`,
        `audit path: ${result.auditOutputPath ?? ''}`,
        '',
        result.reviewSummary ?? '',
        '',
        `note: ${result.coverageNote ?? ''}`
      ].join('\n')

      workspace.value = finishProcessing(workspace.peek(), {
        summary: nextSummary,
        fileStatuses: result.fileStatuses ?? [],
        filePreviews: result.filePreviews ?? [],
        outputPath: result.outputPath ?? '',
        auditOutputPath: result.auditOutputPath ?? ''
      })

      await applySavedRedactionTermsToWorkspace()
    } catch (error) {
      workspace.value = failProcessing(workspace.peek(), `Error: ${String(error)}`)
    }
  }

  return {
    processSelectedInput,

    rememberSavedRedactionTerm(term) {
      const nextTerms = saveSavedRedactionTerms([...getSavedRedactionTerms(), term])
      setSavedRedactionTerms(nextTerms)
      redactionSidebar.rememberPersistedTerm(term)
    },

    forgetSavedRedactionTerm(termId, term) {
      const nextTerms = saveSavedRedactionTerms(
        getSavedRedactionTerms().filter((savedTerm) => savedTerm.toLowerCase() !== term.toLowerCase())
      )
      setSavedRedactionTerms(nextTerms)
      if (termId) {
        redactionSidebar.forgetPersistedTermById(termId)
        return
      }

      redactionSidebar.setPersistedTerms(nextTerms)
    },

    replaceSavedRedactionTerm(termId, previousTerm, nextTerm) {
      const nextTerms = saveSavedRedactionTerms(
        getSavedRedactionTerms()
          .filter((savedTerm) => savedTerm.toLowerCase() !== previousTerm.toLowerCase())
          .concat(nextTerm)
      )
      setSavedRedactionTerms(nextTerms)
      if (termId) {
        redactionSidebar.replacePersistedTerm(termId, nextTerm)
        return
      }

      redactionSidebar.setPersistedTerms(nextTerms)
    }
  }
}

function toPreviewRequest(preview) {
  return {
    path: preview.path,
    inputPath: preview.inputPath ?? preview.input_path,
    outputPath: preview.outputPath ?? preview.output_path,
    auditOutputPath: preview.auditOutputPath ?? preview.audit_output_path
  }
}
