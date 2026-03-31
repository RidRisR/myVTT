// src/ui-system/InputHandlerHost.tsx
import { createPortal } from 'react-dom'
import { useSessionStore } from '../stores/sessionStore'
import type { UIRegistry } from './registry'
import type { PendingInteraction } from '../stores/sessionStore'

interface Props {
  registry: UIRegistry
}

function InputHandlerInstance({
  pending,
  registry,
}: {
  pending: PendingInteraction
  registry: UIRegistry
}) {
  const def = registry.getInputHandler(pending.inputType)
  if (!def) return null

  const HandlerComponent = def.component

  return (
    <HandlerComponent
      context={pending.context}
      resolve={(value: unknown) => {
        pending.complete(value)
      }}
      cancel={() => {
        pending.cancel()
      }}
    />
  )
}

export function InputHandlerHost({ registry }: Props) {
  const pendingInteractions = useSessionStore((s) => s.pendingInteractions)

  if (pendingInteractions.size === 0) return null

  return createPortal(
    <>
      {[...pendingInteractions.values()].map((pending) => (
        <InputHandlerInstance key={pending.interactionId} pending={pending} registry={registry} />
      ))}
    </>,
    document.body,
  )
}
