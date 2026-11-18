'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'

import {
  Calendar,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Twitter,
  X,
} from 'lucide-react'

// ---------- Types ----------
interface TonePreset {
  name: string
  label: string
  description: string
  examples: string[]
  attributes: {
    sentenceLength: string
    vocabulary: string
    emojis: string
    hookPatterns: string[]
  }
}

interface HookBreakdownItem {
  rule: string
  delta: number
  note?: string
}

interface HookScoreResult {
  score: number
  breakdown: HookBreakdownItem[]
  band: 'red' | 'yellow' | 'green'
}

interface EngagementPrediction {
  predictedLikes: number
  predictedRetweets: number
  confidence: number
  factors: { feature: string; weight: number }[]
}

interface DraftRow {
  id: string
  title: string
  tweets: string
  hookScore: number
  engagementPrediction: string | null
  status: string
  scheduledAt: string | null
  createdAt: string
  updatedAt: string
  tone: { name: string; label: string } | null
}

// ---------- Constants ----------
const TWEET_MAX = 280
const BAND_COLOR: Record<HookScoreResult['band'], string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
}
const BAND_TEXT: Record<HookScoreResult['band'], string> = {
  red: 'text-red-600',
  yellow: 'text-yellow-600',
  green: 'text-green-600',
}

// ---------- Sortable tweet row ----------
function SortableTweet({
  id,
  index,
  value,
  onChange,
  onDelete,
}: {
  id: string
  index: number
  value: string
  onChange: (next: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  const over = value.length > TWEET_MAX
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 rounded-md border bg-card p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder tweet"
        className="cursor-grab text-muted-foreground hover:text-foreground pt-2"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className="text-[10px]">
            {index + 1}
          </Badge>
          <span
            className={`text-[10px] font-mono ${over ? 'text-red-600' : 'text-muted-foreground'}`}
          >
            {value.length}/{TWEET_MAX}
          </span>
        </div>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px] text-sm"
          aria-label={`Tweet ${index + 1}`}
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete tweet"
        className="text-muted-foreground hover:text-destructive pt-2"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

// ---------- Hook score gauge ----------
function HookGauge({ result }: { result: HookScoreResult | null }) {
  if (!result) {
    return (
      <div className="text-xs text-muted-foreground">
        Add a first tweet to see the hook score.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Hook strength</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`font-mono text-sm font-semibold ${BAND_TEXT[result.band]} underline decoration-dotted`}
            >
              {result.score}/100
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            <div className="space-y-1">
              <div className="font-semibold">Hook breakdown</div>
              <ul className="space-y-0.5">
                {result.breakdown.map((b, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{b.rule}</span>
                    <span>{b.delta > 0 ? `+${b.delta}` : b.delta}</span>
                  </li>
                ))}
                {result.breakdown.length === 0 && (
                  <li className="text-muted-foreground">No heuristics triggered</li>
                )}
              </ul>
              <div className="pt-1 border-t border-primary-foreground/20 mt-1 flex justify-between">
                <span>base</span>
                <span>50</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${BAND_COLOR[result.band]} transition-all`}
          style={{ width: `${result.score}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground">
        band:{' '}
        <span className={BAND_TEXT[result.band]}>{result.band}</span> · click
        the score to see the heuristic breakdown
      </div>
    </div>
  )
}

// ---------- Engagement panel ----------
function EngagementPanel({
  prediction,
}: {
  prediction: EngagementPrediction | null
}) {
  if (!prediction) {
    return (
      <div className="text-xs text-muted-foreground">
        Generate a thread to see the predicted engagement.
      </div>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-card p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Likes</div>
          <div className="font-mono text-lg">{prediction.predictedLikes}</div>
        </div>
        <div className="rounded-md border bg-card p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Retweets</div>
          <div className="font-mono text-lg">{prediction.predictedRetweets}</div>
        </div>
        <div className="rounded-md border bg-card p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Confidence</div>
          <div className="font-mono text-lg">
            {Math.round(prediction.confidence * 100)}%
          </div>
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Factor breakdown (toy linear model)
        </summary>
        <ul className="mt-1 space-y-0.5 font-mono">
          {prediction.factors.map((f, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{f.feature}</span>
              <span>{f.weight}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

// ---------- Main page ----------
export default function Page() {
  const [tones, setTones] = useState<TonePreset[]>([])
  const [selectedTone, setSelectedTone] = useState<string>('naval')
  const [source, setSource] = useState('')
  const [tweets, setTweets] = useState<string[]>([])
  const [composing, setComposing] = useState(false)
  const [hookScore, setHookScore] = useState<HookScoreResult | null>(null)
  const [engagement, setEngagement] = useState<EngagementPrediction | null>(null)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // ----- Fetch tones on mount -----
  useEffect(() => {
    fetch('/api/tones')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.tones)) setTones(d.tones)
      })
      .catch(() => {
        /* non-fatal — picker will be empty */
      })
  }, [])

  // ----- Fetch drafts on mount + when filter changes -----
  const refreshDrafts = useCallback(() => {
    const qs = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : ''
    fetch(`/api/drafts${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.drafts)) setDrafts(d.drafts)
      })
      .catch(() => {
        /* non-fatal */
      })
  }, [statusFilter])

  useEffect(() => {
    refreshDrafts()
  }, [refreshDrafts])

  // ----- Recompute hook score whenever tweets[0] changes -----
  useEffect(() => {
    if (tweets.length === 0) {
      setHookScore(null)
      return
    }
    const controller = new AbortController()
    fetch('/api/score/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstTweet: tweets[0] }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d: HookScoreResult) => setHookScore(d))
      .catch(() => {
        /* non-fatal */
      })
    return () => controller.abort()
  }, [tweets.length === 0 ? '' : tweets[0]])

  // ----- Recompute engagement whenever tweets/tone/scheduledAt change -----
  useEffect(() => {
    if (tweets.length === 0) {
      setEngagement(null)
      return
    }
    const t = setTimeout(() => {
      fetch('/api/predict/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweets,
          tone: selectedTone,
          hookScore: hookScore?.score ?? 0,
          scheduledAt: scheduledAt || null,
        }),
      })
        .then((r) => r.json())
        .then((d: EngagementPrediction) => setEngagement(d))
        .catch(() => {
          /* non-fatal */
        })
    }, 250)
    return () => clearTimeout(t)
  }, [tweets, selectedTone, scheduledAt, hookScore?.score])

  // ----- Actions -----
  const generateThread = async () => {
    if (source.trim().length === 0) {
      toast({ title: 'Source is empty', description: 'Paste a source first.' })
      return
    }
    setComposing(true)
    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          tone: selectedTone,
          maxTweets: 8,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Compose failed', description: data.error ?? 'Unknown error' })
        return
      }
      if (Array.isArray(data.tweets) && data.tweets.length > 0) {
        setTweets(data.tweets)
        if (!title) {
          setTitle(source.trim().slice(0, 60))
        }
        toast({
          title: 'Thread composed',
          description: `${data.tweets.length} tweets in ${data.tone} tone (${data.provider})`,
        })
      } else {
        toast({ title: 'Compose returned no tweets', variant: 'destructive' })
      }
    } catch (e) {
      toast({
        title: 'Compose error',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setComposing(false)
    }
  }

  const saveDraft = async (schedule: boolean) => {
    if (tweets.length === 0) {
      toast({ title: 'Nothing to save', description: 'Compose a thread first.' })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim() || source.trim().slice(0, 60) || 'Untitled draft',
        tweets,
        tone: selectedTone,
        hookScore: hookScore?.score ?? 0,
        engagementPrediction: engagement,
        status: schedule && scheduledAt ? 'scheduled' : 'draft',
      }
      if (schedule && scheduledAt) payload.scheduledAt = scheduledAt

      let res: Response
      if (editingDraftId) {
        res = await fetch(`/api/drafts/${editingDraftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) {
        toast({
          title: 'Save failed',
          description: data.error ?? 'Unknown error',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: schedule && scheduledAt ? 'Draft scheduled' : 'Draft saved',
        description: payload.title as string,
      })
      if (data?.draft?.id) setEditingDraftId(data.draft.id)
      refreshDrafts()
    } catch (e) {
      toast({
        title: 'Save error',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const loadDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`)
      const data = await res.json()
      if (!res.ok || !data.draft) {
        toast({ title: 'Load failed', variant: 'destructive' })
        return
      }
      const d: DraftRow = data.draft
      let parsed: string[] = []
      try {
        parsed = JSON.parse(d.tweets)
      } catch {
        parsed = []
      }
      setEditingDraftId(d.id)
      setTitle(d.title)
      setTweets(parsed)
      setSelectedTone(d.tone?.name ?? 'casual')
      setScheduledAt(d.scheduledAt ? toLocalDatetime(d.scheduledAt) : '')
      toast({ title: 'Draft loaded', description: d.title })
    } catch (e) {
      toast({
        title: 'Load error',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const deleteDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast({ title: 'Delete failed', variant: 'destructive' })
        return
      }
      if (editingDraftId === id) setEditingDraftId(null)
      toast({ title: 'Draft deleted' })
      refreshDrafts()
    } catch (e) {
      toast({
        title: 'Delete error',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const newDraft = () => {
    setEditingDraftId(null)
    setTitle('')
    setTweets([])
    setSource('')
    setScheduledAt('')
    setHookScore(null)
    setEngagement(null)
  }

  // ----- DnD reorder -----
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setTweets((items) => {
      const oldIndex = Number(active.id)
      const newIndex = Number(over.id)
      if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const updateTweet = (i: number, next: string) => {
    setTweets((items) => items.map((t, idx) => (idx === i ? next : t)))
  }
  const deleteTweet = (i: number) => {
    setTweets((items) => items.filter((_, idx) => idx !== i))
  }
  const addTweet = () => {
    setTweets((items) => [...items, ''])
  }

  const draftsCount = drafts.length
  const selectedTonePreset = tones.find((t) => t.name === selectedTone)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Twitter className="size-4" />
            </div>
            <div>
              <h1 className="font-semibold leading-none">Tweet/Thread Composer</h1>
              <p className="text-[11px] text-muted-foreground">
                Tone · hook score · autosplit · engagement · draft queue
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <FileText className="size-3" />
              {draftsCount} in queue
            </Badge>
            <Button size="sm" variant="outline" onClick={newDraft}>
              <Plus className="size-3" />
              New draft
            </Button>
          </div>
        </div>
      </header>

      {/* Main grid */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* ----- Left: composer ----- */}
        <section className="space-y-4">
          {/* Tone picker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Pick a tone</CardTitle>
              <CardDescription>
                Six hardcoded presets — few-shot prompt + style attributes are
                sent to the model.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {tones.length === 0 && (
                  <div className="col-span-full text-xs text-muted-foreground">
                    Loading tones...
                  </div>
                )}
                {tones.map((t) => {
                  const selected = t.name === selectedTone
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => setSelectedTone(t.name)}
                      aria-pressed={selected}
                      className={`text-left rounded-md border p-3 transition-all ${
                        selected
                          ? 'border-primary ring-1 ring-primary bg-primary/5'
                          : 'bg-card hover:bg-accent'
                      }`}
                    >
                      <div className="font-medium text-sm">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                        {t.description}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.attributes.hookPatterns.slice(0, 2).map((h) => (
                          <span
                            key={h}
                            className="text-[9px] rounded bg-muted px-1.5 py-0.5"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Source */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Source material</CardTitle>
              <CardDescription>
                Paste a paragraph, an idea, or notes you want turned into a
                thread.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. I want to talk about why most startups die from indigestion, not starvation — too many features, no focus..."
                className="min-h-[120px]"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {source.length} chars
                </span>
                <Button
                  onClick={generateThread}
                  disabled={composing || source.trim().length === 0}
                >
                  {composing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate thread
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Thread editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Thread editor</CardTitle>
              <CardDescription>
                Drag to reorder. Inline-edit each tweet. {TWEET_MAX}-char
                counter turns red on overflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {editingDraftId && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">editing</Badge>
                  <span className="font-mono truncate">{editingDraftId}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={newDraft}
                    className="ml-auto h-6 px-2 text-xs"
                  >
                    <X className="size-3" /> detach
                  </Button>
                </div>
              )}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Draft title (auto-filled from source)"
              />
              {tweets.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
                  No tweets yet. Generate a thread above, or add one manually.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={tweets.map((_, i) => String(i))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {tweets.map((t, i) => (
                        <SortableTweet
                          key={String(i)}
                          id={String(i)}
                          index={i}
                          value={t}
                          onChange={(next) => updateTweet(i, next)}
                          onDelete={() => deleteTweet(i)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              <Button variant="outline" size="sm" onClick={addTweet}>
                <Plus className="size-3" />
                Add tweet
              </Button>

              <Separator />

              {/* Hook score gauge */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Hook score (tweet #1)
                </Label>
                <div className="mt-1">
                  <HookGauge result={hookScore} />
                </div>
              </div>

              <Separator />

              {/* Engagement prediction */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Engagement prediction
                </Label>
                <div className="mt-1">
                  <EngagementPanel prediction={engagement} />
                </div>
              </div>

              <Separator />

              {/* Schedule + Save */}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end">
                <div>
                  <Label htmlFor="schedule" className="text-xs text-muted-foreground">
                    Schedule (local)
                  </Label>
                  <div className="flex items-center gap-1">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <Input
                      id="schedule"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => saveDraft(false)}
                  disabled={saving || tweets.length === 0}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  Save draft
                </Button>
                <Button
                  onClick={() => saveDraft(true)}
                  disabled={saving || tweets.length === 0 || !scheduledAt}
                  title={scheduledAt ? 'Save & mark scheduled' : 'Pick a time first'}
                >
                  <Calendar className="size-4" />
                  Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ----- Right: draft queue ----- */}
        <aside className="space-y-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Draft queue</CardTitle>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v)}
                >
                  <SelectTrigger size="sm" className="w-[130px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="scheduled">scheduled</SelectItem>
                    <SelectItem value="posted">posted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CardDescription>
                Click any card to load it back into the composer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2">
                {drafts.length === 0 ? (
                  <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
                    No drafts {statusFilter !== 'all' ? `with status "${statusFilter}"` : 'yet'}.
                  </div>
                ) : (
                  drafts.map((d) => {
                    const score = d.hookScore ?? 0
                    const band =
                      score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red'
                    return (
                      <div
                        key={d.id}
                        className="rounded-md border bg-card p-3 hover:bg-accent/40 cursor-pointer transition-colors"
                        onClick={() => loadDraft(d.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">
                              {d.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {d.tone && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {d.tone.label}
                                </Badge>
                              )}
                              <span
                                className={`text-[10px] font-mono px-1.5 rounded ${BAND_TEXT[band as 'red'|'yellow'|'green']}`}
                                title="Hook score"
                              >
                                hook {score}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] capitalize"
                              >
                                {d.status}
                              </Badge>
                              {d.scheduledAt && (
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDate(d.scheduledAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label="Delete draft"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteDraft(d.id)
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {selectedTonePreset && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  About {selectedTonePreset.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {selectedTonePreset.description}
                </p>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Examples in this tone
                  </Label>
                  <ul className="mt-1 space-y-1 text-xs">
                    {selectedTonePreset.examples.map((ex, i) => (
                      <li
                        key={i}
                        className="rounded-md border bg-muted/40 p-2 italic"
                      >
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </main>

      {/* Footer — sticky bottom */}
      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto max-w-7xl px-4 py-3 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>
            Tweet/Thread Composer with Tone — toy hook-score + engagement
            heuristic (see README).
          </span>
          <span>
            {editingDraftId ? 'editing existing draft' : 'new draft'} ·
            tone={selectedTone} · tweets={tweets.length}
          </span>
        </div>
      </footer>
    </div>
  )
}

// ---------- helpers ----------
function toLocalDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
