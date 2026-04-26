# Build Log — Nilakaaval

A chronological record of how this project was built: the requirements that
shaped it, the architecture decisions made, the features shipped, the bugs
encountered, and the pivots that ended up changing direction.

This document deliberately omits secrets, account names, project IDs, and
other personal information so it can be shared as a portfolio artefact.

---

## 0. Genesis

### Original brief

> Build a website to detect unauthorized construction on restricted lands in
> Tamil Nadu. Use Google Maps to extract coordinates, take a picture of the
> location, compare against the previous state with an ML model, and notify
> via SMS/email. Host free on Vercel.

### Reality check

A few constraints made the original sketch infeasible as-stated:

| Constraint | Why it blocked the original plan |
|---|---|
| Google Maps Static API ToS | Forbids automated scraping / storage of tiles for monitoring or surveillance use. |
| Google satellite imagery refresh cadence | Irregular (months to years), no per-pixel acquisition timestamps — useless for change-detection over time. |
| Vercel Hobby function limits | 10 s timeout (60 s with `maxDuration` on Pro), ~250 MB bundle, no GPU. Can't run real ML inference inline. |
| SMS providers | All require credit; Twilio trial is short and capped. |
| Sentinel-2 resolution | 10 m/pixel native — good for fields/forests, terrible for ~14 m wide buildings. |

### Final architecture chosen

```
Browser ──▶  Next.js 16 on Vercel Hobby
                │
                ├─▶ Supabase Postgres + Auth + Storage
                ├─▶ MapTiler  (server-side tile stitching with sharp)
                ├─▶ Gmail SMTP / Resend  (alert emails)
                └─▶ Vercel Cron  (daily scan)
```

Key decisions:

1. **Inline worker, not a separate service.** Vercel functions handle
   tile-fetch + sharp pixel diff + Supabase write end-to-end inside one
   request. No queue, no Docker, no second host. Avoids the bundle/timeout
   trap by keeping each request small.
2. **Polygons in `jsonb`, not PostGIS.** The Supabase free tier doesn't
   require enabling PostGIS, and JS-side spatial work is fine for thousands
   of parcels.
3. **MapTiler for visuals, Sentinel-2 commented out for now.** See *Pivot 2*
   below.

---

## 1. Phase 1 — Foundation

### What shipped

- Next.js 16 scaffold (App Router, TypeScript, Tailwind v4, ESLint).
- Supabase client/server/middleware helpers — including a graceful "setup
  required" page when env is missing.
- Initial schema (`0001_init.sql`):
  - `profiles` with `role` enum (`authority` | `viewer`).
  - `parcels` with TN admin metadata (district / taluk / village / survey
    no.) and the polygon as GeoJSON `jsonb`.
  - `snapshots` keyed by parcel.
  - `alerts` referencing baseline + current snapshots.
  - Row-Level Security gating writes to `authority`.
- Storage bucket `snapshots` with public-read RLS (`0002_storage.sql`).
- Sign-up + sign-in flow.
- Authenticated app shell with sidebar nav.
- Parcels list and detail pages.
- Map page with MapLibre.

### Subtle issues fixed during Phase 1

| Issue | Fix |
|---|---|
| Supabase env loaded under either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `..._PUBLISHABLE_KEY` (newer projects) | Env helper accepts either name. |
| Crash if env unset (browser stack trace) | Server `createClient()` returns `null`; pages render a `SetupRequired` card; middleware short-circuits. |
| Profile row missing for users who signed up before the trigger ran | App layout self-heals via service-role insert; backfill SQL provided (`0003_backfill_profiles.sql`). |
| Trigger didn't capture `full_name` from OAuth metadata | `0004_profile_metadata.sql` reads `raw_user_meta_data`. |

---

## 2. Phase 2a — First imagery integration (Sentinel-2)

### What shipped

- `src/lib/sentinel-hub.ts` — OAuth client-credentials flow with token
  cache, Process API request with a true-colour evalscript, least-cloudy
  mosaicking over a 30-day window.
- `bboxFromPolygon` with a 500 m minimum side, so even tiny parcels get
  enough native pixels (10 m/px) for the worker to process.
- `src/lib/scan.ts` — `scanParcel(id)` end-to-end: fetch → upload to
  Storage → insert `snapshots` row → bump `last_scanned_at`.
- `src/lib/supabase/admin.ts` — service-role client used by the worker (RLS
  bypass).
- `POST /api/scan/[id]` (manual) and `GET /api/cron/scan` (Vercel Cron, daily,
  processes up to 5 due parcels per run).
