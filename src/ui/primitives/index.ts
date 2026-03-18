// Radix primitive wrappers with built-in pitfall protection.
// All overlay consumers should import from here, never directly from @radix-ui/*.

// ─── Popover ──────────────────────────────────────────────
export {
  Root as PopoverRoot,
  Trigger as PopoverTrigger,
  Anchor as PopoverAnchor,
} from '@radix-ui/react-popover'
export { PopoverContent } from './PopoverContent'

// ─── Context Menu ─────────────────────────────────────────
export {
  Root as ContextMenuRoot,
  Trigger as ContextMenuTrigger,
} from '@radix-ui/react-context-menu'
export { ContextMenuContent } from './ContextMenuContent'
export { ContextMenuItem } from './ContextMenuItem'

// ─── Dropdown Menu ────────────────────────────────────────
export {
  Root as DropdownMenuRoot,
  Trigger as DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu'
export { DropdownMenuContent } from './DropdownMenuContent'
export { DropdownMenuItem } from './DropdownMenuItem'
