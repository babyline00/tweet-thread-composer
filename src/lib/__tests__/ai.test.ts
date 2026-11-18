import { test, expect, describe } from 'bun:test'
import {
  buildComposeSystemPrompt,
  buildComposeUserPrompt,
  parseThreadResponse,
  getComposeProvider,
  __setComposeProviderForTest,
  type ComposeProvider,
} from '../ai'
import { TONE_BY_NAME } from '../tones'

describe('buildComposeSystemPrompt', () => {
  test('includes the tone name and label', () => {
    const tone = TONE_BY_NAME.naval
    const prompt = buildComposeSystemPrompt(tone)
    expect(prompt).toContain('naval')
    expect(prompt).toContain('Naval')
  })

  test('includes all three few-shot examples', () => {
    const tone = TONE_BY_NAME.pg
    const prompt = buildComposeSystemPrompt(tone)
    for (const ex of tone.examples) {
      expect(prompt).toContain(ex)
    }
  })

  test('encodes emoji policy from attributes', () => {
    const mb = buildComposeSystemPrompt(TONE_BY_NAME.mrbeast)
    expect(mb).toContain('Use 1-2 emojis')
    const naval = buildComposeSystemPrompt(TONE_BY_NAME.naval)
    expect(naval).toContain('No emojis')
  })

  test('mentions the 280-char limit', () => {
    const prompt = buildComposeSystemPrompt(TONE_BY_NAME.casual)
    expect(prompt).toContain('280')
  })
})

describe('buildComposeUserPrompt', () => {
  test('wraps source with a SOURCE: prefix', () => {
    const p = buildComposeUserPrompt({ source: 'my idea' })
    expect(p).toContain('SOURCE:')
    expect(p).toContain('my idea')
  })

  test('appends MAX_TWEETS when provided', () => {
    const p = buildComposeUserPrompt({ source: 'idea', maxTweets: 5 })
    expect(p).toContain('MAX_TWEETS: 5')
  })

  test('appends TARGET_HANDLE when provided', () => {
    const p = buildComposeUserPrompt({ source: 'idea', targetHandle: 'naval' })
    expect(p).toContain('TARGET_HANDLE')
    expect(p).toContain('naval')
  })

  test('omits target handle when absent', () => {
    const p = buildComposeUserPrompt({ source: 'idea' })
    expect(p).not.toContain('TARGET_HANDLE')
  })
})

describe('parseThreadResponse', () => {
  test('splits on newlines and trims', () => {
    const raw = 'first tweet\nsecond tweet\nthird tweet'
    expect(parseThreadResponse(raw)).toEqual([
      'first tweet',
      'second tweet',
      'third tweet',
    ])
  })

  test('strips leading "1/" numbering if the model adds it', () => {
    const raw = '1/ first\n2/ second\n3/ third'
    expect(parseThreadResponse(raw)).toEqual(['first', 'second', 'third'])
  })

  test('strips markdown code fences if the model adds them', () => {
    const raw = '```\nfirst\nsecond\n```'
    expect(parseThreadResponse(raw)).toEqual(['first', 'second'])
  })

  test('drops empty lines', () => {
    expect(parseThreadResponse('a\n\n\nb')).toEqual(['a', 'b'])
  })

  test('empty input → []', () => {
    expect(parseThreadResponse('')).toEqual([])
    expect(parseThreadResponse('   \n  \n')).toEqual([])
  })
})

describe('ComposeProvider (mock)', () => {
  class FixedMock implements ComposeProvider {
    async compose(args: { systemPrompt: string; userPrompt: string }): Promise<string> {
      return ['mocked-a', 'mocked-b', 'mocked-c'].join('\n')
    }
  }

  test('compose() returns the assistant text', async () => {
    __setComposeProviderForTest(new FixedMock())
    const provider = getComposeProvider()
    const out = await provider.compose({
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })
    expect(out.split('\n')).toEqual(['mocked-a', 'mocked-b', 'mocked-c'])
    __setComposeProviderForTest(null)
  })

  test('default mock provider echoes tone + source', async () => {
    // Force mock mode by injecting the bundled mock provider class via env.
    process.env.PKC_DISABLE_LLM = '1'
    __setComposeProviderForTest(null)
    // Re-resolve the provider after env flip
    // getComposeProvider reads PKC_DISABLE_LLM at first call only (cached),
    // so we clear the cache via __setComposeProviderForTest(null) first.
    const provider = getComposeProvider()
    const out = await provider.compose({
      systemPrompt: 'TONE: naval',
      userPrompt: 'SOURCE: hello world',
    })
    expect(out).toContain('naval')
    expect(out).toContain('hello world')
    delete process.env.PKC_DISABLE_LLM
    __setComposeProviderForTest(null)
  })
})
