import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { Character } from '../shared/characterTypes'

function readCharacters(yChars: Y.Map<Character>): Character[] {
  const chars: Character[] = []
  yChars.forEach((char) => chars.push({
    ...char,
    featured: char.featured ?? true,  // backward compat: existing chars stay visible
  }))
  return chars
}

export function useCharacters(yDoc: Y.Doc) {
  const yCharacters = yDoc.getMap<Character>('characters')
  const [characters, setCharacters] = useState<Character[]>(() => readCharacters(yCharacters))

  useEffect(() => {
    setCharacters(readCharacters(yCharacters))
    const observer = () => setCharacters(readCharacters(yCharacters))
    yCharacters.observe(observer)
    return () => yCharacters.unobserve(observer)
  }, [yCharacters])

  const addCharacter = (char: Character) => {
    yCharacters.set(char.id, char)
  }

  const updateCharacter = (id: string, updates: Partial<Character>) => {
    const existing = yCharacters.get(id)
    if (existing) {
      yCharacters.set(id, { ...existing, ...updates })
    }
  }

  const deleteCharacter = (id: string) => {
    yCharacters.delete(id)
  }

  const getCharacter = (id: string | null): Character | null => {
    if (!id) return null
    return yCharacters.get(id) ?? null
  }

  return { characters, addCharacter, updateCharacter, deleteCharacter, getCharacter }
}
