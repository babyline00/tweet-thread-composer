import { test, expect, describe } from 'bun:test'
import { scoreHook, HOOK_BASE } from '../hook-score'

describe('scoreHook — spec target cases', () => {
  test('"7 ways to learn TypeScript fast" → 80-100 (numbered + sweet-spot length)', () => {
    const r = scoreHook('7 ways to learn TypeScript fast')
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.score).toBeLessThanOrEqual(100)
    // Should have a numbered-list +20 in the breakdown
    expect(r.breakdown.some((b) => b.rule === 'numbered-list' && b.delta === +20)).toBe(true)
  })

  test('"Stop using console.log in production." → 70-90 (negative + strong verb + sweet-spot)', () => {
    const r = scoreHook('Stop using console.log in production.')
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.score).toBeLessThanOrEqual(90)
    expect(r.breakdown.some((b) => b.rule === 'negative-hook')).toBe(true)
    expect(r.breakdown.some((b) => b.rule === 'strong-verb')).toBe(true)
  })

  test('"I love programming :)" → 30-50 (length penalty, no boosts)', () => {
    const r = scoreHook('I love programming :)')
    expect(r.score).toBeGreaterThanOrEqual(30)
    expect(r.score).toBeLessThanOrEqual(50)
  })

  test('all-caps shouting thread → 0-30 (caps penalty dominates)', () => {
    const r = scoreHook('A THREAD ABOUT WHY I LOVE PROGRAMMING AND YOU SHOULD TOO')
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(30)
    expect(r.breakdown.some((b) => b.rule === 'all-caps-penalty' && b.delta === -40)).toBe(true)
  })
})

describe('scoreHook — URL penalty', () => {
  test('URL in first tweet subtracts 10 from baseline', () => {
    const base = scoreHook('Check out this link for more context')
    const withUrl = scoreHook('Check out this link https://example.com for more context')
    expect(withUrl.score).toBeLessThanOrEqual(base.score)
    // The URL rule must be present and exactly -10
    const urlRule = withUrl.breakdown.find((b) => b.rule === 'url-in-first-tweet')
    expect(urlRule).toBeDefined()
    expect(urlRule!.delta).toBe(-10)
  })
})

describe('scoreHook — length penalties', () => {
  test('>280 chars → still in 0-100 (length penalty applies)', () => {
    const long = 'Lorem ipsum dolor sit amet '.repeat(20).trim() // ~600 chars
    expect(long.length).toBeGreaterThan(280)
    const r = scoreHook(long)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.breakdown.some((b) => b.rule === 'length-penalty')).toBe(true)
  })

  test('exactly 30 chars → sweet spot +10', () => {
    const text = '123456789012345678901234567890' // 30 chars
    expect(text.length).toBe(30)
    const r = scoreHook(text)
    expect(r.breakdown.some((b) => b.rule === 'length-sweet-spot' && b.delta === +10)).toBe(true)
  })

  test('exactly 180 chars → sweet spot +10', () => {
    const text = 'x'.repeat(180)
    const r = scoreHook(text)
    expect(r.breakdown.some((b) => b.rule === 'length-sweet-spot')).toBe(true)
  })
})

describe('scoreHook — clamping + band', () => {
  test('empty string → score 0-100, base only', () => {
    const r = scoreHook('')
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  test('every score is clamped 0-100', () => {
    const samples = [
      '',
      'a',
      'A THREAD',
      '7 things',
      'Why?',
      'Here is why this matters and you will not believe what happened next',
      'https://x.com',
      'x'.repeat(400),
    ]
    for (const s of samples) {
      const r = scoreHook(s)
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
  })

  test('band is green for high scores', () => {
    const r = scoreHook('7 ways to learn TypeScript fast')
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.band).toBe('green')
  })

  test('band is red for caps-penalty tweets', () => {
    const r = scoreHook('A THREAD ABOUT WHY I LOVE PROGRAMMING AND YOU SHOULD TOO')
    expect(r.band).toBe('red')
  })

  test('band is yellow for mediocre tweets', () => {
    const r = scoreHook('I love programming :)')
    expect(r.band).toBe('yellow')
  })
})

describe('scoreHook — breakdown metadata', () => {
  test('breakdown items have rule and delta', () => {
    const r = scoreHook('Stop doing that thing you do every day.')
    for (const b of r.breakdown) {
      expect(typeof b.rule).toBe('string')
      expect(typeof b.delta).toBe('number')
    }
  })

  test('HOOK_BASE is 50', () => {
    expect(HOOK_BASE).toBe(50)
  })

  test('question hook adds +15', () => {
    const r = scoreHook('Why do most startups fail before their second year?')
    expect(r.breakdown.some((b) => b.rule === 'question' && b.delta === +15)).toBe(true)
  })

  test('curiosity-gap adds +10', () => {
    const r = scoreHook('Here is why most startups fail before their second year')
    expect(r.breakdown.some((b) => b.rule === 'curiosity-gap' && b.delta === +10)).toBe(true)
  })
})
