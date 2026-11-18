/**
 * /api/drafts/[id] — single draft CRUD.
 *
 *   GET    /api/drafts/[id]   — fetch one
 *   PATCH  /api/drafts/[id]   — update (e.g. schedule, edit tweets, mark posted)
 *   DELETE /api/drafts/[id]   — remove
 *
 * The PATCH body accepts partial fields. If `scheduledAt` is set and status
 * is not explicitly provided, status flips to "scheduled". If `tweets` is
 * provided we recompute the hook score and engagement prediction unless
 * they are explicitly supplied.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TONE_BY_NAME, presetToRow } from '@/lib/tones'
import { scoreHook } from '@/lib/hook-score'
import { predictEngagement } from '@/lib/engagement'

export const dynamic = 'force-dynamic'

async function ensureToneRow(name: string): Promise<string | null> {
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

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  try {
    const draft = await db.draft.findUnique({
      where: { id },
      include: { tone: true },
    })
    if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ draft })
  } catch (e) {
    return NextResponse.json(
      { error: 'Database error', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.draft.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Reconstitute current tweets as string[].
  let currentTweets: string[] = []
  try {
    currentTweets = JSON.parse(existing.tweets)
  } catch {
    currentTweets = []
  }

  const data: any = {}
  if (typeof body?.title === 'string' && body.title.trim().length > 0) {
    data.title = body.title.trim()
  }
  if (Array.isArray(body?.tweets)) {
    data.tweets = JSON.stringify(body.tweets)
    // recompute hook score unless caller passed one
    data.hookScore =
      typeof body?.hookScore === 'number'
        ? body.hookScore
        : scoreHook(body.tweets[0] ?? '').score
  }
  if (typeof body?.tone === 'string') {
    data.toneId = await ensureToneRow(body.tone)
  }
  if (typeof body?.hookScore === 'number' && !Array.isArray(body?.tweets)) {
    data.hookScore = body.hookScore
  }
  if (body?.scheduledAt !== undefined) {
    if (body.scheduledAt === null) {
      data.scheduledAt = null
    } else {
      const d = new Date(body.scheduledAt)
      if (!isNaN(d.getTime())) data.scheduledAt = d
    }
  }
  if (typeof body?.status === 'string' && ['draft', 'scheduled', 'posted'].includes(body.status)) {
    data.status = body.status
  } else if (data.scheduledAt) {
    data.status = 'scheduled'
  }

  // Recompute engagement prediction if tweets/hookScore changed and caller
  // did not pass an explicit prediction.
  if (
    (Array.isArray(body?.tweets) || typeof body?.hookScore === 'number') &&
    !body?.engagementPrediction
  ) {
    const tweets = Array.isArray(body?.tweets) ? body.tweets : currentTweets
    const toneName =
      typeof body?.tone === 'string'
        ? body.tone
        : (await db.tone.findUnique({ where: { id: existing.toneId ?? '' } }))?.name ?? 'casual'
    const engagement = predictEngagement({
      tweets,
      tone: toneName,
      hookScore: data.hookScore ?? existing.hookScore,
      scheduledAt: data.scheduledAt ?? existing.scheduledAt,
    })
    data.engagementPrediction = JSON.stringify(engagement)
  }
  if (body?.engagementPrediction) {
    data.engagementPrediction = JSON.stringify(body.engagementPrediction)
  }

  try {
    const draft = await db.draft.update({
      where: { id },
      data,
      include: { tone: true },
    })
    return NextResponse.json({ draft })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to update draft', detail: (e as Error).message },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  try {
    await db.draft.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to delete draft', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
