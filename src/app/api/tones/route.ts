/**
 * GET /api/tones — return the 6 hardcoded tone presets.
 *
 * Pure read from `src/lib/tones.ts`. No DB hit. The presets are also mirrored
 * into the Prisma `Tone` table on demand (lazy seed) when a draft is saved
 * with a tone — this endpoint just returns the in-memory source of truth.
 */
import { NextResponse } from 'next/server'
import { TONE_PRESETS } from '@/lib/tones'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ tones: TONE_PRESETS })
}
