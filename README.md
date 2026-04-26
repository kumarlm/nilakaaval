# Nilakaaval *(நிலக்காவல்)* — Land Guard

> *Nilakaaval* is Tamil for "Land Guard" — நிலம் (land) + காவல் (guard / watch).

A web tool that helps authorised users mark **restricted land parcels**
(reserved forest, water bodies, poromboke, temple land, CRZ, etc.) and
automatically watches them for **unauthorized construction** by comparing
fresh satellite imagery against historical snapshots, raising alerts and
emailing the right people when something changes.

> Pilot / educational project. Not affiliated with any government. Built to
> be hostable for free (Vercel + Supabase free tier + MapTiler free tier).

---

## What this project is

Imagine a revenue official who wants to keep an eye on a few hundred
restricted parcels across a taluk. Driving out to inspect each one weekly is
impossible. **Nilakaaval** automates that:

1. **Mark** — the official draws each restricted parcel on a satellite map
   and tags it with district / taluk / village / survey number / restriction
   type.
2. **Watch** — the system fetches a fresh satellite snapshot of each parcel
   on a schedule (or on demand).
3. **Compare** — every new snapshot is pixel-diffed against the previous one
   inside the parcel polygon.
4. **Alert** — if the change score crosses a threshold, an alert is raised
   with a heatmap visualisation, and an email goes out to the relevant
   officers.
5. **Review** — the official opens the alert, sees the *before / after* with
   the changed pixels highlighted, and marks it as `unauthorized`,
   `authorized`, or `false_positive`.

The aim is to catch encroachment **early**, not to be a final-judgement
system. Every flag is sent to a human for verification.

---

## What's done

| # | Feature | Status |
|---|---|---|
| 1 | Email/password and Google sign-in (Supabase Auth) | ✅ |
| 2 | Default `authority` role for every signup (can mark/scan/delete); `viewer` available for read-only access if assigned manually | ✅ |
| 3 | Map view with **Esri** satellite + OSM-streets toggle (MapLibre, free) | ✅ |
| 4 | Custom polygon drawer (click vertices, double-click / Enter to finish) | ✅ |
| 5 | Save parcels with administrative metadata (district / taluk / village / survey) | ✅ |
| 6 | List + detail pages for parcels | ✅ |
| 7 | **Manual scan** — fetch + stitch a sub-meter MapTiler satellite image of the parcel and store it as a snapshot | ✅ |
| 8 | **Cron scan** — daily Vercel Cron sweeps parcels due for re-scan based on `scan_frequency_days` | ✅ |
| 9 | **Pixel-difference change detection** — RGB diff between consecutive snapshots, polygon-masked | ✅ |
| 10 | **Diff heatmap** — red overlay over the after-image showing where pixels changed | ✅ |
| 11 | **Alert thresholds** — score < 5% no alert, 5–10% low, 10–20% medium, ≥ 20% high | ✅ |
| 12 | **Email notifications** via Resend (alerts go to all authority emails + per-user extra recipients) | ✅ |
| 13 | **Manual snapshot upload** — UI to drop in any image as a "snapshot" so change detection can be tested without waiting for real construction | ✅ |
| 14 | **Delete** — parcels (cascade), snapshots, and alerts; storage objects cleaned up server-side | ✅ |
| 15 | Settings page — manage extra alert recipient emails | ✅ |
| 16 | Vercel-ready build, runs on free tier | ✅ |

### What's intentionally NOT done (yet)

- **Sentinel-2 / dated imagery integration** — code is in
  `src/lib/sentinel-hub.ts` but commented out. MapTiler gives much sharper
  visuals but no per-pixel acquisition date, so two scans may return
  identical bytes until the upstream mosaic refreshes. For a *guaranteed*
  reproducible change-detection cadence, swap back to Sentinel-2.
- **ML-based change detection** — current diff is naïve absolute pixel
  difference. A proper Siamese / ChangeFormer model would reduce false
  positives from lighting / mosaic re-blending. Hugging Face Spaces is the
  intended host.
- **Permit registry cross-check** — to actually call a change *unauthorized*
  the system would need to compare against the relevant revenue / planning
  permit database. Today every alert is just "possible change for review".
- **Telegram notifications**, **SMS** — placeholders only.
- **PostGIS** — polygons are stored as GeoJSON in `jsonb`, not as PostgreSQL
  geography type. Spatial filtering (e.g. "all parcels within X km of point")
  is done in JS, which is fine for thousands of parcels but not millions.
