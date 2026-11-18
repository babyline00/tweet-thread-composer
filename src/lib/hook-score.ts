/**
 * Hook-strength scorer for the first tweet of a thread.
 *
 * `scoreHook(firstTweet)` is a PURE FUNCTION (no LLM, no I/O, deterministic)
 * that returns a 0-100 score with a per-heuristic breakdown and a color band.
 *
 * Heuristics (additive, anchored at 50, clamped to [0, 100]):
 *   +20  numbered list opener        ("7 ways to ...", "3 rules for ...")
 *   +15  negative hook              ("Stop doing X", "Never ...", "Do not ...")
 *   +15  question hook              (ends in "?")
 *   +10  curiosity gap              ("... and you will not believe", "here is why", "the real reason")
 *    +5  strong verb opener         (imperative — starts with a base-form verb)
 *   +10  sweet-spot length 30-180   (Twitter hooks perform best in this band)
 *   -10  length penalty             (<30 or >180 chars — too short or too long)
 *   -40  all-caps penalty           (>60% of letters are uppercase — shouting)
 *    ±5  emoji policy               (1-2 emojis +/- depending on tone-agnostic base;
 *                                     more than 3 → -5 noise penalty)
 *   -10  URL in first tweet         (links kill open-rate)
 *
 * The score is intentionally a hand-tuned linear heuristic. It is documented
 * in the README as a toy — a production hook scorer would be a logistic
 * regression or gradient-boosted model trained on (hook, normalized engagement)
 * pairs scraped from public timelines.
 */

export interface HookBreakdownItem {
  rule: string
  delta: number
  note?: string
}

export interface HookScoreResult {
  score: number
  breakdown: HookBreakdownItem[]
  band: 'red' | 'yellow' | 'green'
}

export const HOOK_BASE = 50

const NUMBERED_RE = /^\s*(\d+)\s+/ // "7 ways...", "10 things..."
const NEGATIVE_RE =
  /\b(stop|never|do not|don't|avoid|quit|stop|refuse|fail|doomed|wrong|dead|killed?|broken?)\b/i
const CURIOSITY_RE =
  /\b(here is why|here's why|the real reason|you will not believe|you won't believe|what happened next|number \d\b|this is why|the truth about|nobody talks about)\b/i
// Imperative opener — base verb form. We keep a small seed list because a
// full part-of-speech tagger is out of scope for a pure function.
const STRONG_VERBS = new Set([
  'build', 'ship', 'launch', 'write', 'read', 'learn', 'stop', 'start',
  'avoid', 'quit', 'delete', 'refactor', 'automate', 'hire', 'fire',
  'save', 'invest', 'buy', 'sell', 'track', 'measure', 'cache', 'optimize',
  'debug', 'profile', 'test', 'document', 'open', 'close', 'pause',
  'cancel', 'schedule', 'plan', 'review', 'rewrite', 'replace',
])

function letterCount(s: string): number {
  let n = 0
  for (const ch of s) {
    if (/[a-zA-Z]/.test(ch)) n++
  }
  return n
}

function upperLetterCount(s: string): number {
  let n = 0
  for (const ch of s) {
    if (/[A-Z]/.test(ch)) n++
  }
  return n
}

function emojiCount(s: string): number {
  // Cheap emoji matcher — covers most BMP emoji and a few dingbats. Not
  // exhaustive; good enough for the heuristic.
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu
  return (s.match(emojiRe) ?? []).length
}

function hasUrl(s: string): boolean {
  return /\bhttps?:\/\//i.test(s) || /\bwww\./i.test(s) || /\b\w+\.(com|io|org|net|app|dev)\b/i.test(s)
}

/**
 * Compute the hook score for a single tweet (the first tweet of a thread).
 *
 * Pure function — same input always yields the same output. No I/O.
 */
export function scoreHook(firstTweet: string): HookScoreResult {
  const text = (firstTweet ?? '').trim()
  const breakdown: HookBreakdownItem[] = []

  // Numbered list opener
  const numberedMatch = text.match(NUMBERED_RE)
  if (numberedMatch) {
    breakdown.push({
      rule: 'numbered-list',
      delta: +20,
      note: `opens with "${numberedMatch[0].trim()}"`,
    })
  }

  // Negative hook
  if (NEGATIVE_RE.test(text)) {
    breakdown.push({ rule: 'negative-hook', delta: +15 })
  }

  // Question
  if (text.endsWith('?') || /\?\s/.test(text)) {
    breakdown.push({ rule: 'question', delta: +15 })
  }

  // Curiosity gap
  if (CURIOSITY_RE.test(text)) {
    breakdown.push({ rule: 'curiosity-gap', delta: +10 })
  }

  // Strong verb opener — first word is a known imperative verb.
  const firstWord = (text.split(/\s+/)[0] ?? '').replace(/[^a-zA-Z]/g, '').toLowerCase()
  if (firstWord && STRONG_VERBS.has(firstWord)) {
    breakdown.push({ rule: 'strong-verb', delta: +5, note: `starts with "${firstWord}"` })
  }

  // Length band
  const len = text.length
  if (len >= 30 && len <= 180) {
    breakdown.push({ rule: 'length-sweet-spot', delta: +10, note: `${len} chars` })
  } else if (len > 0) {
    breakdown.push({ rule: 'length-penalty', delta: -10, note: `${len} chars (outside 30-180)` })
  }

  // All-caps penalty — measure fraction of letters that are uppercase.
  const letters = letterCount(text)
  if (letters >= 8) {
    const upper = upperLetterCount(text)
    const ratio = upper / letters
    if (ratio > 0.6) {
      breakdown.push({
        rule: 'all-caps-penalty',
        delta: -40,
        note: `${Math.round(ratio * 100)}% uppercase letters`,
      })
    }
  }

  // Emoji policy
  const emojis = emojiCount(text)
  if (emojis === 1 || emojis === 2) {
    breakdown.push({ rule: 'emoji-light', delta: +5, note: `${emojis} emoji` })
  } else if (emojis > 3) {
    breakdown.push({ rule: 'emoji-noise', delta: -5, note: `${emojis} emoji` })
  }

  // URL in first tweet
  if (hasUrl(text)) {
    breakdown.push({ rule: 'url-in-first-tweet', delta: -10 })
  }

  const raw =
    HOOK_BASE + breakdown.reduce((sum, b) => sum + b.delta, 0)
  const score = Math.max(0, Math.min(100, Math.round(raw)))
  const band: HookScoreResult['band'] =
    score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red'

  return { score, breakdown, band }
}
