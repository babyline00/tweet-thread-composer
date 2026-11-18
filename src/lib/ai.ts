/**
 * AI provider for the Tweet/Thread Composer.
 *
 * Wraps the z-ai-web-dev-sdk chat-completion endpoint behind a small
 * `ComposeProvider` interface so the implementation is pluggable. The
 * `ZaiProvider` issues a non-streaming completion; the `MockProvider` is a
 * deterministic offline fallback used when `PKC_DISABLE_LLM=1` or when the
 * SDK config is unavailable (e.g. in `bun test`).
 *
 * Unlike the parent project's RAG chat, this provider does NOT stream —
 * thread composition benefits from a single structured response. The
 * provider returns the raw assistant text; the caller (`/api/compose`) is
 * responsible for parsing it into a `string[]` thread.
 */

import { TONE_BY_NAME, type TonePreset } from '@/lib/tones'

export interface ComposeProvider {
  /**
   * Compose a thread. Returns the assistant text. The caller parses it into
   * individual tweets (one per line, or JSON array if the prompt succeeded).
   */
  compose(args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<string>
}

let cachedProvider: ComposeProvider | null = null

class ZaiProvider implements ComposeProvider {
  async compose(args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<string> {
    // Dynamic import so a missing config in unit-test envs does not crash
    // module-level evaluation.
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
      stream: false,
      thinking: { type: 'disabled' },
    })

    // The SDK may return either a string, a non-streaming object, or a
    // ReadableStream. For `stream: false` we expect an object.
    if (typeof completion === 'string') return completion
    if (completion && typeof (completion as any).getReader === 'function') {
      // Should not happen with stream:false, but handle defensively.
      const reader = (completion as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
      }
      return acc
    }
    const content = (completion as any)?.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    return ''
  }
}

class MockProvider implements ComposeProvider {
  async compose(args: {
    systemPrompt: string
    userPrompt: string
  }): Promise<string> {
    // Deterministic offline mock — generates a 3-tweet thread that
    // references the source and the tone, so the UI stays demoable without
    // a live LLM. Used by `bun test` and when `PKC_DISABLE_LLM=1`.
    const toneLine = args.systemPrompt
      .split('\n')
      .find((l) => l.startsWith('TONE:'))
    const tone = toneLine ? toneLine.replace('TONE:', '').trim() : 'unknown'
    const src = args.userPrompt.replace(/^SOURCE:\s*/i, '').trim().slice(0, 120)
    return [
      `[mock · ${tone}] Here is a 3-tweet thread about: "${src}"`,
      `[mock · ${tone}] Second tweet expands the hook with one concrete example so the reader keeps reading.`,
      `[mock · ${tone}] Third tweet closes with a takeaway. (Set PKC_DISABLE_LLM=0 and configure z-ai-web-dev-sdk for real threads.)`,
    ].join('\n')
  }
}

export function getComposeProvider(): ComposeProvider {
  if (cachedProvider) return cachedProvider
  if (process.env.PKC_DISABLE_LLM === '1') {
    cachedProvider = new MockProvider()
    return cachedProvider
  }
  try {
    cachedProvider = new ZaiProvider()
  } catch (e) {
    console.warn(
      '[compose] ZaiProvider unavailable, using MockProvider:',
      (e as Error).message,
    )
    cachedProvider = new MockProvider()
  }
  return cachedProvider
}

/** Test-only — inject or clear the provider. */
export function __setComposeProviderForTest(p: ComposeProvider | null) {
  cachedProvider = p
}

/**
 * Build the few-shot system prompt for the compose call.
 *
 * The prompt is the heart of the tone-sampling differentiator:
 *   1. It tells the model which tone it should adopt.
 *   2. It shows 3 example tweets in that tone (few-shot).
 *   3. It encodes the style attributes as explicit constraints
 *      (sentenceLength, vocabulary, emoji policy, hook patterns).
 *   4. It instructs the model to split into tweets at <=280 chars and to
 *      return ONE tweet per line (the caller splits on \n).
 *
 * TODO: real `@handle` sampling. We pass the optional target handle into
 * the prompt as best-effort context only — we do not fetch their tweets.
 */
