export function createRedactionSidebarController({
  redactionSidebar,
  activeRedactionTermId,
  redactionTermsList,
  relatedRedactionTerms,
  redactionTermInput,
  recordDebugEvent,
  onSuggestionSelected,
  onDeleteTermRequested,
  nextDebugInputId
}) {
  return {
    renderTerms(terms) {
      recordDebugEvent('render-terms-panel', {
        activeRedactionTermId: activeRedactionTermId.value,
        termIds: terms.map((term) => term.id)
      })
      redactionTermsList.replaceChildren()
      if (terms.length === 0) {
        redactionTermsList.appendChild(createTagListItem('No redaction terms yet. Select text or use find and redact.'))
      } else {
        for (const term of terms) {
          redactionTermsList.appendChild(createEditableTermListItem({
            term,
            redactionSidebar,
            activeRedactionTermId,
            recordDebugEvent,
            onDeleteTermRequested,
            nextDebugInputId
          }))
        }
      }
    },
    renderSuggestions(suggestions) {
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
          await onSuggestionSelected(suggestion)
        })
        relatedRedactionTerms.appendChild(button)
      }
    },
    snapshotTermState(term) {
      return {
        id: term.id,
        key: term.key,
        matchedText: term.matchedText,
        occurrences: term.occurrences
      }
    }
  }
}

function createTagListItem(text) {
  const item = document.createElement('li')
  item.className = 'term-list-item'
  item.textContent = text
  return item
}

function createEditableTermListItem({
  term,
  redactionSidebar,
  activeRedactionTermId,
  recordDebugEvent,
  onDeleteTermRequested,
  nextDebugInputId
}) {
  const item = document.createElement('li')
  item.className = 'term-list-item term-list-item-row'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'term-list-input'
  input.value = redactionSidebar.draftValueFor(term.id)
  input.dataset.debugInputId = nextDebugInputId()
  input.dataset.termId = term.id
  input.setAttribute('aria-label', `Redaction term ${term.matchedText}`)
  input.title = `${term.occurrences} occurrence${term.occurrences === 1 ? '' : 's'}`
  item.appendChild(input)
  recordDebugEvent('create-term-input', {
    debugInputId: input.dataset.debugInputId,
    term: {
      id: term.id,
      key: term.key,
      matchedText: term.matchedText,
      occurrences: term.occurrences
    }
  })

  const actions = document.createElement('div')
  actions.className = 'term-list-actions'

  input.addEventListener('focus', () => {
    activeRedactionTermId.value = term.id
    recordDebugEvent('input-focus', {
      debugInputId: input.dataset.debugInputId,
      termId: term.id,
      value: input.value,
      draft: redactionSidebar.draftValueFor(term.id),
      committed: redactionSidebar.committedValueFor(term.id)
    })
  })

  input.addEventListener('input', () => {
    redactionSidebar.setDraft(term.id, input.value)
    recordDebugEvent('input-change', {
      debugInputId: input.dataset.debugInputId,
      termId: term.id,
      value: input.value,
      draft: redactionSidebar.draftValueFor(term.id),
      committed: redactionSidebar.committedValueFor(term.id)
    })
  })

  input.addEventListener('blur', () => {
    recordDebugEvent('input-blur', {
      debugInputId: input.dataset.debugInputId,
      termId: term.id,
      value: input.value,
      draft: redactionSidebar.draftValueFor(term.id),
      committed: redactionSidebar.committedValueFor(term.id)
    })
    activeRedactionTermId.value = null
  })

  input.addEventListener('keydown', async (event) => {
    recordDebugEvent('input-keydown', {
      debugInputId: input.dataset.debugInputId,
      termId: term.id,
      key: event.key,
      value: input.value
    })
    if (event.key === 'Enter') {
      event.preventDefault()
      input.blur()
      return
    }

    if (event.key === 'Escape') {
      const committedTerm = redactionSidebar.committedValueFor(term.id)
      redactionSidebar.resetDraft(term.id)
      input.value = committedTerm
    }
  })

  const deleteButton = document.createElement('button')
  deleteButton.type = 'button'
  deleteButton.className = 'secondary-button term-list-action'
  deleteButton.textContent = '×'
  deleteButton.setAttribute('aria-label', `Delete redaction term ${term.matchedText}`)
  deleteButton.title = `Delete ${term.matchedText}`
  deleteButton.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  deleteButton.addEventListener('click', async () => {
    await onDeleteTermRequested({
      termId: term.id,
      committedTerm: redactionSidebar.committedValueFor(term.id),
      displayedTerm: redactionSidebar.draftValueFor(term.id)
    })
  })

  actions.append(deleteButton)
  item.appendChild(actions)
  return item
}

function createTermChipPlaceholder(text) {
  const placeholder = document.createElement('span')
  placeholder.className = 'term-list-item'
  placeholder.textContent = text
  return placeholder
}
