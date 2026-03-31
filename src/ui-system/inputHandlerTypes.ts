// src/ui-system/inputHandlerTypes.ts
import type React from 'react'

/** Discriminated result returned by requestInput */
export type InputResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'cancelled' | 'timeout' }

/** Props injected into input handler components */
export interface InputHandlerProps<TContext = unknown, TResult = unknown> {
  context: TContext
  resolve: (value: TResult) => void
  cancel: () => void
}

/** Definition registered by plugins via sdk.ui.registerInputHandler */
export interface InputHandlerDef {
  /** React component to render. Receives InputHandlerProps with context/resolve/cancel. */
  component: React.ComponentType<InputHandlerProps<unknown, unknown>>
}

/** Options for requestInput */
export interface RequestInputOptions<TContext = unknown> {
  context?: TContext
  timeout?: number
}
