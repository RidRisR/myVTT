import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore, isMeasureTool, type ActiveTool, type MeasureTool } from '../uiStore'

beforeEach(() => {
  // Reset store to initial state
  useUiStore.setState({
    activeTool: 'select',
    lastMeasureTool: 'measure',
  })
})

// ── isMeasureTool helper ──

describe('isMeasureTool', () => {
  it('returns false for select', () => {
    expect(isMeasureTool('select')).toBe(false)
  })

  it.each<ActiveTool>(['measure', 'range-circle', 'range-cone', 'range-rect'])(
    'returns true for %s',
    (tool) => {
      expect(isMeasureTool(tool)).toBe(true)
    },
  )
})

// ── lastMeasureTool tracking ──

describe('lastMeasureTool tracking via setActiveTool', () => {
  it('defaults to measure', () => {
    expect(useUiStore.getState().lastMeasureTool).toBe('measure')
  })

  it('updates lastMeasureTool when setting a measure tool', () => {
    useUiStore.getState().setActiveTool('range-circle')
    expect(useUiStore.getState().lastMeasureTool).toBe('range-circle')
    expect(useUiStore.getState().activeTool).toBe('range-circle')
  })

  it('does not update lastMeasureTool when setting select', () => {
    useUiStore.getState().setActiveTool('range-cone')
    expect(useUiStore.getState().lastMeasureTool).toBe('range-cone')

    useUiStore.getState().setActiveTool('select')
    expect(useUiStore.getState().activeTool).toBe('select')
    // lastMeasureTool preserved
    expect(useUiStore.getState().lastMeasureTool).toBe('range-cone')
  })

  it('tracks the most recent measure tool across multiple switches', () => {
    const sequence: ActiveTool[] = ['measure', 'range-rect', 'select', 'range-circle', 'select']
    const expectedLast: MeasureTool[] = [
      'measure',
      'range-rect',
      'range-rect',
      'range-circle',
      'range-circle',
    ]

    sequence.forEach((tool, i) => {
      useUiStore.getState().setActiveTool(tool)
      expect(useUiStore.getState().lastMeasureTool).toBe(expectedLast[i])
    })
  })

  it('atomically updates activeTool and lastMeasureTool in the same set() call', () => {
    // Verify no intermediate state where activeTool and lastMeasureTool are inconsistent
    const snapshots: { activeTool: ActiveTool; lastMeasureTool: MeasureTool }[] = []
    const unsub = useUiStore.subscribe((state) => {
      snapshots.push({
        activeTool: state.activeTool,
        lastMeasureTool: state.lastMeasureTool,
      })
    })

    useUiStore.getState().setActiveTool('range-cone')

    // Only one state change should fire (atomic)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toEqual({
      activeTool: 'range-cone',
      lastMeasureTool: 'range-cone',
    })

    unsub()
  })
})
