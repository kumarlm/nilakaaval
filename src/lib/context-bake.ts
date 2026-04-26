import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bboxForContext, stitchSatellite } from "@/lib/tile-stitcher";

const BUCKET = "snapshots";

export type BakeResult =
  | { ok: true; imageUrl: string }
  | { ok: false; reason: string };

export async function bakeContextImage(parcelId: string): Promise<BakeResult> {
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
  let stitched;
  try {
    stitched = await stitchSatellite(bboxForContext(polygon), {
      overlay: polygon,
    });
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  const objectPath = `context/${parcelId}.png`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, stitched.png, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadErr) return { ok: false, reason: `upload: ${uploadErr.message}` };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  // Cache-bust so the browser fetches the fresh image after a re-bake.
  const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;

  await admin
    .from("parcels")
    .update({ context_image_url: imageUrl })
    .eq("id", parcelId);

  return { ok: true, imageUrl };
}
