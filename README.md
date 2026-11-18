# Tweet/Thread Composer with Tone

> Compose tweets and threads in sampled tones — Naval, Paul Graham, MrBeast,
> Technical, Casual, Formal — with hook-strength scoring, 280-char thread
> autosplit, a toy engagement-prediction model, and a persistent draft queue.

This is **Project #47** from a 110-project portfolio plan. It is a content-
*creation* tool, NOT a RAG chat: the LLM is used for ghostwriting in a target
tone, while the scoring, autosplitting, engagement prediction and scheduling
are all **pure, deterministic functions** that run without any LLM call.

---

## Features

- **Tone sampling** — 6 hardcoded presets in [`src/lib/tones.ts`](src/lib/tones.ts),
  each with a label, description, 3 example tweets, and a style-attributes
  JSON blob (`sentenceLength`, `vocabulary`, `emojis`, `hookPatterns`). The
  few-shot examples + attributes are injected into the compose prompt.
- **Hook-strength score** — `scoreHook(firstTweet)` is a pure function that
  returns 0-100 with a per-heuristic breakdown and a red/yellow/green band.
  Anchored at 50, clamped to [0, 100]. Heuristics:
  - numbered list +20
  - negative hook +15
  - question +15
  - curiosity gap +10
  - strong verb opener +5
  - sweet-spot length 30-180 chars +10
  - length penalty (outside 30-180) -10
  - all-caps penalty (>60% uppercase letters) -40
  - emoji policy ±5
  - URL in first tweet -10
- **Thread autosplit** — `splitByLength(text, 280)` greedily packs words
  into <=280-char chunks on word boundaries; long words are hard-split and
  flagged. The LLM-assisted compose path produces its own thread, but the
  autosplitter is the canonical fallback and the 280-char guarantee.
- **Engagement prediction** — `predictEngagement(...)` is a toy linear model
  combining `hookScore + threadLength + tone multiplier + time-of-day +`
  `weekend/weekday`. Returns `{ predictedLikes, predictedRetweets,`
  `confidence, factors }`. Documented as a toy — see Case Study.
- **Schedule + draft queue** — `Draft` table persists the thread (JSON),
  tone, hookScore, engagementPrediction, status, scheduledAt. The UI shows
  the queue with status filter; "Schedule" sets `scheduledAt`. **No real
  scheduler runs** — scheduling is visual only (TODO).
- **Drag-and-drop reorder** — `@dnd-kit/core` + `@dnd-kit/sortable` power
  per-tweet reordering in the editor. Each tweet has a live char counter
  (red on overflow), inline edit, and delete.
- **Live hook + engagement recompute** — as you edit the first tweet or
  change tone/schedule, the hook score and engagement prediction are
  re-fetched from the pure-function API endpoints (debounced).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) — required, non-negotiable |
| Language | **TypeScript 5** — required, non-negotiable |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (New York) + Lucide icons |
| Database | **Prisma 6** + **SQLite** (isolated `db/custom.db`) |
| AI | **z-ai-web-dev-sdk** (non-streaming `chat.completions.create`) |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` |
| Tests | `bun test` (Bun's built-in test runner, `bun:test`) |
| Lint | `eslint-config-next` |

---

## Architecture

```
                       +---------------------------+
                       |        Browser UI         |
                       |  src/app/page.tsx         |
                       |  (composer + draft queue) |
                       +-------------+-------------+
                                     |
              (relative fetch, no absolute paths)
                                     |
        +----------------------------+--------------------------+
        |                            |                          |
+-------v------+              +------v------+             +-----v-----+
| /api/compose |              | /api/score/ |             | /api/drafts |
| LLM call w/  |              |   hook      |             |  CRUD      |
| tone few-shot|              | (pure)      |             | (Prisma)   |
+------+-------+              +-------------+             +-----+------+
       |                                                          |
       |  z-ai-web-dev-sdk                                        |
       v                                                          v
+----------------+                                        +----------------+
| ZaiProvider    |  (or MockProvider if                    |  SQLite        |
| chat.compl.    |   PKC_DISABLE_LLM=1)                    |  db/custom.db  |
| create()       |                                         |  via Prisma    |
+----------------+                                         +----------------+