export function buildComposeSystemPrompt(tone: TonePreset): string {
  const attrs = tone.attributes
  const emojiPolicy =
    attrs.emojis === 'encouraged'
      ? 'Use 1-2 emojis per tweet where natural.'
      : attrs.emojis === 'allowed'
        ? 'Emojis allowed but use sparingly (0-1 per tweet).'
        : 'No emojis.'
  const lengthPolicy =
    attrs.sentenceLength === 'short'
      ? 'Short, punchy sentences. Prefer 1-2 short sentences per tweet.'
      : attrs.sentenceLength === 'long'
        ? 'Longer, flowing sentences. Two-clause sentences are fine.'
        : 'Medium-length sentences.'
  const vocabPolicy =
    attrs.vocabulary === 'plain'
      ? 'Plain, everyday vocabulary.'
      : attrs.vocabulary === 'intellectual'
        ? 'Intellectual vocabulary; precise but accessible.'
        : attrs.vocabulary === 'technical'
          ? 'Technical vocabulary; name systems, libraries, trade-offs.'
          : 'Colloquial, conversational vocabulary; lowercase, contractions OK.'
  const hookPolicy =
    attrs.hookPatterns.length > 0
      ? `Preferred hook patterns: ${attrs.hookPatterns.join(', ')}.`
      : 'Use any strong hook pattern.'

  return [
    `TONE: ${tone.name} (${tone.label})`,
    tone.description,
    '',
    'You are a world-class ghostwriter composing a Twitter/X thread in the tone above.',
    'Style constraints (MUST follow):',
    `- ${lengthPolicy}`,
    `- ${vocabPolicy}`,
    `- ${emojiPolicy}`,
    `- ${hookPolicy}`,
    '',
    'Few-shot examples in this tone:',
    ...tone.examples.map((ex, i) => `  ${i + 1}. ${ex}`),
    '',
    'Output rules (STRICT):',
    '1. Return ONLY the thread body, one tweet per line.',
    '2. Each line MUST be <= 280 characters.',
    '3. The first line MUST be a strong hook (numbered list, question, curiosity gap, or negative hook).',
    '4. Do NOT add numbering like "1/" or "2/" — the composer adds it.',
    '5. Do NOT wrap the response in markdown code fences.',
    '6. Aim for 3-8 tweets per thread unless the user asks for more.',
  ].join('\n')
}

/** Build the user prompt — source text + optional target handle for tone sampling. */
export function buildComposeUserPrompt(args: {
  source: string
  maxTweets?: number
  targetHandle?: string
}): string {
  const lines: string[] = []
  lines.push('SOURCE:')
  lines.push(args.source.trim())
  if (args.targetHandle) {
    lines.push('')
    lines.push(
      `TARGET_HANDLE (best-effort tone reference — TODO: sample real tweets from @${args.targetHandle}): ` +
        args.targetHandle,
    )
  }
  if (args.maxTweets) {
    lines.push('')
    lines.push(`MAX_TWEETS: ${args.maxTweets}`)
  }
  return lines.join('\n')
}

/**
 * Parse the LLM response into a `string[]` thread.
 *
 * The model is instructed to return one tweet per line. We additionally
 * strip markdown code fences, leading "1/" numbering, and blank lines.
 */
export function parseThreadResponse(raw: string): string[] {
  let text = (raw ?? '').trim()
  // Strip ``` fences if the model added them despite instructions.
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim()
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(/^\d+\/\s*/, '').trim()) // strip "1/" prefixes
    .filter((l) => l.length > 0)
  return lines
}

/** Convenience — look up a TonePreset by name (returns null if unknown). */
export function lookupTone(name: string): TonePreset | null {
  return TONE_BY_NAME[name] ?? null
}
