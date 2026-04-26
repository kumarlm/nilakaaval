"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const BUCKET = "snapshots";

type ActionResult = { ok: boolean; error?: string };

async function requireAuthority(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "not configured" };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "authority") return { ok: false, error: "forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Extract the storage object path from a public URL.
 * https://xxx.supabase.co/storage/v1/object/public/snapshots/<path>?v=...
 */
function pathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/snapshots\/(.+?)(?:\?|$)/);
  return m ? m[1] : null;
}

export async function deleteParcelAction(
  parcelId: string,
  redirectTo?: string,
): Promise<ActionResult> {
  const auth = await requireAuthority();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "server not configured" };

  // 1. Storage cleanup. We list the per-parcel folders and remove everything
  //    under them, then drop the cached context image. Best-effort — DB
  //    cascade still happens even if storage delete partially fails.
  const prefixesToClear = [parcelId, `diffs/${parcelId}`];
  for (const prefix of prefixesToClear) {
    const { data: files } = await admin.storage.from(BUCKET).list(prefix, {
      limit: 1000,
    });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${prefix}/${f.name}`);
      await admin.storage.from(BUCKET).remove(paths);
    }
  }
  await admin.storage.from(BUCKET).remove([`context/${parcelId}.png`]);

  // 2. Delete row (cascades to snapshots + alerts via FK).
  const { error } = await admin.from("parcels").delete().eq("id", parcelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parcels");
  revalidatePath("/dashboard");
  revalidatePath("/alerts");
  if (redirectTo) redirect(redirectTo);
  return { ok: true };
}

export async function deleteSnapshotAction(
  snapshotId: string,
): Promise<ActionResult> {
  const auth = await requireAuthority();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "server not configured" };

  const { data: snap } = await admin
    .from("snapshots")
    .select("id, parcel_id, image_url")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!snap) return { ok: false, error: "not found" };

  // Drop the snapshot file and any diffs derived from it.
  const snapPath = pathFromUrl(snap.image_url);
  const pathsToDelete: string[] = [];
  if (snapPath) pathsToDelete.push(snapPath);

  // Diffs that used this as either baseline or current.
  const { data: relatedAlerts } = await admin
    .from("alerts")
    .select("diff_image_url")
    .or(`baseline_snapshot_id.eq.${snapshotId},current_snapshot_id.eq.${snapshotId}`);
  for (const a of relatedAlerts ?? []) {
    const p = pathFromUrl(a.diff_image_url);
    if (p) pathsToDelete.push(p);
  }
  // Also the conventional location.
  pathsToDelete.push(`diffs/${snap.parcel_id}/${snap.id}.png`);

  if (pathsToDelete.length > 0) {
    await admin.storage.from(BUCKET).remove(pathsToDelete);
  }

  const { error } = await admin
    .from("snapshots")
    .delete()
    .eq("id", snapshotId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/parcels/${snap.parcel_id}`);
  revalidatePath("/alerts");
  return { ok: true };
}

export async function deleteAlertAction(
  alertId: string,
): Promise<ActionResult> {
  const auth = await requireAuthority();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "server not configured" };

  const { data: alert } = await admin
    .from("alerts")
    .select("id, parcel_id, diff_image_url")
    .eq("id", alertId)
    .maybeSingle();
  if (!alert) return { ok: false, error: "not found" };

  const diffPath = pathFromUrl(alert.diff_image_url);
  if (diffPath) await admin.storage.from(BUCKET).remove([diffPath]);

  const { error } = await admin.from("alerts").delete().eq("id", alertId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/parcels/${alert.parcel_id}`);
  revalidatePath("/alerts");
  return { ok: true };
}
