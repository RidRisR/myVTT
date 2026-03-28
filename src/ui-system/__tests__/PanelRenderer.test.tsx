import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelRenderer } from '../PanelRenderer'
import { UIRegistry } from '../registry'
import type { LayoutConfig, IComponentSDK } from '../types'

const mockSDK: IComponentSDK = {
  read: {
    entity: () => undefined,
    component: () => undefined,
    query: () => [],
    formulaTokens: () => ({}),
  },
  workflow: { runWorkflow: () => Promise.resolve({} as never) },
  context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
  awareness: {
    subscribe: () => () => {},
    broadcast: () => {},
    clear: () => {},
  },
  log: { subscribe: () => () => {} },
  ui: { openPanel: () => '', closePanel: () => {} },
}

describe('PanelRenderer', () => {
  it('renders a registered component at the specified position', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: () => <div>hello panel</div>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.panel#1': { x: 50, y: 80, width: 200, height: 100, zOrder: 0 },
    }

    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    expect(screen.getByText('hello panel')).toBeInTheDocument()
  })

  it('renders nothing for an unknown component id', () => {
    const registry = new UIRegistry()
    const layout: LayoutConfig = {
      'unknown.panel#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 },
    }

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    // container.firstChild is the Fragment wrapper — assert on container itself
    expect(container).toBeEmptyDOMElement()
  })

  it('catches a crashing panel in ErrorBoundary without unmounting others', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.crash',
      component: () => {
        throw new Error('boom')
      },
      type: 'panel',
      defaultSize: { width: 100, height: 100 },
    })
    registry.registerComponent({
      id: 'test.ok',
      component: () => <div>survivor</div>,
      type: 'panel',
      defaultSize: { width: 100, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.crash#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 },
      'test.ok#1': { x: 110, y: 0, width: 100, height: 100, zOrder: 0 },
    }

    // Suppress React's error boundary console.error in test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )
    spy.mockRestore()

    expect(screen.getByText('survivor')).toBeInTheDocument()
  })

  it('does not show chrome label in play mode', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.bare',
      component: () => <div>bare content</div>,
      type: 'panel',
      defaultSize: { width: 100, height: 100 },
    })

    const layout: LayoutConfig = {
      'test.bare#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 },
    }

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="play"
      />,
    )

    expect(screen.getByText('bare content')).toBeInTheDocument()
    // No chrome label — componentId should not appear as text
    const allText = container.textContent || ''
    expect(allText).not.toContain('test.bare')
  })

  it('does not render edit overlay when showHandles is false in edit mode', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: () => <div>content</div>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })
    const layout: LayoutConfig = {
      'test.panel#1': { x: 0, y: 0, width: 200, height: 100, zOrder: 0 },
    }
    const onDrag = vi.fn()

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="edit"
        onDrag={onDrag}
        showHandles={false}
      />,
    )

    // DragHandle carries title={label}; absent when showHandles=false
    expect(container.querySelector('[title="test.panel"]')).toBeNull()
  })

  it('renders edit overlay as full-panel absolute element in edit mode', () => {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: () => <div>content</div>,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })
    const layout: LayoutConfig = {
      'test.panel#1': { x: 0, y: 0, width: 200, height: 100, zOrder: 0 },
    }
    const onDrag = vi.fn()

    const { container } = render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode="edit"
        onDrag={onDrag}
      />,
    )

    const overlay = container.querySelector('[title="test.panel"]')
    expect(overlay).toBeInTheDocument()
    expect(overlay).toHaveStyle({ position: 'absolute' })
  })
})

// ── Infrastructure isolation guarantees ──
// These tests verify that the PanelRenderer base layer provides structural
// CSS guarantees that hold regardless of what a plugin panel renders.
// The browser guarantees the CSS behavior; we verify the properties are applied.