- "Re-scan now" button on parcel detail.
- `vercel.json` cron schedule.

### Why this didn't satisfy

For a 0.14 ha parcel (~37 × 37 m) the resulting Sentinel-2 patch was about
**4 × 4 native pixels** of actual data, upsampled to a 128 px PNG. Visually
useless for human review of small urban plots, even though
algorithmically valid for change detection.

This kicked off **Pivot 2**.

---

## 3. Pivot 1 — Map drawer

`@mapbox/mapbox-gl-draw` doesn't render correctly inside MapLibre v3+
(its CSS class names don't match MapLibre's). Rather than ship a fragile
patch, we replaced it with a **custom polygon drawer** built on plain
MapLibre sources/layers:

- `click` adds a vertex.
- `mousemove` updates a dashed rubber-band line.
- `dblclick` / Enter closes the polygon; `Esc` cancels.
- Four GeoJSON sources: vertices (circles), line (in-progress polygon
  outline), rubber band (dashed), fill preview (translucent).

Side benefit: full Tailwind styling, no foreign CSS.

---

## 4. Pivot 2 — MapTiler instead of Sentinel-2

After seeing the blocky Sentinel-2 output on a small parcel, the project
switched its imagery source.

### What changed

- New `src/lib/tile-stitcher.ts`:
  - Compute Web-Mercator tile range covering a bbox at a chosen zoom (~1.5
    m/px target).
  - Fetch all tiles in parallel from MapTiler `satellite-v2`.
  - Composite onto a sharp canvas, extract the bbox-aligned crop.
- `bboxForContext(polygon)` — small padding, no 500 m minimum, square
  output. Tighter than the Sentinel-2 bbox so the parcel is the dominant
  subject.
- Polygon outline overlay rasterised via SVG → composited onto the cropped
  PNG so reviewers can see exactly which pixels are inside the parcel.
- Switched `scanParcel` to use MapTiler. Sentinel-2 code preserved
  commented-out for future hybrid use.

### Bugs fixed in the stitcher

| Symptom | Root cause | Fix |
|---|---|---|
| `Image to composite must have same dimensions or smaller` (first try) | Hardcoded `TILE_SIZE = 256`, but MapTiler `satellite-v2` returns 512 × 512 by default. | Probe metadata of first tile. |
| Same error after the metadata fix | Different tiles occasionally returned different sizes; tiles also sometimes overflowed expected slots. | Resize every tile to a fixed 512 × 512 with `fit: "fill"` *before* composite — defensive normalisation. |
| Same error during overlay step | `sharp` rasterises SVGs at higher DPI than the declared `width/height`, so the overlay buffer was larger than the cropped base. | Pre-rasterise the SVG buffer with `.resize(W, H, { fit: "fill" })` and read the cropped image's actual metadata before deciding overlay dimensions. |
| Hero image was a wide black canvas with the parcel barely visible | Bbox was 500 m square (Sentinel-2 holdover) — for a tiny parcel that's mostly empty space | Tightened bbox via `bboxForContext` (50 % padding, ~30 m floor only) and reduced UI display height. |

### Tradeoff acknowledged

MapTiler `satellite-v2` is a mosaic with **no per-pixel acquisition date**.
Two consecutive scans usually return byte-identical PNGs until MapTiler
refreshes their upstream source. For a *guaranteed* reproducible
change-detection cadence, Sentinel-2 is correct; for *human-readable* visual
review, MapTiler wins. The current code path optimises for the latter.

---

## 5. Pivot 3 — Auth flow

The first cut used Supabase magic-link sign-in. This was switched to:

- **Email + password** sign-up and sign-in.
- **Google OAuth** as an alternative.
- Tabbed `/login` page with shared callback handling.
- `0004_profile_metadata.sql` updated the profile-creation trigger to
  capture `full_name` from either signup metadata or OAuth provider data.

---

## 6. Phase 3 — Change detection

### What shipped

- `src/lib/change-detection.ts`
  - Both images normalised to the same dimensions (defensive resize).
  - Polygon → SVG → rasterised greyscale mask the same size.
  - Per-pixel mean RGB diff (0..255).
  - Score = mean diff in masked area ÷ 255 (range 0..1).
  - Red-tint heatmap overlay, alpha proportional to local change.
- `src/lib/process-snapshot.ts`
  - Find the most recent OTHER snapshot for the parcel.
  - Diff vs previous, save heatmap to `diffs/<parcelId>/<snapshotId>.png`.
  - Severity thresholds: < 5 % no alert, 5–10 % low, 10–20 % medium, ≥ 20 %
    high.
  - Insert `alerts` row referencing both snapshots and the diff URL.
  - Dispatch alert email.
