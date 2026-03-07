import { atom } from 'tldraw'
import type { PanelId } from './sidebar/SidebarIconBar'

// Role is set by the identity system when a seat is claimed.
export const currentRole = atom<'GM' | 'PL'>('currentRole', 'PL')

// Active sidebar panel, shared between tldraw components and SidebarLayout.
export const activePanel = atom<PanelId | null>('activePanel', null)

// Token property popover open state.
export const tokenPopoverOpen = atom<boolean>('tokenPopoverOpen', false)
