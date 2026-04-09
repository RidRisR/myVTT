// src/ui-system/__tests__/RegionEditOverlay.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { RegionEditOverlay } from '../RegionEditOverlay'
import type { RegionDef } from '../registrationTypes'
import type { RegionLayoutEntry } from '../regionTypes'

function makeDef(overrides: Partial<RegionDef> = {}): RegionDef {
  return {
    id: 'test:panel',
    component: (() => null) as unknown as RegionDef['component'],
    lifecycle: 'persistent',
    defaultSize: { width: 200, height: 100 },
    layer: 'standard',
    ...overrides,
  }
}

const baseEntry: RegionLayoutEntry = {
  anchor: 'top-left',
  offsetX: 0,
  offsetY: 0,
  width: 200,
  height: 100,
  zOrder: 0,
}

describe('RegionEditOverlay', () => {
  it('renders a drag handle covering the region', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.style.cursor).toBe('move')
  })

  it('renders a resize handle at bottom-right', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-resize-handle]') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.style.cursor).toBe('se-resize')
  })

  it('shows region id as title on drag handle', () => {
    const { container } = render(
      <RegionEditOverlay def={makeDef({ id: 'my:region' })} entry={baseEntry} />,
    )
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle.title).toBe('my:region')
  })

  it('has a visible border in edit mode', () => {
    const { container } = render(<RegionEditOverlay def={makeDef()} entry={baseEntry} />)
    const handle = container.querySelector('[data-drag-handle]') as HTMLElement
    expect(handle.style.border).toContain('solid')
  })
})
