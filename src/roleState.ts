import { atom } from 'tldraw'

export const currentRole = atom<'GM' | 'PL'>('currentRole', 'GM')
