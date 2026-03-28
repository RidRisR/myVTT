// src/shared/componentTypes.ts
// Central type map: component key → value type. Plugins extend via module augmentation.
import type { CoreIdentity, CoreToken, CoreNotes } from './coreComponents'

export interface ComponentTypeMap {
  'core:identity': CoreIdentity
  'core:token': CoreToken
  'core:notes': CoreNotes
}