- **Self-service authority verification** (gov-issued identity proofing) —
  role is granted manually via SQL.

---

## How it's done

### Architecture

```
                     ┌─────────────────────────┐
                     │  User (browser)         │
                     │  - draws polygons       │
                     │  - reviews alerts       │
                     │  - uploads test images  │
                     └────────────┬────────────┘
                                  │ HTTPS
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Next.js 16 on Vercel                                             │
│                                                                  │
│  • App Router pages (RSC + a few client components for map/forms)│
│  • API routes:                                                   │
│      POST /api/scan/[id]                  ← manual rescan        │
│      POST /api/parcels/[id]/snapshots     ← manual upload (test) │
│      POST /api/parcels/[id]/context       ← bake high-res image  │
│      GET  /api/cron/scan                  ← Vercel Cron, daily   │
│  • Server actions (delete entities, save settings)               │
│  • Middleware: session refresh + protected-route gate            │
└────────────┬──────────────────────────────────────────┬──────────┘
             │                                          │
             │ Supabase JS SDK                          │ fetch()
             ▼                                          ▼
┌─────────────────────────────────┐         ┌────────────────────────┐
│ Supabase                        │         │ MapTiler `satellite-v2`│
│  • Postgres + RLS               │         │  free tier, 100k req/mo│
│  • Auth (email/password + OAuth)│         │  → 512×512 JPG tiles   │
│  • Storage bucket `snapshots`   │         └────────────────────────┘
│      <parcelId>/<ts>.png        │
│      diffs/<parcelId>/<id>.png  │         ┌────────────────────────┐
│      context/<parcelId>.png     │         │ Resend                 │
│                                 │         │  3000 free emails / mo │
└─────────────────────────────────┘         │  HTML alert template   │
                                            └────────────────────────┘
```

No separate worker, no message queue, no Docker. Everything runs in Vercel
serverless functions; the change-detection pipeline executes inline inside
the request that triggered it (`scan` or `upload`).

### Data model

```
profiles
├─ id (= auth.users.id)
├─ role: 'authority' | 'viewer'
├─ email, full_name, designation, district
└─ notification_emails: text[]      ← extra alert recipients

parcels
├─ id, name, restriction_type
├─ district, taluk, village, survey_no
├─ geom: jsonb  (GeoJSON Polygon, WGS84)
├─ area_hectares, scan_frequency_days
└─ last_scanned_at

snapshots
├─ id, parcel_id
├─ captured_at, source ('maptiler-satellite-v2' | 'manual-upload' | …)
├─ image_url   (public Supabase Storage URL)
└─ metadata    (bbox, width, height, zoom)

alerts
├─ id, parcel_id
├─ baseline_snapshot_id, current_snapshot_id
├─ severity, change_score, status
└─ diff_image_url
```

All four tables have **Row-Level Security** policies in
`supabase/migrations/0001_init.sql`:
- Anyone authenticated can **read**.
- Only `authority` role can **insert / update / delete** parcels, snapshots,
  alerts.
- Background workers (cron, scan) bypass RLS via the **service-role** key.

### How a scan works

```
scanParcel(parcelId)
  ├─ load polygon
  ├─ bboxForContext(polygon)             ← tight bbox around parcel
  ├─ stitchSatellite(bbox)
  │    ├─ choose zoom (~1.5 m/px target)
  │    ├─ map bbox → tile range (Web Mercator)
  │    ├─ fetch MapTiler tiles in parallel
  │    ├─ resize each to 512×512 (defensive normalisation)
  │    ├─ composite into one canvas (sharp)
  │    └─ extract bbox-aligned crop
  ├─ upload PNG to Supabase Storage
  ├─ insert snapshots row
  ├─ update parcels.last_scanned_at
  └─ processNewSnapshot(snapshot.id)     ← change detection runs inline
```

### How change detection works

