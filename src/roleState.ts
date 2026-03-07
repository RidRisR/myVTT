import { atom } from 'tldraw'

// Role is set by the identity system when a seat is claimed.
export const currentRole = atom<'GM' | 'PL'>('currentRole', 'PL')
