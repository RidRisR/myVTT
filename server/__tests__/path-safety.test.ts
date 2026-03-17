import { describe, it, expect } from 'vitest'
import path from 'path'
import { safePath } from '../db'

describe('safePath', () => {
  const base = '/data/rooms'

  it('allows a normal sub-path', () => {
    const result = safePath(base, 'abc123')
    expect(result).toBe(path.resolve(base, 'abc123'))
  })

  it('allows nested sub-paths', () => {
    const result = safePath(base, 'abc123', 'uploads', 'file.png')
    expect(result).toBe(path.resolve(base, 'abc123', 'uploads', 'file.png'))
  })

  it('rejects ../ traversal', () => {
    expect(() => safePath(base, '../../etc')).toThrow('Path traversal detected')
  })

  it('rejects ../ in nested segments', () => {
    expect(() => safePath(base, 'abc', '..', '..', 'etc')).toThrow('Path traversal detected')
  })

  it('rejects traversal that escapes base by one level', () => {
    expect(() => safePath(base, '..')).toThrow('Path traversal detected')
  })

  it('allows base directory itself', () => {
    const result = safePath(base)
    expect(result).toBe(path.resolve(base))
  })

  it('allows . (current dir) as segment', () => {
    const result = safePath(base, '.', 'abc123')
    expect(result).toBe(path.resolve(base, 'abc123'))
  })
})