describe('PanelRenderer isolation guarantees', () => {
  function renderPanel(opts: {
    component: React.ComponentType<{ sdk: unknown }>
    layoutMode?: 'play' | 'edit'
    onDrag?: (key: string, delta: { dx: number; dy: number }) => void
  }) {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'test.panel',
      component: opts.component,
      type: 'panel',
      defaultSize: { width: 200, height: 100 },
    })
    const layout: LayoutConfig = {
      'test.panel#1': { x: 0, y: 0, width: 200, height: 100, zOrder: 5 },
    }
    return render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode={opts.layoutMode ?? 'play'}
        onDrag={opts.onDrag}
      />,
    )
  }

  it('plugin-panel container has contain: layout paint for CSS containment', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    expect(panel).toHaveStyle({ contain: 'layout paint' })
  })

  it('plugin-panel container has pointerEvents: auto (overrides parent none)', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    expect(panel).toHaveStyle({ pointerEvents: 'auto' })
  })

  it('content wrapper has isolation: isolate (prevents zIndex escape)', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    // Content wrapper is the first child of .plugin-panel
    const contentWrapper = panel?.firstElementChild as HTMLElement
    expect(contentWrapper).toHaveStyle({ isolation: 'isolate' })
  })

  it('content wrapper has pointerEvents: none in edit mode', () => {
    const { container } = renderPanel({
      component: () => <button>clickable</button>,
      layoutMode: 'edit',
      onDrag: vi.fn(),
    })
    const panel = container.querySelector('.plugin-panel')
    const contentWrapper = panel?.firstElementChild as HTMLElement
    expect(contentWrapper).toHaveStyle({ pointerEvents: 'none' })
  })

  it('content wrapper allows pointer events in play mode', () => {
    const { container } = renderPanel({
      component: () => <button>clickable</button>,
      layoutMode: 'play',
    })
    const panel = container.querySelector('.plugin-panel')
    const contentWrapper = panel?.firstElementChild as HTMLElement
    // pointerEvents should not be set (inherits auto from parent)
    expect(contentWrapper.style.pointerEvents).toBe('')
  })

  it('DragHandle renders even when panel component throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderPanel({
      component: () => {
        throw new Error('panel crash')
      },
      layoutMode: 'edit',
      onDrag: vi.fn(),
    })
    spy.mockRestore()

    // DragHandle must still be present despite panel crash
    const dragHandle = container.querySelector('[title="test.panel"]')
    expect(dragHandle).toBeInTheDocument()
    expect(dragHandle).toHaveStyle({ position: 'absolute', cursor: 'move' })
  })

  it('DragHandle renders regardless of panel DOM complexity', () => {
    // A panel with deeply nested DOM, high zIndex elements, and event handlers
    const ComplexPanel = () => (
      <div style={{ position: 'relative', zIndex: 9999 }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999 }}>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'relative', zIndex: 9999 }}
          >
            steal events
          </button>
        </div>
      </div>
    )
    const { container } = renderPanel({
      component: ComplexPanel,
      layoutMode: 'edit',
      onDrag: vi.fn(),
    })

    // DragHandle must render on top of whatever the panel does
    const dragHandle = container.querySelector('[title="test.panel"]')
    expect(dragHandle).toBeInTheDocument()

    // Content wrapper isolation prevents zIndex escape
    const panel = container.querySelector('.plugin-panel')
    const contentWrapper = panel?.firstElementChild as HTMLElement
    expect(contentWrapper).toHaveStyle({ isolation: 'isolate', pointerEvents: 'none' })
  })

  it('zOrder from LayoutEntry is applied as zIndex', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    expect(panel).toHaveStyle({ zIndex: '5' })
  })

  it('data-plugin attribute extracted from componentId namespace', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    expect(panel).toHaveAttribute('data-plugin', 'test')
  })

  it('data-type attribute reflects panel type', () => {
    const { container } = renderPanel({ component: () => <div>test</div> })
    const panel = container.querySelector('.plugin-panel')
    expect(panel).toHaveAttribute('data-type', 'panel')
  })
})
