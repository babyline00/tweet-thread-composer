import { test, expect, describe } from 'bun:test'
import {
  TONE_PRESETS,
  TONE_BY_NAME,
  presetToRow,
  rowToPreset,
  type TonePreset,
  type ToneAttributes,
} from '../tones'

describe('tone presets — structural integrity', () => {
  test('there are exactly 6 presets', () => {
    expect(TONE_PRESETS).toHaveLength(6)
  })

  test('every preset has a unique name', () => {
    const names = TONE_PRESETS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('every preset has at least 1 example', () => {
    for (const t of TONE_PRESETS) {
      expect(t.examples.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('every preset has at least 3 examples (per spec)', () => {
    for (const t of TONE_PRESETS) {
      expect(t.examples.length).toBeGreaterThanOrEqual(3)
    }
  })

  test('every preset has a non-empty label and description', () => {
    for (const t of TONE_PRESETS) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  test('every preset has valid attributes shape', () => {
    for (const t of TONE_PRESETS) {
      const a = t.attributes
      expect(['short', 'medium', 'long']).toContain(a.sentenceLength)
      expect(['plain', 'intellectual', 'technical', 'colloquial']).toContain(a.vocabulary)
      expect(['encouraged', 'allowed', 'forbidden']).toContain(a.emojis)
      expect(Array.isArray(a.hookPatterns)).toBe(true)
    }
  })

  test('naval preset has aphoristic short sentences + no emoji', () => {
    const naval = TONE_BY_NAME.naval
    expect(naval).toBeDefined()
    expect(naval.attributes.sentenceLength).toBe('short')
    expect(naval.attributes.emojis).toBe('forbidden')
  })

  test('mrbeast preset encourages emoji', () => {
    const mb = TONE_BY_NAME.mrbeast
    expect(mb).toBeDefined()
    expect(mb.attributes.emojis).toBe('encouraged')
  })

  test('TONE_BY_NAME keys match preset names', () => {
    for (const t of TONE_PRESETS) {
      expect(TONE_BY_NAME[t.name]).toBe(t)
    }
  })
})

describe('preset <-> row serialization', () => {
  test('presetToRow serializes examples and attributes to JSON strings', () => {
    for (const t of TONE_PRESETS) {
      const row = presetToRow(t)
      expect(typeof row.examples).toBe('string')
      expect(typeof row.attributes).toBe('string')
      // JSON must round-trip
      const parsed = JSON.parse(row.examples)
      expect(parsed).toEqual(t.examples)
      const parsedAttrs = JSON.parse(row.attributes)
      expect(parsedAttrs).toEqual(t.attributes)
    }
  })

  test('rowToPreset inverts presetToRow', () => {
    for (const t of TONE_PRESETS) {
      const row = presetToRow(t)
      const back = rowToPreset({ ...row, description: row.description ?? null })
      expect(back.name).toBe(t.name)
      expect(back.label).toBe(t.label)
      expect(back.description).toBe(t.description)
      expect(back.examples).toEqual(t.examples)
      expect(back.attributes).toEqual(t.attributes)
    }
  })

  test('rowToPreset tolerates broken JSON', () => {
    const back = rowToPreset({
      name: 'broken',
      label: 'Broken',
      description: null,
      examples: 'not json',
      attributes: 'also not json',
    })
    expect(back.examples).toEqual([])
    expect(back.attributes.sentenceLength).toBe('medium')
  })
})