Pure-function core (no I/O, fully tested):
  src/lib/tones.ts          — 6 hardcoded tone presets
  src/lib/hook-score.ts     — scoreHook(firstTweet) → 0-100
  src/lib/thread-splitter.ts— splitByLength(text, 280)
  src/lib/engagement.ts     — predictEngagement(...) → toy linear model

API routes (Next.js Route Handlers):
  POST /api/compose                 — LLM thread composition
  POST /api/score/hook              — pure hook score
  POST /api/predict/engagement      — pure engagement prediction
  GET  /api/tones                   — list tone presets
  GET  /api/drafts                  — list drafts (?status=)
  POST /api/drafts                  — persist draft
  GET  /api/drafts/[id]             — single draft
  PATCH /api/drafts/[id]            — update / schedule
  DELETE /api/drafts/[id]           — delete
```

---

## Project Structure

```
47-tweet-thread-composer/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json
├── eslint.config.mjs
├── .env                       # DATABASE_URL absolute path
├── .env.example
├── .gitignore
├── LICENSE                    # MIT
├── README.md
├── db/
│   └── custom.db              # SQLite database (gitignored)
├── prisma/
│   └── schema.prisma          # Tone + Draft models
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx            # the only user-visible route
    │   └── api/
    │       ├── compose/route.ts
    │       ├── score/hook/route.ts
    │       ├── predict/engagement/route.ts
    │       ├── tones/route.ts
    │       └── drafts/
    │           ├── route.ts
    │           └── [id]/route.ts
    ├── components/ui/         # copied shadcn/ui subset
    │   ├── button.tsx
    │   ├── card.tsx
    │   ├── textarea.tsx
    │   ├── badge.tsx
    │   ├── input.tsx
    │   ├── label.tsx
    │   ├── select.tsx
    │   ├── tooltip.tsx
    │   ├── progress.tsx
    │   ├── separator.tsx
    │   ├── scroll-area.tsx
    │   ├── toast.tsx
    │   └── toaster.tsx
    ├── hooks/
    │   └── use-toast.ts
    └── lib/
        ├── utils.ts           # cn() helper
        ├── tones.ts           # 6 tone presets
        ├── hook-score.ts       # pure-function scorer
        ├── thread-splitter.ts  # pure-function autosplitter
        ├── engagement.ts       # pure-function toy predictor
        ├── ai.ts               # ComposeProvider (Zai + Mock)
        ├── db.ts               # Prisma singleton
        └── __tests__/
            ├── tones.test.ts
            ├── hook-score.test.ts
            ├── thread-splitter.test.ts
            ├── engagement.test.ts
            └── ai.test.ts
```

---

## Setup

> The sandbox has Bun pre-installed and the Next.js dev server is auto-
> started on port 3000 by the platform. The commands below are for running
> the project on your own machine.

```bash
# 1. Install deps
bun install

# 2. Create the SQLite database ( DATABASE_URL is inlined as a backup )
bun run db:push
# (this also runs `prisma generate`)

# 3. Start the dev server
bun run dev
# → http://localhost:3000

