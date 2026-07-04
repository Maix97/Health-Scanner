# Health Scanner

Personal health tracker: log daily check-ins (feelings, sleep, quick toggles, a free-text
journal entry) and surface patterns between what you do and how you feel — both via
explainable statistical correlations and AI-generated summaries.

## Stack

- `front-end/` — React + Vite + TypeScript + Tailwind, React Router, TanStack Query
- `back-end/` — Node + Express + TypeScript (ESM), Prisma + SQLite (swappable to Postgres
  later by changing the `datasource` provider and `DATABASE_URL`), Anthropic SDK

## Setup

### Backend

```
cd back-end
npm install
npx prisma migrate dev   # creates dev.db and applies migrations
npx prisma db seed       # seeds preset feeling/quick-toggle tags
```

Edit `back-end/.env`:

```
DATABASE_URL="file:./dev.db"
PORT=4000
ANTHROPIC_API_KEY=        # required for journal extraction + AI insights — get one at console.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-5
INSIGHT_MIN_NEW_CHECKINS=3
```

`ANTHROPIC_API_KEY` is separate from a Claude.ai/Claude Code subscription — it's a
pay-as-you-go key from the Anthropic Console. Without it, check-ins/tags/history still
work; only journal-text extraction and the Insights page's "Generate insights" will fail.

### Frontend

```
cd front-end
npm install
```

### Run both at once

From the project root (after the backend/frontend installs above):

```
npm install        # installs the root dev tooling (concurrently), once
npm run dev         # runs back-end (:4000) and front-end (:5173) together
```

Or run them separately if you prefer two terminals: `npm run dev` inside
`back-end/` and inside `front-end/`.

## How it works

- **Today** — pick which part of the day this entry is about (Morning 6am-12pm, Day
  12-4pm, Evening 4pm-12am), rate your mood on a 1-10 red→yellow→green scale, tag
  symptoms/feelings split into Health (Negative/Positive), log sleep, exercise type,
  quick toggles, and a free-text journal entry. The journal text is parsed by Claude into
  structured events (food/drink/activity/symptom/mood) that merge with whatever you
  tagged manually, without duplicating things you already tapped.
- **History** — past check-ins with a mood badge, time-of-day badge, and MANUAL vs
  auto-extracted tag badges; edit a journal entry to re-run extraction.
- **Insights** — a rule-based correlation engine looks for co-occurrence patterns (e.g.
  "coffee" vs "headache") and mood-impact patterns (e.g. average mood with vs. without
  a given input), with minimum-sample-size guards. It also looks for *carryover* effects
  across time-of-day periods within the same logical day — same-day morning→day,
  morning→evening, day→evening, plus the one cross-day relationship, evening→next
  morning (e.g. "drank in the evening, mood was lower the next morning"). An AI summary
  built on top of all of those verified findings highlights what seems to help or hurt.
  AI summaries are cached and only regenerated after enough new check-ins (or on demand
  via "Regenerate anyway") to limit API usage.
- **Settings** — export/import your data as JSON (local-first for now; no cloud sync
  yet, so this doubles as your backup).
