/**
 * Pure-function thread autosplitter.
 *
 * `splitByLength(text, 280)` greedily packs words into chunks no longer than
 * `limit` characters, splitting only on word boundaries. It is used as the
 * deterministic fallback when the LLM-assisted rewrite is unavailable, and
 * also as the canonical chunker when the user pastes a long blob into the
 * composer.
 *
 * The LLM-assisted rewrite (in `ai.ts`) is preferred for *quality* — it can
 * restructure sentences, split at natural clause boundaries, and add thread
 * numbering — but the deterministic splitter is the source of truth for the
 * 280-char guarantee and is what the unit tests pin down.
 */

export const TWEET_MAX = 280

export interface SplitChunk {
  text: string
  /** 0-indexed position within the original text */
  start: number
  end: number
  over?: boolean
}

interface InternalChunk {
  text: string
  over: boolean
  /** byte offset within the *trimmed* source */
  start: number
}

/**
 * Core splitter — walks the trimmed source word-by-word, packing greedily
 * into chunks <= `limit` chars. When a single token is longer than `limit`,
 * it is hard-split into `limit`-sized fragments and every fragment (plus
 * the trailing leftover) is flagged `over: true` so the UI can highlight
 * the word-split.
 */
function _split(text: string, limit: number): InternalChunk[] {
  const src = (text ?? '').trim()
  if (src.length === 0) return []
  if (src.length <= limit) return [{ text: src, over: false, start: 0 }]

  const chunks: InternalChunk[] = []
  const words = src.split(/(\s+)/) // keep whitespace tokens
  let current = ''
  let currentStart = 0
  let currentOver = false
  let cursor = 0

  for (const token of words) {
    if (token.length === 0) continue

    if ((current + token).length <= limit) {
      if (current.length === 0) currentStart = cursor
      current += token
      cursor += token.length
      continue
    }

    // token would overflow current chunk — flush current first
    if (current.trim().length > 0) {
      chunks.push({ text: current.trim(), over: currentOver, start: currentStart })
      current = ''
      currentOver = false
    }

    // Now: is the token itself longer than limit? Hard-split it.
    if (token.length > limit) {
      let rest = token
      let restStart = cursor
      while (rest.length > limit) {
        chunks.push({ text: rest.slice(0, limit), over: true, start: restStart })
        rest = rest.slice(limit)
        restStart += limit
      }
      // Trailing leftover from the hard-split word — still flagged over.
      current = rest
      currentStart = restStart
      currentOver = true
      cursor = restStart + rest.length
    } else {
      current = token
      currentStart = cursor
      currentOver = false
      cursor += token.length
    }
  }
  if (current.trim().length > 0) {
    chunks.push({ text: current.trim(), over: currentOver, start: currentStart })
  }
  return chunks
}

/**
 * Split `text` into chunks of at most `limit` characters, breaking only on
 * whitespace. If a single word is longer than `limit`, it is hard-split.
 *
 * Returns `[]` for empty/whitespace-only input.
 */
export function splitByLength(text: string, limit: number = TWEET_MAX): string[] {
  return _split(text, limit).map((c) => c.text)
}

/**
 * Structured variant — returns chunks with byte offsets and an `over` flag
 * for chunks that came from a hard-split word (no word boundary). Useful
 * for the UI to highlight overflow.
 */
export function splitWithMeta(
  text: string,
  limit: number = TWEET_MAX,
): SplitChunk[] {
  return _split(text, limit).map((c) => ({
    text: c.text,
    start: c.start,
    end: c.start + c.text.length,
    over: c.over,
  }))
}

/** True if no chunk came from a hard-split word (i.e. no word exceeded the limit). */
export function isCleanSplit(text: string, limit: number = TWEET_MAX): boolean {
  return _split(text, limit).every((c) => !c.over)
}