# 4. (Optional) disable the live LLM to use the deterministic mock provider
export PKC_DISABLE_LLM=1
```

### Tests

```bash
bun test
```

The test suite covers all four pure-function modules (tones, hook-score,
thread-splitter, engagement) plus the AI prompt-builder/parser. **No DB or
network is required** — the pure-function tests are fully deterministic.

---

## Environment Variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `file:.../db/custom.db` | Prisma SQLite path. **Must be absolute.** |
| `PKC_DISABLE_LLM` | no | unset | `=1` forces the deterministic MockProvider. |
| `ZAI_API_KEY` | no | (sandbox pre-provisioned) | z-ai-web-dev-sdk credential on your own machine. |

`.env` ships with an absolute `DATABASE_URL`. `package.json` scripts inline
`DATABASE_URL="$(pwd)/db/custom.db"` as a backup so `bun run db:push` works
even if `.env` is not loaded.

---

## Case Study — toy heuristics and what I would do differently

This project deliberately ships **toy** versions of three subsystems. Each
is honest about its limits in code comments and in this section.

### 1. Hook-strength score (toy heuristic vs. trained model)

What shipped:
- A hand-tuned linear combination of 10 binary/integer heuristics, anchored
  at 50 and clamped to [0, 100]. Weights (e.g. `+20` for numbered lists,
  `-40` for all-caps) were picked by gut feel and a few canonical examples.

What I would do differently:
- Scrape ~10k public tweets from a creator's timeline via the X API v2
  `GET /2/users/:id/tweets`.
- Compute normalized engagement (`log(1 + likes + retweets * 5)`) per tweet.
- Engineer features: first-token POS, sentence length, sentiment polarity,
  emoji count, presence of numbered/curiosity/negative hooks (detected with
  a small few-shot classifier or regex like the current heuristic).
- Train a gradient-boosted regression (LightGBM/XGBoost) on
  `(features, normalized_engagement)`.
- Calibrate the output to a 0-100 score via quantile transform so the band
  thresholds (red < 40, yellow < 70, green >= 70) reflect *observed*
  engagement percentiles, not arbitrary cut-offs.

### 2. Engagement prediction (toy linear model vs. real regression)

What shipped:
- A linear combination `base + hookContribution + lengthContribution +`
  `timeOfDayBonus`, then scaled by `toneMultiplier * dayMultiplier`. The
  coefficients are invented; `confidence` is a hand-crafted U-curve.

What I would do differently:
- Frame as a **negative-binomial regression** (likes/retweets are
  overdispersed count data) — not a linear model that can return negatives.
- Train per-creator (the global model is misleading; MrBeast's floor is
  10x a casual account's ceiling).
- Features: hour-of-day (sin/cos encoded), day-of-week one-hot, tweet
  length, hashtag count, media presence (image/video), recent follower
  growth rate, recent engagement velocity.
- Output a **prediction interval** (not a point estimate + scalar
  confidence) so the UI can show "10-40 likes, 80% interval".

### 3. Tone sampling (mocked @handle vs. real X API)

What shipped:
- The target `@handle` is passed as best-effort context inside the
  compose prompt — we tell the model "write like @naval", but we do NOT
  fetch their actual tweets.

What I would do differently:
- Use the X API v2 to pull the last 200 tweets from `@handle`.
- Fit a lightweight style profile: sentence-length distribution, top-20
  vocabulary, emoji frequency, hook-pattern classes (reuse the same
  classifier as the hook-score feature extractor).
- Inject the top-3 *real* recent tweets as additional few-shot examples in
  the compose prompt (replacing one of the hardcoded preset examples).

### 4. Scheduler (visual only vs. real cron)

What shipped:
- The "Schedule" button sets `scheduledAt` on the Draft row. **No
  background job ever runs** — the draft stays in `scheduled` status until
  a human flips it to `posted`.

What I would do differently:
- A small BullMQ + Redis queue (or a pg-boss table) with a per-minute
  poller that fires `scheduledAt <= now()` drafts through the X API
  `POST /2/tweets` (and the thread endpoint for multi-tweet threads).
- A retry+backoff policy for rate-limited / 5xx responses.
- A webhook receiver for the `tweet_posted` event to flip status to
  `posted` and capture real engagement metrics for retraining #1 and #2.

### Resume bullet

> Built a **Next.js 16 + TypeScript** tweet/thread composer with **tone
> sampling** (6 hardcoded presets with few-shot prompts), a **pure-function
> hook-strength scorer** (0-100, 10 heuristics), 280-char thread autosplit,
> and a **toy engagement-prediction model**; persisted drafts and schedules
> via **Prisma + SQLite**; reorderable thread editor with `@dnd-kit`;
> **60+ deterministic `bun test`** cases pinning every pure function.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Push to GitHub (do NOT run inside the sandbox)

```bash
gh repo create tweet-thread-composer --public --source=. --remote=origin --push
```
