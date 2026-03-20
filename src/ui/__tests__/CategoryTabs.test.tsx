import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryTabs } from '../CategoryTabs'

const categories = [
  { key: 'map', label: 'Maps' },
  { key: 'token', label: 'Tokens' },
]

describe('CategoryTabs', () => {
  it('renders category tabs (no All button)', () => {
    render(<CategoryTabs categories={categories} active="map" onSelect={vi.fn()} />)
    expect(screen.queryByText('All')).not.toBeInTheDocument()
    expect(screen.getByText('Maps')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
  })

  it('calls onSelect with category key when tab is clicked', () => {
    const onSelect = vi.fn()
    render(<CategoryTabs categories={categories} active="map" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Tokens'))
    expect(onSelect).toHaveBeenCalledWith('token')
  })

  it('renders trailing content when provided', () => {
    render(
      <CategoryTabs
        categories={categories}
        active="map"
        onSelect={vi.fn()}
        trailing={<span data-testid="trailing">search</span>}
      />,
    )
    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })
})
