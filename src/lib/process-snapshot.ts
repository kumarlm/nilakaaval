import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bboxForContext } from "@/lib/tile-stitcher";
import { diffSnapshots, severityFor } from "@/lib/change-detection";
import { sendAlertEmail } from "@/lib/notify";

const BUCKET = "snapshots";

export type ProcessResult =
  | {
      ok: true;
      alertId?: string;
      score: number;
      severity: string | null;
      email?: { sent: boolean; reason?: string; recipients: string[] };
    }
  | { ok: false; reason: string };

/**
 * Run change detection for a freshly-inserted snapshot vs. its immediate
 * predecessor on the same parcel. Creates an `alerts` row and sends emails
 * if the score crosses the threshold. Idempotent in spirit — calling twice
 * with the same snapshot just creates duplicate alerts; we don't dedupe.
 */
export async function processNewSnapshot(
  snapshotId: string,
  appOrigin?: string,
): Promise<ProcessResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "server not configured" };

  const { data: current } = await admin
    .from("snapshots")
    .select("id, parcel_id, image_url, captured_at")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!current) {
    console.log(`[diff] snapshot ${snapshotId} not found`);
    return { ok: false, reason: "snapshot not found" };
  }

  // Find the most recent OTHER snapshot for this parcel. Using `.neq(id)`
  // instead of `.lt(captured_at)` so two uploads within the same minute (or
  // any captured_at tie) still resolve correctly. Tie-broken by id for
  // determinism.
  const { data: previous } = await admin
    .from("snapshots")
    .select("id, image_url, captured_at")
    .eq("parcel_id", current.parcel_id)
    .neq("id", current.id)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previous) {
    console.log(
      `[diff] parcel ${current.parcel_id}: only one snapshot exists — nothing to compare against. Upload another to test.`,
    );
    return { ok: true, score: 0, severity: null }; // first snapshot, nothing to compare
  }
  console.log(
    `[diff] parcel ${current.parcel_id}: comparing ${previous.id} (${previous.captured_at}) → ${current.id} (${current.captured_at})`,
  );

  const { data: parcel } = await admin
    .from("parcels")
    .select("id, name, district, taluk, village, geom")
    .eq("id", current.parcel_id)
    .maybeSingle();
  if (!parcel) return { ok: false, reason: "parcel not found" };

  // Fetch both images.
  const [beforeBuf, afterBuf] = await Promise.all([
    fetchImage(previous.image_url),
    fetchImage(current.image_url),
  ]);

  const polygon = parcel.geom as GeoJSON.Polygon;
  const bbox = bboxForContext(polygon);

  let diff;
  try {
    diff = await diffSnapshots({
      before: beforeBuf,
      after: afterBuf,
      polygon,
      bbox,
    });
  } catch (e) {
    return { ok: false, reason: `diff failed: ${(e as Error).message}` };
  }

  const severity = severityFor(diff.score);
  console.log(
    `[diff] parcel ${current.parcel_id}: score=${(diff.score * 100).toFixed(2)}% · severity=${severity ?? "below threshold"} · maskedFraction=${diff.maskedFraction.toFixed(3)}`,
  );

  // Always store the diff image so reviewers can inspect even sub-threshold
  // changes when they manually open a parcel.
  const diffPath = `diffs/${current.parcel_id}/${current.id}.png`;
  await admin.storage
    .from(BUCKET)
    .upload(diffPath, diff.diffPng, {
      contentType: "image/png",
      upsert: true,
    });
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(diffPath);
  const diffImageUrl = `${pub.publicUrl}?v=${Date.now()}`;

  if (!severity) {
    return { ok: true, score: diff.score, severity: null };
  }

  // Insert alert.
  const { data: alert, error: alertErr } = await admin
    .from("alerts")
    .insert({
      parcel_id: current.parcel_id,
      baseline_snapshot_id: previous.id,
      current_snapshot_id: current.id,
      severity,
      change_score: diff.score,
      diff_image_url: diffImageUrl,
    })
    .select("id")
    .single();
  if (alertErr || !alert) {
    console.log(`[diff] alert insert failed: ${alertErr?.message ?? "no row"}`);
    return { ok: false, reason: `alert insert: ${alertErr?.message ?? "no row"}` };
  }
  console.log(`[diff] created alert ${alert.id}`);

  // Collect notification recipients.
  const { data: authorities } = await admin
    .from("profiles")
    .select("email, notification_emails")
    .eq("role", "authority");

  const emails = new Set<string>();
  for (const a of authorities ?? []) {
    if (a.email) emails.add(a.email);
    for (const e of a.notification_emails ?? []) {
      if (e) emails.add(e);
    }
  }

  const origin =
    appOrigin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const email = await sendAlertEmail({
    recipients: [...emails],
    parcelName: parcel.name,
    parcelLocation: `${parcel.village}, ${parcel.taluk}, ${parcel.district}`,
    parcelLink: `${origin}/parcels/${parcel.id}`,
    changeScore: diff.score,
    severity,
    diffImageUrl,
  });

  return {
    ok: true,
    alertId: alert.id,
    score: diff.score,
    severity,
    email,
  };
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