```
processNewSnapshot(currentId)
  ├─ load current snapshot
  ├─ find immediate previous snapshot for this parcel
  │    (most-recent OTHER snapshot, deterministic id tie-break)
  ├─ fetch both PNGs as Buffers
  ├─ diffSnapshots({ before, after, polygon, bbox })
  │    ├─ resize after → before's WxH (fit:'fill', defensive)
  │    ├─ raw RGB pixels for both
  │    ├─ rasterise polygon → binary mask same WxH
  │    ├─ for each pixel:
  │    │     d = (|ΔR| + |ΔG| + |ΔB|) / 3      ← 0..255
  │    │     if pixel inside mask: accumulate d
  │    ├─ score = mean(d) / 255                ← 0..1
  │    └─ build red-tint heatmap overlay (alpha = d, masked)
  ├─ upload diff PNG → diffs/<parcelId>/<id>.png
  ├─ severity = 0 / low / medium / high based on score
  ├─ if severity != null:
  │    ├─ insert alerts row (baseline, current, score, diff URL)
  │    └─ collect recipients (authority emails ∪ profiles.notification_emails)
  │        sendAlertEmail(...) via Resend
  │        (no API key → log to server console, alert still saved)
  └─ console.log diagnostic line
```

### How the map drawer works

`@mapbox/mapbox-gl-draw` doesn't play nicely with MapLibre, so we
hand-rolled a custom drawer (`src/app/(app)/map/map-client.tsx`):

- 4 GeoJSON sources: vertices, line, dashed rubber-band, fill preview
- `click` adds a vertex; `mousemove` updates the rubber-band; `dblclick` /
  Enter closes the polygon; `Esc` cancels
- Polygon is saved as a `Polygon` GeoJSON literal in `parcels.geom`

### How basemap works

Two free providers, toggleable from a button in the corner:

- **Esri World Imagery** — for the map UI; sub-meter, attribution-only.
- **Carto Voyager labels** — overlaid at 90% opacity for street/place names.
- **OpenStreetMap** — alternate "Streets" view.

For the actual snapshot worker we use **MapTiler `satellite-v2`** via the
HTTP tile endpoint, stitched server-side with `sharp`. MapTiler is the only
provider in the loop that requires an API key.

---

## Local development

### 1. Create Supabase project

