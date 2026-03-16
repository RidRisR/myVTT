// src/rules/__tests__/usePluginPanels.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { usePluginPanels } from '../usePluginPanels'
import { useUiStore } from '../../stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ activePluginPanels: [] } as never)
})

describe('usePluginPanels', () => {
  it('openPanel adds panel to active list', () => {
    const { result } = renderHook(() => usePluginPanels())
    act(() => {
      result.current.openPanel('dh-full-sheet', 'entity-1')
    })
    expect(useUiStore.getState().activePluginPanels).toEqual([
      { panelId: 'dh-full-sheet', entityId: 'entity-1' },
    ])
  })

  it('openPanel with same panelId replaces instead of duplicating', () => {
    const { result } = renderHook(() => usePluginPanels())
    act(() => {
      result.current.openPanel('dh-full-sheet', 'entity-1')
    })
    act(() => {
      result.current.openPanel('dh-full-sheet', 'entity-2')
    })
    expect(useUiStore.getState().activePluginPanels).toHaveLength(1)
    expect(useUiStore.getState().activePluginPanels[0]?.entityId).toBe('entity-2')
  })

  it('closePanel removes panel from active list', () => {
    useUiStore.setState({
      activePluginPanels: [{ panelId: 'dh-full-sheet', entityId: 'e1' }],
    } as never)
    const { result } = renderHook(() => usePluginPanels())
    act(() => {
      result.current.closePanel('dh-full-sheet')
    })
    expect(useUiStore.getState().activePluginPanels).toEqual([])
  })
})
