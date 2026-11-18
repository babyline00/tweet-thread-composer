import { test, expect, describe } from 'bun:test'
import {
  splitByLength,
  splitWithMeta,
  isCleanSplit,
  TWEET_MAX,
} from '../thread-splitter'

describe('splitByLength — boundary cases', () => {
  test('empty string → []', () => {
    expect(splitByLength('')).toEqual([])
  })

  test('whitespace-only string → []', () => {
    expect(splitByLength('    \n\t  ')).toEqual([])
  })

  test('string shorter than 280 → [text]', () => {
    const s = 'Hello world.'
    expect(s.length).toBeLessThan(280)
    expect(splitByLength(s)).toEqual([s])
  })

  test('string exactly 280 chars → [text] (single chunk)', () => {
    const s = 'x'.repeat(280)
    expect(s.length).toBe(280)
    expect(splitByLength(s)).toEqual([s])
  })

  test('string 281 chars → 2 chunks', () => {
    // Use words to ensure word-boundary split
    const s = ('word '.repeat(60)).trim() + ' extra' // ~300 chars
    expect(s.length).toBeGreaterThan(280)
    const chunks = splitByLength(s)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('splitByLength — long text', () => {
  test('every chunk is <= 280 chars', () => {
    const s = ('This is a sample sentence with several words. ').repeat(40)
    expect(s.length).toBeGreaterThan(1000)
    const chunks = splitByLength(s)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(280)
    }
  })

  test('no chunk is a fragment of a word (when words fit)', () => {
    const s = ('alpha bravo charlie delta echo foxtrot golf hotel india ').repeat(20)
    const chunks = splitByLength(s)
    for (const c of chunks) {
      // Each chunk's first and last non-space token should be a complete word
      // from the source.
      const first = c.trim().split(/\s+/)[0]
      const last = c.trim().split(/\s+/).pop()
      expect(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'])
        .toContain(first)
      expect(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'])
        .toContain(last)
    }
  })

  test('a single word longer than the limit is hard-split (over flag set)', () => {
    const longWord = 'x'.repeat(600)
    const chunks = splitWithMeta(longWord)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(280)
      expect(c.over).toBe(true) // every chunk came from a hard-split word
    }
  })

  test('TWEET_MAX is 280', () => {
    expect(TWEET_MAX).toBe(280)
  })
})

describe('splitWithMeta', () => {
  test('returns empty array for empty input', () => {
    expect(splitWithMeta('')).toEqual([])
  })

  test('returns single chunk for short input', () => {
    const s = 'short'
    const chunks = splitWithMeta(s)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe(s)
    expect(chunks[0].over).toBe(false)
  })

  test('start/end offsets fall within the source', () => {
    const s = ('alpha bravo ').repeat(60)
    const chunks = splitWithMeta(s)
    for (const c of chunks) {
      expect(c.start).toBeGreaterThanOrEqual(0)
      expect(c.end).toBeLessThanOrEqual(s.length)
      expect(s.slice(c.start, c.end).trim()).toBe(c.text.trim())
    }
  })
})

describe('isCleanSplit', () => {
  test('true when no word had to be hard-split', () => {
    const s = ('This is a sample sentence with several words. ').repeat(20)
    expect(isCleanSplit(s)).toBe(true)
  })

  test('false when a word exceeds the limit', () => {
    const longWord = 'x'.repeat(600)
    expect(isCleanSplit(longWord)).toBe(false)
  })
})