1. Sign up at [supabase.com](https://supabase.com), create a project.
2. Open **SQL Editor** and run, in order:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   - [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql)
   - [`supabase/migrations/0003_backfill_profiles.sql`](supabase/migrations/0003_backfill_profiles.sql) (idempotent, safe to skip on a fresh DB)
   - [`supabase/migrations/0004_profile_metadata.sql`](supabase/migrations/0004_profile_metadata.sql)
   - [`supabase/migrations/0005_context_image.sql`](supabase/migrations/0005_context_image.sql) (legacy column; keep)
   - [`supabase/migrations/0006_notification_emails.sql`](supabase/migrations/0006_notification_emails.sql)
   - [`supabase/migrations/0007_delete_policies.sql`](supabase/migrations/0007_delete_policies.sql)
   - [`supabase/migrations/0008_default_role_authority.sql`](supabase/migrations/0008_default_role_authority.sql)
3. From *Project Settings → API*, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…_PUBLISHABLE_KEY`)
   - **service_role** (secret) key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. MapTiler API key

Sign up at [cloud.maptiler.com](https://cloud.maptiler.com), copy your
default key into `MAPTILER_API_KEY`. Free tier: 100k tile requests/month.

### 3. (Optional) Resend API key

For email alerts, sign up at [resend.com](https://resend.com), copy a key
into `RESEND_API_KEY`. Free tier: 3000 emails/month. Without a key, alerts
are still saved to the DB; emails are skipped and logged to the server
console.

### 4. (Optional) Google sign-in

Supabase dashboard → Authentication → Providers → Google → Enable, then
paste a Google Cloud OAuth client ID/secret. Add
`https://<your-project-ref>.supabase.co/auth/v1/callback` as the
authorised redirect URI in Google Cloud Console. Set Site URL to
`http://localhost:3000` (and your Vercel URL once deployed) under
*Authentication → URL Configuration*.

### 5. Configure env

```bash
cp .env.local.example .env.local
# fill in the values from above
```

### 6. Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and sign up. Every new account is granted the
`authority` role by default — you can mark parcels, run scans, and review
alerts immediately. To downgrade a user to read-only viewer, run in the
Supabase SQL Editor:

```sql
update public.profiles
   set role = 'viewer'
 where email = 'someone@example.com';
```

---

## Testing change detection without waiting for real construction

You can't conjure up unauthorized construction on demand. So the app has a
**manual upload** path:

1. Open any parcel → **Upload snapshot**.
2. Pick *any* image (a screenshot, a downloaded satellite still, even a
   solid-colour PNG) → upload. This is your **before**.
3. Open it again → **Upload snapshot** → pick a **different** image (or take
   the first one and paint a coloured rectangle on it in any image editor) →
   upload. This is your **after**.
4. The upload dialog tells you the change score, severity, and whether an
   alert was created.
5. Refresh the page — the **Alerts** section now shows the alert with the
   red diff overlay heatmap.
6. If `RESEND_API_KEY` is set, the configured recipients also get an email.

The dev console (`npm run dev` terminal) prints `[diff]` lines for every
processed snapshot so you can debug the worker even when no UI feedback is
visible.

---

## Deploy to Vercel

```bash
vercel
```

Add these env vars in the Vercel dashboard:

| Variable | Required for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | always |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`) | always |
| `SUPABASE_SERVICE_ROLE_KEY` | scan worker, change detection, delete |
| `MAPTILER_API_KEY` | scan worker |
| `RESEND_API_KEY` | email alerts (optional — without it alerts are DB-only) |
| `ALERT_FROM_EMAIL` | optional — defaults to Resend's sandbox sender |
| `NEXT_PUBLIC_APP_URL` | used in alert email links |
| `CRON_SECRET` | secures `/api/cron/scan` (Vercel attaches it automatically) |

`vercel.json` already declares a daily cron at 04:00 UTC that hits
`/api/cron/scan`. Hobby tier processes up to 5 due parcels per run; bump
`scan_frequency_days` per parcel to spread the load.

---

## Project structure

```
src/
├─ app/
│  ├─ page.tsx                          # public landing
│  ├─ login/                            # email/password + Google sign-in
│  ├─ auth/{callback,signout}/route.ts
│  ├─ setup/page.tsx                    # shown when env not configured
│  ├─ api/
│  │  ├─ scan/[id]/route.ts             # manual scan
│  │  ├─ cron/scan/route.ts             # Vercel Cron entrypoint
│  │  └─ parcels/[id]/
│  │     └─ snapshots/route.ts          # manual snapshot upload
│  └─ (app)/                            # auth-gated app shell
│     ├─ layout.tsx                     # sidebar nav + profile auto-heal
│     ├─ dashboard/page.tsx
│     ├─ map/                           # MapLibre + custom polygon drawer
│     ├─ parcels/                       # list + detail pages
│     ├─ alerts/page.tsx
│     └─ settings/                      # profile + alert recipients
├─ components/
│  ├─ delete-button.tsx
│  └─ setup-required.tsx
├─ lib/
│  ├─ supabase/{client,server,admin,middleware,env}.ts
│  ├─ tile-stitcher.ts                  # MapTiler tile fetch + sharp stitch
│  ├─ context-bake.ts                   # parcel hero image (with outline)
│  ├─ scan.ts                           # scan pipeline
│  ├─ change-detection.ts               # pixel diff + polygon mask
│  ├─ process-snapshot.ts               # diff + alert + email pipeline
│  ├─ notify.ts                         # Resend alert emails
│  ├─ delete-actions.ts                 # server actions for entity delete
│  ├─ map-style.ts                      # MapLibre satellite/streets styles
│  ├─ regions.ts                        # district list + restriction types
│  └─ sentinel-hub.ts                   # disabled, kept for future
└─ middleware.ts                        # session refresh + auth gate

supabase/migrations/
├─ 0001_init.sql                        # schema + RLS
├─ 0002_storage.sql                     # snapshots bucket
├─ 0003_backfill_profiles.sql
├─ 0004_profile_metadata.sql
├─ 0005_context_image.sql
├─ 0006_notification_emails.sql
├─ 0007_delete_policies.sql
└─ 0008_default_role_authority.sql

vercel.json                             # daily cron schedule
```

---

## Known limitations

- **No per-pixel acquisition date** on MapTiler imagery — two scans of the
  same parcel may return byte-identical PNGs until MapTiler's underlying
  mosaic refreshes (weeks–months). Switch to Sentinel-2 (commented-out code
  in `src/lib/sentinel-hub.ts`) if you want a guaranteed schedule.
- **Naïve diff** — RGB absolute difference triggers on lighting changes,
  shadow movement, mosaic re-blending, JPEG artefacts. Expect false
  positives until an ML model is plugged in.
- **No PostGIS** — all spatial work is JS-side. Fine for thousands of
  parcels; would need rework for state- or country-scale data.
- **No audit log** — there's no per-parcel history of who marked a parcel as
  `unauthorized` and when.
- **Authority verification is manual** — granted by SQL. Production would
  integrate with a government identity-proofing system.

---

## License

MIT. Built as a pilot — no warranty, fitness, or accuracy guarantees. Verify
every alert with an actual site visit before taking enforcement action.
