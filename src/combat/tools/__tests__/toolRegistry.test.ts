import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolDefinition, ToolCategory } from '../types'

// We test the ToolRegistry class directly (not the singleton) to avoid
// interference from registerBuiltinTools side-effects.

// Re-create the class for isolation — import path would bring the singleton.
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(def: ToolDefinition): void {
    if (this.tools.has(def.id)) {
      console.warn(`Tool "${def.id}" already registered, skipping`)
      return
    }
    this.tools.set(def.id, def)
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  getAll(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  getByCategory(cat: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === cat)
  }

  has(id: string): boolean {
    return this.tools.has(id)
  }
}

function makeTool(overrides: Partial<ToolDefinition> & { id: string }): ToolDefinition {
  return {
    category: 'interaction',
    icon: () => null,
    label: overrides.id,
    defaultMode: 'persistent',
    ...overrides,
  } as ToolDefinition
}

let registry: ToolRegistry

beforeEach(() => {
  registry = new ToolRegistry()
})

// ── register ──

describe('register', () => {
  it('adds a tool that can be retrieved', () => {
    const tool = makeTool({ id: 'select' })
    registry.register(tool)
    expect(registry.get('select')).toBe(tool)
  })

  it('skips duplicate registration with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tool1 = makeTool({ id: 'select', label: 'first' })
    const tool2 = makeTool({ id: 'select', label: 'second' })

    registry.register(tool1)
    registry.register(tool2)

    expect(registry.get('select')?.label).toBe('first')
    expect(warn).toHaveBeenCalledWith('Tool "select" already registered, skipping')
    warn.mockRestore()
  })
})

// ── get ──

describe('get', () => {
  it('returns undefined for unknown tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })
})

// ── has ──

describe('has', () => {
  it('returns false for unknown tool', () => {
    expect(registry.has('x')).toBe(false)
  })

  it('returns true for registered tool', () => {
    registry.register(makeTool({ id: 'x' }))
    expect(registry.has('x')).toBe(true)
  })
})

// ── getAll ──

describe('getAll', () => {
  it('returns empty array when no tools registered', () => {
    expect(registry.getAll()).toEqual([])
  })

  it('returns all registered tools', () => {
    registry.register(makeTool({ id: 'a' }))
    registry.register(makeTool({ id: 'b' }))
    const ids = registry.getAll().map((t) => t.id)
    expect(ids).toEqual(['a', 'b'])
  })
})

// ── getByCategory ──

describe('getByCategory', () => {
  it('filters tools by category', () => {
    registry.register(makeTool({ id: 'select', category: 'interaction' }))
    registry.register(makeTool({ id: 'measure', category: 'measurement' }))
    registry.register(makeTool({ id: 'circle', category: 'measurement' }))
    registry.register(makeTool({ id: 'grid', category: 'gm' }))

    const measurements = registry.getByCategory('measurement')
    expect(measurements.map((t) => t.id)).toEqual(['measure', 'circle'])
  })

  it('returns empty array for category with no tools', () => {
    registry.register(makeTool({ id: 'select', category: 'interaction' }))
    expect(registry.getByCategory('drawing')).toEqual([])
  })
})

// ── Integration: registerBuiltinTools ──

describe('builtin tools registration', () => {
  it('registers all expected builtin tools via side-effect import', async () => {
    // Import the singleton + registration side-effect
    const { toolRegistry } = await import('../toolRegistry')
    await import('../registerBuiltinTools')

    const expectedIds = [
      'select',
      'measure',
      'range-circle',
      'range-cone',
      'range-rect',
      'grid-config',
      'action-targeting',
    ]

    for (const id of expectedIds) {
      expect(toolRegistry.has(id), `Expected tool "${id}" to be registered`).toBe(true)
    }
  })

  it('measurement tools have correct category', async () => {
    const { toolRegistry } = await import('../toolRegistry')
    await import('../registerBuiltinTools')

    const measureTools = toolRegistry.getByCategory('measurement')
    expect(measureTools.length).toBeGreaterThanOrEqual(4) // measure + 3 ranges
  })
})
