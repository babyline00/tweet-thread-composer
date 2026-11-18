/**
 * POST /api/compose — LLM-assisted thread composition with tone few-shot.
 *
 * Body: { source: string, tone: string, maxTweets?: number, targetHandle?: string }
 * Returns: { tweets: string[], tone: string, provider: 'zai'|'mock' }
 *
 * The route builds a few-shot system prompt from the tone preset, calls the
 * configured ComposeProvider, then parses the response into a thread (one
 * tweet per line, filtered, trimmed). If the LLM returns a single tweet
 * longer than 280 chars, we fall back to the deterministic splitter.
 */
import { NextResponse } from 'next/server'
import {
  buildComposeSystemPrompt,
  buildComposeUserPrompt,
  getComposeProvider,
  lookupTone,
  parseThreadResponse,
} from '@/lib/ai'
import { TONE_BY_NAME } from '@/lib/tones'
import { splitByLength } from '@/lib/thread-splitter'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const source = typeof body?.source === 'string' ? body.source.trim() : ''
  const toneName = typeof body?.tone === 'string' ? body.tone : 'casual'
  const maxTweets = typeof body?.maxTweets === 'number' ? body.maxTweets : undefined
  const targetHandle =
    typeof body?.targetHandle === 'string' ? body.targetHandle : undefined

  if (source.length === 0) {
    return NextResponse.json(
      { error: 'source is required' },
      { status: 400 },
    )
  }
  const tone = lookupTone(toneName) ?? TONE_BY_NAME.casual
  if (!tone) {
    return NextResponse.json({ error: 'unknown tone' }, { status: 400 })
  }

  const provider = getComposeProvider()
  const isMock = (provider as any).constructor?.name === 'MockProvider'
  const systemPrompt = buildComposeSystemPrompt(tone)
  const userPrompt = buildComposeUserPrompt({ source, maxTweets, targetHandle })

  let raw = ''
  try {
    raw = await provider.compose({ systemPrompt, userPrompt })
  } catch (e) {
    console.warn('[compose] provider threw, returning empty thread:', (e as Error).message)
    raw = ''
  }

  let tweets = parseThreadResponse(raw)
  // Fallback: if the model returned one giant blob > 280 chars, autosplit it.
  if (tweets.length === 1 && tweets[0].length > 280) {
    tweets = splitByLength(tweets[0], 280)
  }
  // Honor maxTweets if provided.
  if (maxTweets && tweets.length > maxTweets) {
    tweets = tweets.slice(0, maxTweets)
  }

  return NextResponse.json({
    tweets,
    tone: tone.name,
    provider: isMock ? 'mock' : 'zai',
  })
}
