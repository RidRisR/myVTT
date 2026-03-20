import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryTabs } from '../CategoryTabs'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

const categories = [
  { key: 'map', label: 'Maps' },
  { key: 'token', label: 'Tokens' },
]

describe('CategoryTabs', () => {
  it('renders All button and category tabs', () => {
    render(<CategoryTabs categories={categories} active={null} onSelect={vi.fn()} />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Maps')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('calls onSelect(null) when All is clicked', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs categories={categories} active="map" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('All'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('calls onSelect with category key when tab is clicked', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs categories={categories} active={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Tokens'))
    expect(onSelect).toHaveBeenCalledWith('token')
  })

  it('renders trailing content when provided', () => {
    render(
      <CategoryTabs
        categories={categories}
        active={null}
        onSelect={vi.fn()}
        trailing={<span data-testid="trailing">search</span>}
      />,
    )
    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })
})
