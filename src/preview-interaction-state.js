import { signal } from '@preact/signals-core'

export function createPreviewInteractionState() {
  const tooltip = signal(hiddenTooltip())
  const actionRuns = signal([])
  const actionInFlight = signal(false)
  const requestId = signal(0)

  return {
    tooltip,
    actionRuns,
    actionInFlight,
    requestId,
    isTooltipVisible() {
      return !tooltip.peek().hidden
    },
    showTooltip({ label, actions, layout }) {
      actionRuns.value = Array.isArray(actions) ? actions.map((action) => action.run) : []
      tooltip.value = {
        hidden: false,
        ariaHidden: 'false',
        state: 'opening',
        label,
        actions: Array.isArray(actions) ? actions.map(toTooltipAction) : [],
        placement: layout?.placement ?? null,
        left: layout?.left ?? null,
        top: layout?.top ?? null,
        arrowLeft: layout?.arrowLeft ?? null
      }
    },
    patchTooltip(patch) {
      tooltip.value = {
        ...tooltip.peek(),
        ...patch
      }
    },
    markTooltipOpen() {
      tooltip.value = {
        ...tooltip.peek(),
        state: 'open'
      }
    },
    beginTooltipHide() {
      if (tooltip.peek().hidden && actionRuns.peek().length === 0) {
        return false
      }

      actionRuns.value = []
      tooltip.value = {
        ...tooltip.peek(),
        ariaHidden: 'true',
        state: 'closing'
      }
      return true
    },
    finishTooltipHide() {
      tooltip.value = hiddenTooltip()
    },
    nextRequestId() {
      requestId.value += 1
      return requestId.value
    }
  }
}

function toTooltipAction(action) {
  return {
    buttonText: action.buttonText,
    disabled: Boolean(action.disabled),
    variant: action.variant ?? ''
  }
}

function hiddenTooltip() {
  return {
    hidden: true,
    ariaHidden: 'true',
    state: null,
    label: '',
    actions: [],
    placement: null,
    left: null,
    top: null,
    arrowLeft: null
  }
}
