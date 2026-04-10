import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import type { IRegionSDK } from '../../../../src/ui-system/types'
import type { Entity } from '../../../../src/shared/entityTypes'

const mockRunWorkflow = vi.fn().mockResolvedValue({ status: 'completed' })

// Mock useIdentityStore
vi.mock('../../../../src/stores/identityStore', () => ({
  useIdentityStore: vi.fn(),
}))

// Mock @myvtt/sdk
vi.mock('@myvtt/sdk', () => ({
  usePluginTranslation: vi.fn().mockReturnValue({
    t: (key: string) => {
      const map: Record<string, string> = {
        'charcard.noCharacter': 'No character selected',
        'charcard.section.attributes': 'Attributes',
        'attr.agility': '敏捷',
        'attr.strength': '力量',
        'attr.instinct': '本能',
        'attr.knowledge': '知识',
        'attr.presence': '临场',
        'attr.finesse': '精巧',
      }
      return map[key] ?? key
    },
  }),
}))

// Import after mock
const identityModule = await import('../../../../src/stores/identityStore')
import { CharacterCard } from '../../ui/CharacterCard'

const TEST_ENTITY: Entity = {
  id: 'char1',
  permissions: { default: 'owner', seats: {} },
  lifecycle: 'persistent',
  tags: [],
  components: {
    'core:identity': { name: 'Aria', imageUrl: '', color: '#ff0000' },
    'daggerheart:attributes': { agility: 2, strength: -1, finesse: 0, instinct: 3, presence: 1, knowledge: -2 },
    'daggerheart:meta': { tier: 2, proficiency: 2, className: 'Bard', ancestry: 'Elf' },
  },
}

function makeAttrs() {
  return { agility: 2, strength: -1, finesse: 0, instinct: 3, presence: 1, knowledge: -2 }
}

function makeMeta() {
  return { tier: 2, proficiency: 2, className: 'Bard', ancestry: 'Elf' }
}

function makeMockSdk(overrides: Partial<{ role: 'GM' | 'Player' }> = {}) {
  return {
    data: {
      useEntity: vi.fn().mockReturnValue(TEST_ENTITY),
      useComponent: vi.fn().mockImplementation((_id: string, key: string) => {
        if (key === 'daggerheart:attributes') return makeAttrs()
        if (key === 'daggerheart:meta') return makeMeta()
        return undefined
      }),
      useQuery: vi.fn().mockReturnValue([]),
    },
    workflow: { runWorkflow: mockRunWorkflow },
    context: { instanceProps: {}, role: overrides.role ?? 'Player', layoutMode: 'play' },
    read: {},
    interaction: undefined,
    awareness: {
      subscribe: () => () => {},
      broadcast: () => {},
      clear: () => {},
      usePeers: () => new Map(),
    },
    log: {
      subscribe: () => () => {},
      useEntries: () => ({ entries: [], newIds: new Set() }),
    },
    ui: {
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      resize: vi.fn(),
      getPortalContainer: () => document.body,
    },
  } as unknown as IRegionSDK
}

function setupIdentityStore(activeCharacterId: string | null = 'char1') {
  vi.mocked(identityModule.useIdentityStore).mockImplementation((selector: any) => {
    const state = {
      seats: [
        {
          id: 'seat1',
          name: 'Player1',
          color: '#3b82f6',
          role: 'PL' as const,
          activeCharacterId: activeCharacterId ?? undefined,
        },
      ],
      mySeatId: 'seat1',
    }
    return selector(state)
  })
}

describe('CharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupIdentityStore('char1')
  })

  it('renders 6 attribute cells with correct values', () => {
    render(<CharacterCard sdk={makeMockSdk()} />)
    const values = screen.getAllByTestId('attr-value')
    expect(values).toHaveLength(6)
    // Check that values include the expected formatted numbers
    const texts = values.map((v) => v.textContent)
    expect(texts).toContain('+2') // agility
    expect(texts).toContain('-1') // strength
    expect(texts).toContain('+0') // finesse (value is 0, displayed as +0)
  })

  it('shows character name and class info', () => {
    render(<CharacterCard sdk={makeMockSdk()} />)
    expect(screen.getByText('Aria')).toBeInTheDocument()
    expect(screen.getByText(/Bard/)).toBeInTheDocument()
  })

  it('clicking roll zone triggers action-check workflow', async () => {
    const user = userEvent.setup()
    render(<CharacterCard sdk={makeMockSdk()} />)
    const rollZones = screen.getAllByTestId('attr-roll-zone')
    // First attribute in ATTRS order is agility (value: 2)
    await user.click(rollZones[0]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:action-check' }),
      expect.objectContaining({
        formula: '2d12+@agility',
        actorId: 'char1',
      }),
    )
  })

  it('clicking edit zone opens input', async () => {
    const user = userEvent.setup()
    render(<CharacterCard sdk={makeMockSdk()} />)
    const editZones = screen.getAllByTestId('attr-edit-zone')
    await user.click(editZones[0]!) // first attribute
    expect(screen.getByTestId('attr-input')).toBeInTheDocument()
  })

  it('submitting edit triggers update-attr workflow', async () => {
    const user = userEvent.setup()
    render(<CharacterCard sdk={makeMockSdk()} />)
    const editZones = screen.getAllByTestId('attr-edit-zone')
    await user.click(editZones[0]!) // open edit for agility
    const input = screen.getByTestId('attr-input')
    await user.clear(input)
    await user.type(input, '5')
    await user.tab() // blur to commit
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:charcard-update-attr' }),
      expect.objectContaining({
        entityId: 'char1',
        attribute: 'agility',
        value: 5,
      }),
    )
  })

  it('GM role renders hidden div', () => {
    render(<CharacterCard sdk={makeMockSdk({ role: 'GM' })} />)
    expect(screen.getByTestId('charcard-gm-hidden')).toBeInTheDocument()
    expect(screen.queryAllByTestId('attr-value')).toHaveLength(0)
  })

  it('no active character shows empty state', () => {
    setupIdentityStore(null)
    render(<CharacterCard sdk={makeMockSdk()} />)
    expect(screen.getByTestId('charcard-empty')).toBeInTheDocument()
    expect(screen.getByText('No character selected')).toBeInTheDocument()
  })
})
