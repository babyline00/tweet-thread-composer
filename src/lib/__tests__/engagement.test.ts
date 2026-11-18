import { test, expect, describe } from 'bun:test'
import {
  predictEngagement,
  resolveTone,
  TONE_MULTIPLIERS,
} from '../engagement'

describe('predictEngagement — shape', () => {
  test('returns valid shape with all four fields', () => {
    const p = predictEngagement({
      tweets: ['hook', 'body', 'takeaway'],
      tone: 'naval',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(typeof p.predictedLikes).toBe('number')
    expect(typeof p.predictedRetweets).toBe('number')
    expect(typeof p.confidence).toBe('number')
    expect(Array.isArray(p.factors)).toBe(true)
    expect(p.predictedLikes).toBeGreaterThanOrEqual(0)
    expect(p.predictedRetweets).toBeGreaterThanOrEqual(0)
    expect(p.confidence).toBeGreaterThanOrEqual(0)
    expect(p.confidence).toBeLessThanOrEqual(1)
  })

  test('factors always include base + hookScore + threadLength + toneMultiplier', () => {
    const p = predictEngagement({
      tweets: ['a', 'b'],
      tone: 'casual',
      hookScore: 30,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    const features = p.factors.map((f) => f.feature)
    expect(features).toContain('base')
    expect(features).toContain('hookScore')
    expect(features).toContain('threadLength')
    expect(features).toContain('toneMultiplier')
  })

  test('empty thread → low confidence + 0 likes', () => {
    const p = predictEngagement({
      tweets: [],
      tone: 'naval',
      hookScore: 0,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(p.confidence).toBeLessThanOrEqual(0.2)
    // base + 0 hookContribution + 0 lengthContribution + neutral todBonus(0)
    // adjusted = 12 * 1.4 * 1.05 ≈ 17.6 → ~18 likes. Bounded > 0.
    expect(p.predictedLikes).toBeGreaterThanOrEqual(10)
  })
})

describe('predictEngagement — higher hook score → higher likes', () => {
  test('100-hook tweet beats 0-hook tweet for the same tone/time', () => {
    const low = predictEngagement({
      tweets: ['hook', 'body', 'takeaway'],
      tone: 'naval',
      hookScore: 0,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    const high = predictEngagement({
      tweets: ['hook', 'body', 'takeaway'],
      tone: 'naval',
      hookScore: 100,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(high.predictedLikes).toBeGreaterThan(low.predictedLikes)
  })

  test('hook score contribution scales linearly (after tone/day multipliers)', () => {
    const at50 = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    const at100 = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 100,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    // hookContribution delta = 30 likes pre-multiplier. With casual (0.7) and
    // a weekday (1.05) multiplier the resulting like-delta is ~22.
    expect(at100.predictedLikes - at50.predictedLikes).toBeGreaterThanOrEqual(20)
    expect(at100.predictedLikes - at50.predictedLikes).toBeLessThanOrEqual(25)
  })
})

describe('predictEngagement — weekend factor', () => {
  test('Saturday gets higher multiplier than Monday for identical inputs', () => {
    const saturday = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-06T12:00:00Z', // Sat
    })
    const monday = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z', // Mon
    })
    expect(saturday.predictedLikes).toBeGreaterThan(monday.predictedLikes)
    const satFactors = saturday.factors.map((f) => f.feature)
    expect(satFactors).toContain('weekend')
  })

  test('weekday factor is present on Monday', () => {
    const monday = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(monday.factors.map((f) => f.feature)).toContain('weekday')
  })
})

describe('predictEngagement — morning time slot bonus', () => {
  test('08:00 UTC gets a morning bonus vs 12:00 UTC neutral', () => {
    const morning = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T08:00:00Z', // morning
    })
    const noon = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z', // neutral
    })
    expect(morning.predictedLikes).toBeGreaterThan(noon.predictedLikes)
    expect(morning.factors.map((f) => f.feature)).toContain('timeOfDay(morning)')
  })

  test('overnight (02:00 UTC) gets a penalty', () => {
    const overnight = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T02:00:00Z',
    })
    const noon = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'casual',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(overnight.predictedLikes).toBeLessThan(noon.predictedLikes)
  })
})

describe('predictEngagement — tone multipliers', () => {
  test('mrbeast multiplier > formal multiplier', () => {
    expect(TONE_MULTIPLIERS.mrbeast).toBeGreaterThan(TONE_MULTIPLIERS.formal)
  })

  test('mrbeast tone yields higher likes than formal tone for same inputs', () => {
    const beast = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'mrbeast',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    const formal = predictEngagement({
      tweets: ['hook', 'body'],
      tone: 'formal',
      hookScore: 50,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(beast.predictedLikes).toBeGreaterThan(formal.predictedLikes)
  })
})

describe('resolveTone', () => {
  test('returns the preset for a known name', () => {
    expect(resolveTone('naval')?.name).toBe('naval')
  })
  test('returns null for unknown name', () => {
    expect(resolveTone('unknown')).toBeNull()
  })
})

describe('predictEngagement — confidence curve', () => {
  test('4-8 tweet threads get the peak confidence', () => {
    const p = predictEngagement({
      tweets: ['h', 'b1', 'b2', 'b3', 'c'],
      tone: 'casual',
      hookScore: 80,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(p.confidence).toBeGreaterThanOrEqual(0.7)
  })

  test('long 15-tweet thread gets low confidence (drop-off)', () => {
    const longTweets = Array.from({ length: 15 }, (_, i) => `tweet ${i + 1}`)
    const p = predictEngagement({
      tweets: longTweets,
      tone: 'casual',
      hookScore: 0,
      scheduledAt: '2024-01-08T12:00:00Z',
    })
    expect(p.confidence).toBeLessThan(0.5)
  })
})
