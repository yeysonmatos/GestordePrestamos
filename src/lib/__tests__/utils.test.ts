import { describe, it, expect } from 'vitest'
import { normalizeDocument } from '../utils'

describe('normalizeDocument', () => {
  it('vacío o nulo → null', () => {
    expect(normalizeDocument('')).toBeNull()
    expect(normalizeDocument('   ')).toBeNull()
    expect(normalizeDocument(null)).toBeNull()
    expect(normalizeDocument(undefined)).toBeNull()
  })
  it('rellenos sin valor (ceros/guiones) → null', () => {
    expect(normalizeDocument('000000000')).toBeNull()
    expect(normalizeDocument('000-0000000-0')).toBeNull()
  })
  it('documento real se conserva sin espacios extremos', () => {
    expect(normalizeDocument(' 402-1234567-8 ')).toBe('402-1234567-8')
    expect(normalizeDocument('00112345678')).toBe('00112345678')
  })
})
