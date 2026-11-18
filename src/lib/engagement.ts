/**
 * Toy engagement-prediction model — pure function, no LLM.
 *
 * `predictEngagement(...)` is a hand-tuned linear combination of features:
 *   - hookScore          (0-100)
 *   - threadLength       (number of tweets in the thread)
 *   - toneMultiplier     (per-tone base engagement coefficient)
 *   - timeOfDayBonus     (UTC hour of scheduledAt → morning/evening bonus)
 *   - weekendBonus       (+1 on Sat/Sun, 0 on weekdays — toy social signal)
 *   - weekdayBonus       (small weekday bonus to balance)
 *
 * Returns:
 *   {
 *     predictedLikes:    number,
 *     predictedRetweets: number,
 *     confidence:        0-1     (a hand-tuned U-curve: low for tiny/long
 *                                threads, peaks around 4-8 tweets),
 *     factors:           { feature: weight }[]  // for the UI breakdown
 *   }
 *
 * IMPORTANT — toy heuristic.
 * This is a hand-tuned linear function with made-up coefficients, NOT a
 * trained model. A real engagement predictor would be a Poisson/negative-
 * binomial regression (or gradient-boosted trees) trained on (features,
 * log(likes), log(retweets)) tuples pulled from the creator's own historical
 * tweets via the X API. Documented in the README as a known limitation.
 */

import { TONE_BY_NAME, type TonePreset } from '@/lib/tones'

export interface EngagementFactors {
  feature: string
  weight: number
}

export interface EngagementPrediction {
  predictedLikes: number
  predictedRetweets: number
  confidence: number
  factors: EngagementFactors[]
}

/** Per-tone base engagement multipliers — toys, hand-tuned. */
export const TONE_MULTIPLIERS: Record<string, number> = {
  naval: 1.4, // high-RT ratio (wisdom gets reshared)
  pg: 1.2,
  mrbeast: 1.8, // highest raw engagement floor
  technical: 0.9,
  casual: 0.7,
  formal: 0.5,
}

interface PredictArgs {
  tweets: string[]
  tone: string
  hookScore: number
  /** Optional scheduled time — defaults to "now" if absent. */
  scheduledAt?: Date | string | null
}

function toDate(x: Date | string | null | undefined): Date | null {
  if (!x) return null
  if (x instanceof Date) return x
  const d = new Date(x)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Compute a toy engagement prediction.
 *
 * Pure function — no I/O, deterministic for the same inputs.
 */
export function predictEngagement(args: PredictArgs): EngagementPrediction {
  const { tweets, tone, hookScore } = args
  const threadLength = Array.isArray(tweets) ? tweets.length : 0
  const toneMult = TONE_MULTIPLIERS[tone] ?? 1.0

  const factors: EngagementFactors[] = []

  // Base — every tweet starts from a floor.
  const base = 12
  factors.push({ feature: 'base', weight: base })

  // Hook score contribution — 0-100 scaled to 0-60 likes.
  const hookContribution = (clamp(hookScore, 0, 100) / 100) * 60
  factors.push({ feature: 'hookScore', weight: Math.round(hookContribution) })

  // Thread length — longer threads get more engagement up to ~6 tweets,
  // then decline (people drop off).
  let lengthContribution: number
  if (threadLength <= 0) lengthContribution = 0
  else if (threadLength <= 6) lengthContribution = threadLength * 8
  else lengthContribution = 48 - (threadLength - 6) * 4
  lengthContribution = Math.max(0, lengthContribution)
  factors.push({ feature: 'threadLength', weight: Math.round(lengthContribution) })

  // Tone multiplier — applied as a multiplicative factor baked into the sum.
  factors.push({ feature: 'toneMultiplier', weight: toneMult })

  // Time of day — morning (7-10 UTC) and evening (18-22 UTC) get a bonus.
  const scheduled = toDate(args.scheduledAt) ?? new Date()
  const hour = scheduled.getUTCHours()
  let todBonus = 0
  if (hour >= 7 && hour <= 10) {
    todBonus = 15
    factors.push({ feature: 'timeOfDay(morning)', weight: todBonus })
  } else if (hour >= 18 && hour <= 22) {
    todBonus = 12
    factors.push({ feature: 'timeOfDay(evening)', weight: todBonus })
  } else if (hour >= 0 && hour <= 5) {
    todBonus = -8
    factors.push({ feature: 'timeOfDay(overnight)', weight: todBonus })
  } else {
    factors.push({ feature: 'timeOfDay(neutral)', weight: 0 })
  }

  // Weekend bonus — Sat/Sun get +1x-ish signal; weekday small bonus to balance.
  const day = scheduled.getUTCDay() // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6
  if (isWeekend) {
    factors.push({ feature: 'weekend', weight: 1.15 })
  } else {
    factors.push({ feature: 'weekday', weight: 1.05 })
  }
  const dayMultiplier = isWeekend ? 1.15 : 1.05

  // Combine — linear sum, then apply multiplicative factors.
  const linear =
    base + hookContribution + lengthContribution + todBonus
  const adjusted = linear * toneMult * dayMultiplier
  const predictedLikes = Math.max(0, Math.round(adjusted))
  // Retweets are ~10-20% of likes; high-hook tweets lean higher.
  const rtRatio = 0.1 + (clamp(hookScore, 0, 100) / 100) * 0.1
  const predictedRetweets = Math.max(0, Math.round(predictedLikes * rtRatio))

  // Confidence — U-curve over thread length, peaks at 4-8.
  let confidence: number
  if (threadLength === 0) {
    confidence = 0.1
  } else if (threadLength >= 4 && threadLength <= 8) {
    confidence = 0.7
  } else if (threadLength <= 12) {
    confidence = 0.5
  } else {
    confidence = 0.25
  }
  // Hook score moves confidence a bit too.
  confidence = clamp(confidence + (hookScore / 100) * 0.15, 0, 0.95)

  return {
    predictedLikes,
    predictedRetweets,
    confidence: Math.round(confidence * 100) / 100,
    factors,
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Convenience — look up the TonePreset for a tone name (returns null if unknown). */
export function resolveTone(name: string): TonePreset | null {
  return TONE_BY_NAME[name] ?? null
}
