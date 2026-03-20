import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { DraggableTagBar } from '../DraggableTagBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>)
}

describe('DraggableTagBar', () => {
  it('returns null when tags array is empty', () => {
    const { container } = render(
      <DraggableTagBar tags={[]} selectedTags={[]} onToggleTag={vi.fn()} />,
    )
    // Component returns null, so no tag bar content rendered
    expect(container.querySelector('.flex.flex-wrap')).toBeNull()
  })

  it('renders tag buttons', () => {
    renderWithDnd(
      <DraggableTagBar tags={['fantasy', 'dark']} selectedTags={[]} onToggleTag={vi.fn()} />,
    )
    expect(screen.getByText('fantasy')).toBeInTheDocument()
    expect(screen.getByText('dark')).toBeInTheDocument()
  })

  it('shows Clear button when tags are selected', () => {
    renderWithDnd(
      <DraggableTagBar
        tags={['fantasy', 'dark']}
        selectedTags={['fantasy']}
        onToggleTag={vi.fn()}
      />,
    )
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('does not show Clear button when no tags selected', () => {
    renderWithDnd(<DraggableTagBar tags={['fantasy']} selectedTags={[]} onToggleTag={vi.fn()} />)
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('calls onToggleTag for each selected tag when Clear is clicked', () => {
    const onToggleTag = vi.fn()
    renderWithDnd(
      <DraggableTagBar
        tags={['a', 'b', 'c']}
        selectedTags={['a', 'c']}
        onToggleTag={onToggleTag}
      />,
    )
    fireEvent.click(screen.getByText('Clear'))
    expect(onToggleTag).toHaveBeenCalledTimes(2)
    // forEach passes (value, index, array) — verify the first arg
    const calls = onToggleTag.mock.calls
    expect(calls[0]?.[0]).toBe('a')
    expect(calls[1]?.[0]).toBe('c')
  })

  it('calls onToggleTag when a tag is clicked', () => {
    const onToggleTag = vi.fn()
    renderWithDnd(
      <DraggableTagBar tags={['fantasy']} selectedTags={[]} onToggleTag={onToggleTag} />,
    )
    fireEvent.click(screen.getByText('fantasy'))
    expect(onToggleTag).toHaveBeenCalledWith('fantasy')
  })
})