- `scanParcel` and the manual upload route both call `processNewSnapshot`
  inline.
- Parcel detail page now lists alerts with their diff thumbnails.
- `0006_notification_emails.sql` adds `profiles.notification_emails`
  (extra recipients beyond the user's account email).

### Bug: alerts never fired even after two uploads

The previous-snapshot lookup used `lt(captured_at, current.captured_at)`.
The manual upload form's `datetime-local` input is **minute-precision**, so
two uploads in the same minute had identical `captured_at` values and the
strict-`<` filter returned nothing → "first snapshot" code path → no alert.

Fix: switched the lookup to `neq(id, current.id)` ordered by
`(captured_at desc, id desc)` with `limit(1)`. Determinism in tied cases,
no minute-aliasing trap.

### Manual upload affordance

Real-world testing of change detection requires actual construction —
which we can't conjure. So the parcel detail page has an **Upload
snapshot** dialog: pick any image, optional captured-at, submit. The diff
runs against whichever snapshot exists already, and the response surfaces
the resulting score / severity / alert ID / email status.

---

## 7. Phase 4 — Email delivery

### First attempt: Resend only

`src/lib/notify.ts` posted to the Resend HTTP API with a fallback console
log if `RESEND_API_KEY` was unset. Sender defaulted to Resend's
`onboarding@resend.dev` sandbox.

### Bug encountered

Resend's sandbox sender returns HTTP 403 for any recipient that isn't the
Resend-account holder's verified email. Without a verified domain there's
no clean way past this.

### Pivot 4: Gmail SMTP

Added `nodemailer` and rewrote the email layer to a **prioritised cascade**:

1. **Gmail SMTP** if `GMAIL_USER` + `GMAIL_APP_PASSWORD` are set.
2. **Resend** if `RESEND_API_KEY` is set.
3. **Console log** fallback so the rest of the pipeline is testable
   without any email backend.

Gmail SMTP needs only an app password (https://myaccount.google.com/apppasswords)
— no domain verification, ~500 messages/day, sends to anyone. The `via`
field in the response surfaces which backend actually delivered.

### Diagnostics added

- `[notify]` log lines on every send attempt with backend, recipient, and
  full error body on failure.
- `sendTestEmail()` helper backed by a "Send test email" button on
  `/settings`.
- The upload-result panel on the parcel detail page now shows
  "Email sent to N recipients" / "Email NOT sent: \<reason\>" inline.

---

## 8. CRUD, ownership, polish

### Delete

- `0007_delete_policies.sql` — RLS allows authority to delete snapshots
  and alerts (parcels already had this policy).
- `src/lib/delete-actions.ts` — three server actions:
  - `deleteParcelAction` lists per-parcel storage prefixes
    (`<parcelId>/`, `diffs/<parcelId>/`, `context/<parcelId>.png`) and
    removes the files, then deletes the row (cascades to snapshots and
    alerts via FK).
  - `deleteSnapshotAction` removes the snapshot's image plus any diff
    images that referenced it.
  - `deleteAlertAction` removes the diff image then the row.
- `<DeleteButton>` shared client component with a `confirm()` prompt.

### Default role flip

`0008_default_role_authority.sql` — pilot policy is that every signup is
assumed to be a TN official, so `profiles.role` defaults to `authority`
and existing `viewer` rows are promoted. Override manually in SQL when a
read-only role is wanted.

### Settings page cleanup

Stripped developer-facing copy ("Email delivery", "Become an authority")
that didn't belong on a user-facing page. Kept the profile summary, the
extra-recipients form, and the test-email button.

### Branding

Renamed from working title to **Nilakaaval** (நிலக்காவல், Tamil for
"Land Guard"). Updated:

- `package.json` name.
- HTML `<title>` and meta description.
- Sidebar/landing logo glyph (நி).
- Email template header, subject, and CTA.
- README title with the Tamil etymology.

---

## 9. Map experience

- Esri World Imagery as the default basemap (free, no key, sub-meter in
  many areas).
- Carto Voyager labels overlaid at 90 % opacity for street/place names.
- Bottom-left button toggles between *Satellite* and *Streets*; a
  `style.load` listener re-adds the parcel and drawing layers after a
  basemap swap so any in-progress drawing survives.

---

## 10. Project structure as it stands

```
src/
├─ app/
│  ├─ (app)/                          # auth-gated app shell
│  │  ├─ layout.tsx
│  │  ├─ dashboard/
│  │  ├─ map/                         # MapLibre + custom polygon drawer
│  │  ├─ parcels/                     # list, detail, upload, mini-map
│  │  ├─ alerts/
│  │  └─ settings/                    # profile + alert recipients + test button
│  ├─ api/
│  │  ├─ scan/[id]/route.ts           # manual scan
│  │  ├─ cron/scan/route.ts           # Vercel Cron entrypoint
│  │  └─ parcels/[id]/snapshots/      # manual upload (test)
│  ├─ auth/{callback,signout}/
│  ├─ login/                          # email+password + Google OAuth
│  ├─ setup/                          # shown when env unconfigured
│  └─ page.tsx                        # public landing
├─ components/                        # delete-button, setup-required
├─ lib/
│  ├─ supabase/{client,server,admin,middleware,env}.ts
│  ├─ tile-stitcher.ts                # MapTiler tiles → sharp stitch
│  ├─ scan.ts                         # scan pipeline
│  ├─ change-detection.ts             # pixel diff + polygon mask
│  ├─ process-snapshot.ts             # diff + alert + email
│  ├─ notify.ts                       # Gmail SMTP / Resend cascade
│  ├─ delete-actions.ts               # server actions for entity delete
│  ├─ map-style.ts                    # MapLibre satellite / streets styles
│  ├─ tn-data.ts                      # TN districts + restriction types
│  └─ sentinel-hub.ts                 # disabled (commented)
└─ middleware.ts                      # session refresh + auth gate

supabase/migrations/
├─ 0001_init.sql                      # schema + RLS
├─ 0002_storage.sql                   # snapshots bucket
├─ 0003_backfill_profiles.sql
├─ 0004_profile_metadata.sql
├─ 0005_context_image.sql             # legacy column (kept for data)
├─ 0006_notification_emails.sql
├─ 0007_delete_policies.sql
└─ 0008_default_role_authority.sql

vercel.json                            # daily cron
```

---

## 11. Outstanding tradeoffs / known limitations

- **MapTiler mosaic has no per-pixel timestamp.** Until upstream sources
  refresh, repeat scans return identical PNGs.
- **Naïve RGB diff.** Sensitive to lighting, shadow movement, mosaic
  re-blending, JPEG artefacts. Expect false positives until an ML model
  is plugged in.
- **No PostGIS.** All spatial work is JS-side.
- **No audit log.** No per-parcel history of *who* marked it as
  unauthorized and *when*.
- **Authority verification is manual.** Production would integrate with
  TN e-Sevai or similar identity proofing.
- **Sentinel-2 path commented out.** Re-enable in
  `src/lib/sentinel-hub.ts` for a guaranteed change-detection cadence.
- **Email backend has no domain branding** when using Gmail SMTP —
  recipients see the configured Gmail address. Buy a domain and switch to
  Resend / SES for a polished sender.

---

## 12. Suggested next steps

1. **Replace pixel diff with a proper change-detection model.** A small
   Siamese U-Net or ChangeFormer on a free Hugging Face Space, called by
   `processNewSnapshot` instead of the current `diffSnapshots`.
2. **Permit registry cross-check.** Today the system says "possible
   change"; integrating a permit/parcel-registry lookup would let it
   actually classify *unauthorized*.
3. **Telegram bot for alerts.** Free, no domain needed, real-time push
   notifications.
4. **Audit log table.** Append-only: who changed what alert status when,
   with reason text.
5. **Mobile-friendly review screen.** Field officers will be on phones.
6. **Per-parcel ownership / district scoping.** Right now any authority
   sees every parcel; restrict to the user's district.

---

## 13. Lessons learned

- **Reach for the simplest free building block first.** Switching from a
  separate worker process to inline Vercel functions removed ~80 % of the
  infra; the change-detection pipeline runs end-to-end inside one HTTP
  request.
- **Test the critical path the moment it exists.** The biggest bugs
  (missing predecessor lookup, sandbox sender restriction) were both
  surfaced by test cases that only ran late. Every backend that touches
  external APIs (Resend, MapTiler, Sentinel Hub) needs a one-button
  diagnostic from day one.
- **Free-tier ToS matters.** Two providers were ruled out (Google Maps
  scraping, Resend without a domain) because their free tiers don't
  permit the use case. Reading the ToS up front would have saved a
  pivot.
- **Defensive image processing.** Three separate `sharp` "dimensions
  must match" failures all came from upstream variability. Always
  normalise inputs (`fit: "fill"` resize) before compositing.
- **Surface backend choice in the response.** When email delivery has
  multiple paths, the API response should include the `via` field so a
  reviewer can debug which backend actually sent without grepping logs.
