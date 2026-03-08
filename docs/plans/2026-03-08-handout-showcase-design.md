# Handout Showcase Integration Design

## Goal
GM can upload images to a handout asset library, package them with title/description, and one-click showcase them to all players.

## Data Model

```typescript
interface HandoutAsset {
  id: string
  title: string
  imageUrl: string
  description: string   // optional rich text
  createdAt: number
}
```

Yjs storage: `yDoc.getMap<HandoutAsset>('handout_assets')`

## Interaction Flow

### Upload
1. GM clicks "Add" in Handouts tab of BottomDock
2. File picker opens, GM selects an image
3. Image uploads to server via existing `uploadAsset()` flow
4. Edit modal appears with:
   - Image preview
   - Title field (pre-filled with filename, sans extension)
   - Description field (optional)
   - Confirm / Cancel buttons
5. On confirm: HandoutAsset written to Yjs `handout_assets` map

### Edit
- Each handout card in the dock has an edit button (pencil icon)
- Clicking it opens the same edit modal, pre-filled with existing data
- On confirm: updates the HandoutAsset in Yjs

### Showcase (展示)
- GM single-clicks a handout card in the dock
- Immediately creates a ShowcaseItem from the HandoutAsset and writes to `showcase_items`
- All clients see it appear in ShowcaseOverlay with entrance animation

### Delete
- Each handout card has a delete button
- Removes from Yjs `handout_assets` map + deletes file from server

## Components

### New
- `src/dock/HandoutDockTab.tsx` — grid of handout cards in BottomDock
- `src/dock/HandoutEditModal.tsx` — upload/edit modal with preview + title + description

### Modified
- `src/dock/BottomDock.tsx` — add `'handouts'` tab
- `src/App.tsx` — pass handout-related props to BottomDock

### Reused
- `src/shared/assetUpload.ts` — file upload
- `src/showcase/useShowcase.ts` — addItem to trigger showcase
- `src/showcase/ShowcaseOverlay.tsx` — display (already supports image type)

## UI Layout

### HandoutDockTab
- Same grid pattern as MapDockTab: `repeat(auto-fill, minmax(100px, 1fr))`
- Each card: thumbnail (70px) + title label below
- Hover: show edit (pencil) and delete (x) buttons
- Click card: push to showcase

### HandoutEditModal
- Fixed overlay, centered, dark glass theme
- Image preview at top
- Title input + Description textarea
- Confirm + Cancel buttons at bottom
