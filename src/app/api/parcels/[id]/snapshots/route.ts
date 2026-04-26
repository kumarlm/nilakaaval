import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processNewSnapshot } from "@/lib/process-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "snapshots";

/**
 * Upload a snapshot image manually for a parcel. Used to test change
 * detection without waiting for the satellite mosaic to refresh — drop in
 * a "before" image, then a slightly-edited "after" image, and the diff
 * pipeline runs the same as a real scan.
 *
 * Auth: authority role.
 * Body: multipart/form-data with `file` (PNG/JPEG) and optional
 *       `captured_at` (ISO timestamp).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "authority") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: parcelId } = await context.params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    return NextResponse.json(
      { error: `bad form data: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' in form data" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "file must be an image" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (10 MB max)" }, { status: 413 });
  }

  const capturedAtRaw = formData.get("captured_at");
  const capturedAt =
    typeof capturedAtRaw === "string" && capturedAtRaw
      ? new Date(capturedAtRaw)
      : new Date();
  if (isNaN(capturedAt.getTime())) {
    return NextResponse.json({ error: "invalid captured_at" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "server not configured" }, { status: 503 });
  }

  // Verify parcel exists and authority can write it (RLS allows authority).
  const { data: parcel } = await admin
    .from("parcels")
    .select("id")
    .eq("id", parcelId)
    .maybeSingle();
  if (!parcel) {
    return NextResponse.json({ error: "parcel not found" }, { status: 404 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/jpeg" ? "jpg" : "png";
  const objectPath = `${parcelId}/${capturedAt
    .toISOString()
    .replace(/[:.]/g, "-")}-manual.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, buf, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `upload: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: snap, error: insertErr } = await admin
    .from("snapshots")
    .insert({
      parcel_id: parcelId,
      captured_at: capturedAt.toISOString(),
      source: "manual-upload",
      image_url: pub.publicUrl,
      metadata: { uploaded_by: user.id, original_name: file.name },
    })
    .select("id")
    .single();
  if (insertErr || !snap) {
    return NextResponse.json(
      { error: `insert: ${insertErr?.message ?? "no row"}` },
      { status: 500 },
    );
  }

  await admin
    .from("parcels")
    .update({ last_scanned_at: capturedAt.toISOString() })
    .eq("id", parcelId);

  // Run change detection vs the previous snapshot.
  const origin = new URL(request.url).origin;
  const result = await processNewSnapshot(snap.id, origin);

  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      snapshotId: snap.id,
      imageUrl: pub.publicUrl,
      processError: result.reason,
    });
  }
  return NextResponse.json({
    ok: true,
    snapshotId: snap.id,
    imageUrl: pub.publicUrl,
    changeScore: result.score,
    severity: result.severity,
    alertId: result.alertId,
    email: result.email,
  });
}
