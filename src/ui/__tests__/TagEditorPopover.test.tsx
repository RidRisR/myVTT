import { render, screen, fireEvent } from '@testing-library/react'
import { TagEditorPopover } from '../TagEditorPopover'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}))

describe('TagEditorPopover', () => {
  it('renders children (trigger)', () => {
    render(
      <TagEditorPopover tags={[]} allKnownTags={[]} onTagsChange={vi.fn()}>
        <button>Edit Tags</button>
      </TagEditorPopover>,
    )
    expect(screen.getByText('Edit Tags')).toBeInTheDocument()
  })

  it('shows all tags as pills when open (no auto-tag filtering)', () => {
    render(
      <TagEditorPopover
        tags={['map', 'fantasy', 'dark']}
        allKnownTags={['fantasy', 'dark', 'forest']}
        onTagsChange={vi.fn()}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    // All tags are user tags now — all should be visible as pills
    expect(screen.getByText('map')).toBeInTheDocument()
    expect(screen.getByText('fantasy')).toBeInTheDocument()
    expect(screen.getByText('dark')).toBeInTheDocument()
  })

  it('calls onTagsChange when adding a tag via Enter', () => {
    const onTagsChange = vi.fn()
    render(
      <TagEditorPopover
        tags={['existing']}
        allKnownTags={['existing', 'forest']}
        onTagsChange={onTagsChange}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    const input = screen.getByPlaceholderText('Type to add tag...')
    fireEvent.change(input, { target: { value: 'new-tag' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTagsChange).toHaveBeenCalledWith(['existing', 'new-tag'])
  })

  it('does not add duplicate tags', () => {
    const onTagsChange = vi.fn()
    render(
      <TagEditorPopover
        tags={['existing']}
        allKnownTags={[]}
        onTagsChange={onTagsChange}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    const input = screen.getByPlaceholderText('Type to add tag...')
    fireEvent.change(input, { target: { value: 'existing' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTagsChange).not.toHaveBeenCalled()
  })

  it('allows adding any tag name (no auto-tag restriction)', () => {
    const onTagsChange = vi.fn()
    render(
      <TagEditorPopover tags={[]} allKnownTags={[]} onTagsChange={onTagsChange} defaultOpen>
        <button>trigger</button>
      </TagEditorPopover>,
    )
    const input = screen.getByPlaceholderText('Type to add tag...')
    fireEvent.change(input, { target: { value: 'map' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // 'map' is now a valid user tag — no longer blocked
    expect(onTagsChange).toHaveBeenCalledWith(['map'])
  })

  it('shows "No tags" when tags array is empty', () => {
    render(
      <TagEditorPopover tags={[]} allKnownTags={[]} onTagsChange={vi.fn()} defaultOpen>
        <button>trigger</button>
      </TagEditorPopover>,
    )
    expect(screen.getByText('No tags')).toBeInTheDocument()
  })
})
