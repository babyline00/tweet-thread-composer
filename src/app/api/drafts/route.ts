/**
 * /api/drafts — list and persist drafts.
 *
 *   GET  /api/drafts?status=draft|scheduled|posted
 *   POST /api/drafts  body: {
 *     title, tweets: string[], tone?: string,
 *     hookScore?: number, engagementPrediction?: object,
 *     scheduledAt?: string, status?: string
 *   }
 *
 * Persisting a draft with a `tone` name lazily upserts the matching `Tone`
 * row (lazy seed from `src/lib/tones.ts`) and links the draft to it via
 * `toneId`. If the tone name is unknown, `toneId` is left null.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  TONE_BY_NAME,
  presetToRow,
} from '@/lib/tones'
import { scoreHook } from '@/lib/hook-score'
import { predictEngagement } from '@/lib/engagement'

export const dynamic = 'force-dynamic'

/** Lazy-seed the Tone row for a preset name. Returns the toneId (or null). */
async function ensureToneRow(name: string | null | undefined): Promise<string | null> {
  if (!name) return null
  const preset = TONE_BY_NAME[name]
  if (!preset) return null
  const row = await db.tone.upsert({
    where: { name: preset.name },
    create: presetToRow(preset),
    update: presetToRow(preset),
    select: { id: true },
  })
  return row.id
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const where = status ? { status } : {}
  try {
    const drafts = await db.draft.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { tone: true },
    })
    return NextResponse.json({ drafts })
  } catch (e) {
    // If the DB has not been pushed yet (first run), surface a helpful error.
    return NextResponse.json(
      { error: 'Database not initialized. Run `bun run db:push` first.', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const title = typeof body?.title === 'string' && body.title.trim().length > 0
    ? body.title.trim()
    : 'Untitled draft'
  const tweets: string[] = Array.isArray(body?.tweets) ? body.tweets : []
  if (tweets.length === 0) {
    return NextResponse.json({ error: 'tweets must be a non-empty array' }, { status: 400 })
  }

  // hookScore — accept a passed-in value or compute from tweets[0].
  let hookScore = typeof body?.hookScore === 'number' ? body.hookScore : scoreHook(tweets[0] ?? '').score
  // engagementPrediction — accept passed-in or compute.
  let engagement: any = body?.engagementPrediction
  if (!engagement) {
    engagement = predictEngagement({
      tweets,
      tone: typeof body?.tone === 'string' ? body.tone : 'casual',
      hookScore,
      scheduledAt: body?.scheduledAt ?? null,
    })
  }

  const toneId = await ensureToneRow(body?.tone ?? null)
  const status = ['draft', 'scheduled', 'posted'].includes(body?.status)
    ? body.status
    : body?.scheduledAt
      ? 'scheduled'
      : 'draft'

  try {
    const draft = await db.draft.create({
      data: {
        title,
        tweets: JSON.stringify(tweets),
        toneId,
        hookScore,
        engagementPrediction: JSON.stringify(engagement),
        status,
        scheduledAt: body?.scheduledAt ? new Date(body.scheduledAt) : null,
      },
      include: { tone: true },
    })
    return NextResponse.json({ draft })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to persist draft', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
