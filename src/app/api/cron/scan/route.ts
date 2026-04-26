import { NextResponse } from "next/server";
import { findDueParcels, scanParcel } from "@/lib/scan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron entrypoint. Vercel sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when CRON_SECRET is set in env.
 *
 * Hobby tier limit: 1 scheduled cron, 60s execution. We process up to 5
 * parcels per run; the daily schedule means a project with N parcels will be
 * fully scanned in ceil(N/5) days. Adjust by raising scan_frequency_days on
 * individual parcels or moving to Pro for more crons.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const ids = await findDueParcels(5);
  const results: Array<{ parcelId: string; ok: boolean; reason?: string }> = [];
  for (const id of ids) {
    const r = await scanParcel(id);
    results.push({ parcelId: id, ok: r.ok, reason: r.ok ? undefined : r.reason });
  }
  return NextResponse.json({ scanned: results.length, results });
}
