import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FearPanel } from '../../ui/FearPanel'

// Mock @myvtt/sdk
const mockRunWorkflow = vi.fn().mockResolvedValue({ status: 'completed' })

vi.mock('@myvtt/sdk', () => ({
  useComponent: vi.fn().mockReturnValue({ current: 4, max: 12 }),
  usePluginTranslation: vi.fn().mockReturnValue({
    t: (key: string, opts?: Record<string, number>) => {
      if (key === 'fear.label') return 'FEAR'
      if (key === 'fear.count') return `${opts?.current} / ${opts?.max}`
      return key
    },
  }),
}))

// Import after mock so we can control return value
const sdkModule = await import('@myvtt/sdk')

function makeMockSdk() {
  return {
    data: { useComponent: sdkModule.useComponent },
    workflow: { runWorkflow: mockRunWorkflow },
  } as unknown
}

describe('FearPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 12 pips with 4 filled', () => {
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    expect(pips).toHaveLength(12)
    const filled = pips.filter((p) => p.dataset.filled === 'true')
    expect(filled).toHaveLength(4)
  })

  it('shows count text', () => {
    render(<FearPanel sdk={makeMockSdk()} />)
    expect(screen.getByText('4 / 12')).toBeInTheDocument()
  })

  it('clicking empty pip 7 calls fear-set with value 8', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    await user.click(pips[7]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 8 },
    )
  })

  it('clicking last filled pip (index 3) calls fear-clear', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    await user.click(pips[3]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-clear' }),
      {},
    )
  })

  it('clicking a non-last filled pip calls fear-set to truncate', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    await user.click(pips[1]!)
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 2 },
    )
  })

  it('clicking + button calls fear-set with current+1', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    await user.click(screen.getByTestId('fear-inc'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 5 },
    )
  })

  it('clicking - button calls fear-set with current-1', async () => {
    const user = userEvent.setup()
    render(<FearPanel sdk={makeMockSdk()} />)
    await user.click(screen.getByTestId('fear-dec'))
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'daggerheart-core:fear-set' }),
      { value: 3 },
    )
  })

  it('renders 0 filled pips when current is 0', () => {
    vi.mocked(sdkModule.useComponent).mockReturnValue({ current: 0, max: 12 })
    render(<FearPanel sdk={makeMockSdk()} />)
    const pips = screen.getAllByTestId('fear-pip')
    const filled = pips.filter((p) => p.dataset.filled === 'true')
    expect(filled).toHaveLength(0)
  })
})
