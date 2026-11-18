/**
 * POST /api/score/hook — pure-function hook-strength score.
 *
 * Body: { firstTweet: string }
 * Returns: { score: number, breakdown: HookBreakdownItem[], band: 'red'|'yellow'|'green' }
 *
 * No LLM, no I/O, deterministic. Same input always yields the same output.
 */
import { NextResponse } from 'next/server'
import { scoreHook } from '@/lib/hook-score'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }
  const firstTweet = typeof body?.firstTweet === 'string' ? body.firstTweet : ''
  const result = scoreHook(firstTweet)
  return NextResponse.json(result)
}
