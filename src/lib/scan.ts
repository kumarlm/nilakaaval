import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bboxForContext, stitchSatellite } from "@/lib/tile-stitcher";
import { processNewSnapshot } from "@/lib/process-snapshot";

const BUCKET = "snapshots";

export type ScanResult =
  | {
      ok: true;
      snapshotId: string;
      imageUrl: string;
      changeScore?: number;
      severity?: string | null;
      alertId?: string;
    }
  | { ok: false; reason: string };

/**
 * Fetch a high-resolution satellite snapshot for a parcel via MapTiler and
 * record it as a snapshot row. Each call is a new row — Phase 3 will diff
 * consecutive rows to detect change.
 *
 * Note: MapTiler's `satellite-v2` is a mosaic without per-pixel acquisition
 * dates, so consecutive scans may return identical bytes until the upstream
 * mosaic is refreshed. We accept that tradeoff in exchange for sub-meter
 * resolution — see project README for details.
 *
 * The snapshot is intentionally captured WITHOUT the polygon outline overlay
 * so the saved bytes are raw imagery, suitable for pixel-difference math.
 */
export async function scanParcel(parcelId: string): Promise<ScanResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "server not configured" };

  const { data: parcel, error: parcelErr } = await admin
    .from("parcels")
    .select("id, geom")
    .eq("id", parcelId)
    .maybeSingle();

  if (parcelErr || !parcel) {
    return { ok: false, reason: parcelErr?.message ?? "parcel not found" };
  }

  const polygon = parcel.geom as GeoJSON.Polygon;
  const bbox = bboxForContext(polygon);

  let img;
  try {
    img = await stitchSatellite(bbox);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  const capturedAt = new Date();
  const objectPath = `${parcelId}/${capturedAt.toISOString().replace(/[:.]/g, "-")}.png`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, img.png, {
      contentType: "image/png",
      upsert: false,
    });
  if (uploadErr) return { ok: false, reason: `upload: ${uploadErr.message}` };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  const imageUrl = pub.publicUrl;

  const { data: snap, error: insertErr } = await admin
    .from("snapshots")
    .insert({
      parcel_id: parcelId,
      captured_at: capturedAt.toISOString(),
      source: "maptiler-satellite-v2",
      image_url: imageUrl,
      metadata: {
        bbox,
        width: img.width,
        height: img.height,
        zoom: img.zoom,
      },
    })
    .select("id")
    .single();
  if (insertErr || !snap) {
    return { ok: false, reason: `insert: ${insertErr?.message ?? "no row"}` };
  }

  await admin
    .from("parcels")
    .update({ last_scanned_at: capturedAt.toISOString() })
    .eq("id", parcelId);

  // Run change detection vs the previous snapshot. Failure here is non-fatal
  // — the snapshot itself is already saved.
  let changeScore: number | undefined;
  let severity: string | null | undefined;
  let alertId: string | undefined;
  try {
    const r = await processNewSnapshot(snap.id);
    if (r.ok) {
      changeScore = r.score;
      severity = r.severity;
      alertId = r.alertId;
    }
  } catch (e) {
    console.error("[scan] processNewSnapshot failed:", (e as Error).message);
  }

  return { ok: true, snapshotId: snap.id, imageUrl, changeScore, severity, alertId };
}

/** Return parcel ids that are due for re-scan based on scan_frequency_days. */
export async function findDueParcels(limit = 20): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  // Pull a reasonable working set; filter due-ness in JS to keep the SQL
  // portable and avoid intervals dependent on extensions.
  const { data } = await admin
    .from("parcels")
    .select("id, scan_frequency_days, last_scanned_at, status")
    .eq("status", "active")
    .order("last_scanned_at", { ascending: true, nullsFirst: true })
    .limit(limit * 4);

  const now = Date.now();
  const due: string[] = [];
  for (const p of data ?? []) {
    if (!p.last_scanned_at) {
      due.push(p.id);
    } else {
      const age = (now - new Date(p.last_scanned_at).getTime()) / 86_400_000;
      if (age >= p.scan_frequency_days) due.push(p.id);
    }
    if (due.length >= limit) break;
  }
  return due;
}
