import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelRenderer } from '../PanelRenderer'
import { UIRegistry } from '../registry'
import type { LayoutConfig, IComponentSDK } from '../types'
import {
  FixedEscapePanel as _FixedEscapePanel,
  ZIndexEscapePanel as _ZIndexEscapePanel,
  EventThiefPanel as _EventThiefPanel,
  CrashPanel as _CrashPanel,
} from '../../sandbox/AdversarialPanels'

// Cast to ComponentType<{ sdk: unknown }> — matches registerComponent's type
type PanelComponent = React.ComponentType<{ sdk: unknown }>
const FixedEscapePanel = _FixedEscapePanel as PanelComponent
const ZIndexEscapePanel = _ZIndexEscapePanel as PanelComponent
const EventThiefPanel = _EventThiefPanel as PanelComponent
const CrashPanel = _CrashPanel as PanelComponent

const mockSDK: IComponentSDK = {
  read: {
    entity: () => undefined,
    component: () => undefined,
    query: () => [],
    formulaTokens: () => ({}),
  },
  workflow: { runWorkflow: () => Promise.resolve({} as never) },
  context: { instanceProps: {}, role: 'GM', layoutMode: 'play' },
  data: {
    useEntity: () => undefined,
    useComponent: () => undefined,
    useQuery: () => [],
  },
  awareness: {
    subscribe: () => () => {},
    broadcast: () => {},
    clear: () => {},
    usePeers: () => new Map(),
  },
  log: {
    subscribe: () => () => {},
    useEntries: () => ({ entries: [], newIds: new Set<string>() }),
  },
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
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
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

// ── Adversarial panel scenarios ──
// These tests use the actual adversarial panel components from the sandbox
// to verify that real-world attack patterns are contained by infrastructure.

describe('PanelRenderer adversarial containment', () => {
  function renderAdversarial(
    component: React.ComponentType<{ sdk: unknown }>,
    layoutMode: 'play' | 'edit' = 'edit',
  ) {
    const registry = new UIRegistry()
    registry.registerComponent({
      id: 'adv.panel',
      component,
      type: 'panel',
      defaultSize: { width: 240, height: 120 },
    })
    const layout: LayoutConfig = {
      'adv.panel#1': { x: 50, y: 50, width: 240, height: 120, zOrder: 1 },
    }
    return render(
      <PanelRenderer
        registry={registry}
        layout={layout}
        makeSDK={() => mockSDK}
        layoutMode={layoutMode}
        onDrag={vi.fn()}
      />,
    )
  }

  describe('position:fixed escape attempt', () => {
    it('contain:paint traps fixed-position elements inside panel', () => {
      const { container } = renderAdversarial(FixedEscapePanel)
      const panel = container.querySelector('.plugin-panel')
      // contain:paint creates a containing block for fixed children
      expect(panel).toHaveStyle({ contain: 'layout paint' })
      // The fixed element exists in DOM but is trapped by containment
      expect(panel?.querySelector('div[style*="fixed"]')).not.toBeNull()
    })

    it('DragHandle is present despite fixed-escape content', () => {
      const { container } = renderAdversarial(FixedEscapePanel)
      const dragHandle = container.querySelector('[title="adv.panel"]')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('zIndex escape attempt', () => {
    it('isolation:isolate contains zIndex:999999 within content layer', () => {
      const { container } = renderAdversarial(ZIndexEscapePanel)
      const panel = container.querySelector('.plugin-panel')
      const contentWrapper = panel?.firstElementChild as HTMLElement
      // isolation:isolate creates a stacking context — z-index 999999 inside
      // cannot escape to the .plugin-panel stacking context
      expect(contentWrapper).toHaveStyle({ isolation: 'isolate' })
      // The high-zIndex element exists but is isolated
      expect(panel?.querySelector('div[style*="999999"]')).not.toBeNull()
    })

    it('DragHandle is present despite zIndex-escape content', () => {
      const { container } = renderAdversarial(ZIndexEscapePanel)
      const dragHandle = container.querySelector('[title="adv.panel"]')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('event theft attempt', () => {
    it('pointerEvents:none blocks event-stealing panel in edit mode', () => {
      const { container } = renderAdversarial(EventThiefPanel, 'edit')
      const panel = container.querySelector('.plugin-panel')
      const contentWrapper = panel?.firstElementChild as HTMLElement
      // pointerEvents:none on content wrapper means stopPropagation
      // handlers on panel content never fire — events go to DragHandle
      expect(contentWrapper).toHaveStyle({ pointerEvents: 'none' })
    })

    it('panel content is interactive in play mode', () => {
      const { container } = renderAdversarial(EventThiefPanel, 'play')
      const panel = container.querySelector('.plugin-panel')
      const contentWrapper = panel?.firstElementChild as HTMLElement
      // In play mode, panel content receives events normally
      expect(contentWrapper.style.pointerEvents).toBe('')
    })

    it('DragHandle is present despite event-stealing content', () => {
      const { container } = renderAdversarial(EventThiefPanel, 'edit')
      const dragHandle = container.querySelector('[title="adv.panel"]')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('render crash', () => {
    it('ErrorBoundary catches crash without affecting DragHandle', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container } = renderAdversarial(CrashPanel)
      spy.mockRestore()

      // DragHandle must render — crash is caught by ErrorBoundary
      const dragHandle = container.querySelector('[title="adv.panel"]')
      expect(dragHandle).toBeInTheDocument()
      expect(dragHandle).toHaveStyle({ position: 'absolute', cursor: 'move' })
    })

    it('crashed panel does not break sibling panels', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const registry = new UIRegistry()
      registry.registerComponent({
        id: 'adv.crash',
        component: CrashPanel,
        type: 'panel',
        defaultSize: { width: 100, height: 100 },
      })
      registry.registerComponent({
        id: 'adv.healthy',
        component: () => <div>healthy panel</div>,
        type: 'panel',
        defaultSize: { width: 100, height: 100 },
      })
      const layout: LayoutConfig = {
        'adv.crash#1': { x: 0, y: 0, width: 100, height: 100, zOrder: 0 },
        'adv.healthy#1': { x: 110, y: 0, width: 100, height: 100, zOrder: 0 },
      }
      render(
        <PanelRenderer
          registry={registry}
          layout={layout}
          makeSDK={() => mockSDK}
          layoutMode="edit"
          onDrag={vi.fn()}
        />,
      )
      spy.mockRestore()

      // Healthy panel renders normally
      expect(screen.getByText('healthy panel')).toBeInTheDocument()
      // Both DragHandles are present
      const handles = document.querySelectorAll('[title]')
      expect(handles).toHaveLength(2)
    })
  })
})
