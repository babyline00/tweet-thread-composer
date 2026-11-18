/**
 * POST /api/predict/engagement — pure-function toy engagement prediction.
 *
 * Body: { tweets: string[], tone: string, hookScore?: number, scheduledAt?: string }
 * Returns: { predictedLikes, predictedRetweets, confidence, factors }
 *
 * Toy linear heuristic — documented as such. See `src/lib/engagement.ts`.
 */
import { NextResponse } from 'next/server'
import { predictEngagement } from '@/lib/engagement'
import { scoreHook } from '@/lib/hook-score'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const tweets: string[] = Array.isArray(body?.tweets) ? body.tweets : []
  const tone = typeof body?.tone === 'string' ? body.tone : 'casual'
  // hookScore is optional — if absent, we compute it from the first tweet.
  let hookScore = typeof body?.hookScore === 'number' ? body.hookScore : 0
  if (typeof body?.hookScore !== 'number' && tweets.length > 0) {
    hookScore = scoreHook(tweets[0]).score
  }
  const scheduledAt = body?.scheduledAt ?? null
  const result = predictEngagement({ tweets, tone, hookScore, scheduledAt })
  return NextResponse.json(result)
}
