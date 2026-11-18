/**
 * Tone presets for the Tweet/Thread Composer.
 *
 * Six hardcoded tones — Naval, Paul Graham, MrBeast viral, Technical, Casual,
 * Formal — each with a label, description, three example tweets and a JSON
 * blob of style attributes (sentenceLength, vocabulary, emojis, hookPatterns).
 *
 * The presets are the single source of truth for both the UI picker and the
 * `GET /api/tones` endpoint. They are also mirrored into the Prisma `Tone`
 * table on demand (lazy seed) so drafts can reference a real tone row.
 *
 * TODO: real `@handle` sampling. The current implementation only sends the
 * target handle as best-effort context inside the LLM prompt — we do NOT
 * fetch their actual recent tweets or run any NLP on their style. Real
 * sampling would call the X (Twitter) API v2 `GET /2/users/:id/tweets`,
 * pull the last 200 tweets, and fit a style profile (sentence length
 * distribution, top-20 vocabulary, emoji frequency, hook pattern classes).
 */

export interface ToneAttributes {
  /** "short" | "medium" | "long" — target sentence length per tweet */
  sentenceLength: 'short' | 'medium' | 'long'
  /** "plain" | "intellectual" | "technical" | "colloquial" — vocabulary register */
  vocabulary: 'plain' | 'intellectual' | 'technical' | 'colloquial'
  /** Whether emojis are encouraged, allowed, or forbidden */
  emojis: 'encouraged' | 'allowed' | 'forbidden'
  /** Hook patterns this tone leans on — used by hook-score heuristics for context */
  hookPatterns: string[]
}

export interface TonePreset {
  /** Stable machine name, used as Prisma `Tone.name` */
  name: string
  /** Human-readable label shown in the picker */
  label: string
  /** Short description for the picker card */
  description: string
  /** Three example tweets in this tone */
  examples: string[]
  /** Style attributes — serialized to JSON when persisted */
  attributes: ToneAttributes
}

export const TONE_PRESETS: TonePreset[] = [
  {
    name: 'naval',
    label: 'Naval',
    description:
      'Aphoristic, contrarian, wealth-and-happiness epigrams. Short, declarative, almost no emoji.',
    examples: [
      'Seek wealth, not money or status. Wealth is having assets that earn while you sleep.',
      'You will get rich by giving society what it wants but does not yet know how to get.',
      'Happiness is a skill you cultivate by wanting less, not acquiring more.',
    ],
    attributes: {
      sentenceLength: 'short',
      vocabulary: 'plain',
      emojis: 'forbidden',
      hookPatterns: ['contrarian', 'definition', 'imperative'],
    },
  },
  {
    name: 'pg',
    label: 'Paul Graham',
    description:
      'Essayist tone: conversational, gently contrarian, concrete examples, longer sentences.',
    examples: [
      'The most valuable thing you can do is to write code that does not need to be rewritten in a year.',
      'Startups are counter-intuitive in a way that is hard to internalize even after you have been told.',
      'The reason founders burn out is not the work, it is that the work stops working.',
    ],
    attributes: {
      sentenceLength: 'long',
      vocabulary: 'intellectual',
      emojis: 'forbidden',
      hookPatterns: ['observation', 'reframe', 'paradox'],
    },
  },
  {
    name: 'mrbeast',
    label: 'MrBeast',
    description:
      'Viral YouTube-to-Twitter: high-energy, emoji-rich, numbered hooks, extreme claims.',
    examples: [
      'I gave away $1,000,000 to strangers and here is what happened 🤯🧵',
      '7 things you did not know about Minecraft (number 4 broke my brain) 🎮👇',
      'I survived 50 hours buried alive and you will not believe the ending ⚠️',
    ],
    attributes: {
      sentenceLength: 'short',
      vocabulary: 'colloquial',
      emojis: 'encouraged',
      hookPatterns: ['numbered', 'curiosity-gap', 'extreme-claim', 'negative-hook'],
    },
  },
  {
    name: 'technical',
    label: 'Technical',
    description:
      'Engineer-to-engineer: precise, code-friendly, names systems and trade-offs, no hype.',
    examples: [
      'Postgres `EXPLAIN ANALYZE` will tell you why your query is slow. Most people skip it.',
      'A 99th-percentile p99 is a marketing number. Look at p99.9 over a rolling 7-day window.',
      'The fastest code is the code that never runs. Cache, then invalidate aggressively.',
    ],
    attributes: {
      sentenceLength: 'medium',
      vocabulary: 'technical',
      emojis: 'forbidden',
      hookPatterns: ['observation', 'imperative', 'definition'],
    },
  },
  {
    name: 'casual',
    label: 'Casual',
    description:
      'Friendly everyday voice. Light emoji OK, conversational, low stakes.',
    examples: [
      'just realized my morning coffee hack is basically a poor man\'s pour-over lol',
      'anyone else feel like the week starts on Tuesday now? Monday is just a buffer',
      'shipped a tiny side project this weekend — nothing fancy but it works and that is the fun part',
    ],
    attributes: {
      sentenceLength: 'medium',
      vocabulary: 'colloquial',
      emojis: 'allowed',
      hookPatterns: ['question', 'observation', 'confession'],
    },
  },
  {
    name: 'formal',
    label: 'Formal',
    description:
      'Corporate/announcement register. Full sentences, no contractions, measured tone.',
    examples: [
      'We are pleased to announce the general availability of our new analytics dashboard.',
      'Effective Q3, all engineering teams will adopt the unified deployment pipeline.',
      'Our commitment to developer experience remains the foundation of the product roadmap.',
    ],
    attributes: {
      sentenceLength: 'long',
      vocabulary: 'intellectual',
      emojis: 'forbidden',
      hookPatterns: ['announcement', 'observation'],
    },
  },
]

/** Map preset name -> preset. Used by the API and the scorer. */
export const TONE_BY_NAME: Record<string, TonePreset> = Object.fromEntries(
  TONE_PRESETS.map((t) => [t.name, t]),
)

/** Serialize a preset to the shape stored in the Prisma `Tone` row. */
export function presetToRow(p: TonePreset) {
  return {
    name: p.name,
    label: p.label,
    description: p.description,
    examples: JSON.stringify(p.examples),
    attributes: JSON.stringify(p.attributes),
  }
}

/** Parse a stored Tone row back into a preset (examples + attributes typed). */
export function rowToPreset(row: {
  name: string
  label: string
  description: string | null
  examples: string
  attributes: string
}): TonePreset {
  let examples: string[] = []
  let attributes: ToneAttributes = {
    sentenceLength: 'medium',
    vocabulary: 'plain',
    emojis: 'forbidden',
    hookPatterns: [],
  }
  try {
    examples = JSON.parse(row.examples)
  } catch {
    examples = []
  }
  try {
    attributes = JSON.parse(row.attributes)
  } catch {
    /* keep defaults */
  }
  return {
    name: row.name,
    label: row.label,
    description: row.description ?? '',
    examples,
    attributes,
  }
}
