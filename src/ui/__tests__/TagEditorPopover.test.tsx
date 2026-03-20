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

  it('shows user tags as pills when open, filtering out auto-tags', () => {
    render(
      <TagEditorPopover
        tags={['map', 'fantasy', 'token', 'dark']}
        allKnownTags={['fantasy', 'dark', 'forest']}
        onTagsChange={vi.fn()}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    // user tags should be visible
    expect(screen.getByText('fantasy')).toBeInTheDocument()
    expect(screen.getByText('dark')).toBeInTheDocument()
    // auto-tags should NOT be rendered as pills
    expect(screen.queryByText('map')).not.toBeInTheDocument()
    expect(screen.queryByText('token')).not.toBeInTheDocument()
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

  it('does not add auto-tags', () => {
    const onTagsChange = vi.fn()
    render(
      <TagEditorPopover
        tags={[]}
        allKnownTags={[]}
        onTagsChange={onTagsChange}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    const input = screen.getByPlaceholderText('Type to add tag...')
    fireEvent.change(input, { target: { value: 'map' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTagsChange).not.toHaveBeenCalled()
  })

  it('shows "No tags" when no user tags exist', () => {
    render(
      <TagEditorPopover
        tags={['map']}
        allKnownTags={[]}
        onTagsChange={vi.fn()}
        defaultOpen
      >
        <button>trigger</button>
      </TagEditorPopover>,
    )
    expect(screen.getByText('No tags')).toBeInTheDocument()
  })
})
