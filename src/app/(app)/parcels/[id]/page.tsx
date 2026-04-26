import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESTRICTION_TYPES } from "@/lib/tn-data";
import ParcelMiniMap from "./mini-map";
import RescanButton from "./rescan-button";
import ContextHero from "./context-hero";
import UploadSnapshot from "./upload-snapshot";
import DeleteButton from "@/components/delete-button";
import {
  deleteAlertAction,
  deleteParcelAction,
  deleteSnapshotAction,
} from "@/lib/delete-actions";

export default async function ParcelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: parcel } = await supabase
    .from("parcels")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!parcel) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const canScan = profile?.role === "authority";

  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id, captured_at, image_url, source, cloud_cover")
    .eq("parcel_id", id)
    .order("captured_at", { ascending: false })
    .limit(10);

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, detected_at, severity, status, change_score, diff_image_url")
    .eq("parcel_id", id)
    .order("detected_at", { ascending: false })
    .limit(10);

  const type =
    RESTRICTION_TYPES.find((r) => r.value === parcel.restriction_type)?.label ??
    parcel.restriction_type;

  return (
    <main className="flex-1 p-6 max-w-5xl">
      <Link href="/parcels" className="text-sm text-[var(--muted-fg)] hover:underline">
        ← All parcels
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{parcel.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted-fg)]">
            {type} · {parcel.village}, {parcel.taluk}, {parcel.district}
            {parcel.survey_no ? ` · Survey ${parcel.survey_no}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UploadSnapshot parcelId={parcel.id} canUpload={canScan} />
          <RescanButton parcelId={parcel.id} canScan={canScan} />
          {canScan && (
            <DeleteButton
              label="Delete parcel"
              variant="danger"
              confirmText={`Delete parcel "${parcel.name}"? All its snapshots and alerts will be removed too. This cannot be undone.`}
              action={async () => {
                "use server";
                return deleteParcelAction(parcel.id, "/parcels");
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-6">
        <ContextHero parcelId={parcel.id} imageUrl={parcel.context_image_url} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] font-medium">
            Boundary
          </div>
          <ParcelMiniMap geom={parcel.geom as GeoJSON.Polygon} />
        </section>

        <section className="rounded-lg border border-[var(--border)]">
          <div className="px-4 py-3 border-b border-[var(--border)] font-medium">
            Metadata
          </div>
          <dl className="divide-y divide-[var(--border)] text-sm">
            <Row label="Area" value={parcel.area_hectares ? `${Number(parcel.area_hectares).toFixed(2)} ha` : "—"} />
            <Row label="Scan frequency" value={`${parcel.scan_frequency_days} days`} />
            <Row label="Last scan" value={parcel.last_scanned_at ? new Date(parcel.last_scanned_at).toLocaleString() : "—"} />
            <Row label="Status" value={parcel.status} />
            <Row label="Notes" value={parcel.notes ?? "—"} />
          </dl>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Snapshots</h2>
        {(snapshots ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted-fg)]">
            No imagery captured yet. Click <strong>Re-scan now</strong> above
            to capture the first snapshot.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {snapshots!.map((s) => (
              <li key={s.id} className="rounded-lg border border-[var(--border)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image_url} alt="" className="w-full h-32 object-cover" />
                <div className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span>{new Date(s.captured_at).toLocaleDateString()}</span>
                    {canScan && (
                      <DeleteButton
                        label="Delete"
                        variant="link"
                        confirmText="Delete this snapshot? Any alerts referencing it will also lose their reference."
                        action={async () => {
                          "use server";
                          return deleteSnapshotAction(s.id);
                        }}
                      />
                    )}
                  </div>
                  <div className="text-[var(--muted-fg)]">{s.source}{s.cloud_cover != null ? ` · ${Math.round(Number(s.cloud_cover))}% cloud` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Alerts</h2>
        {(alerts ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted-fg)]">No alerts yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts!.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-[var(--border)] overflow-hidden md:flex"
              >
                {a.diff_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.diff_image_url}
                    alt="Change visualization"
                    className="md:w-64 md:h-40 w-full h-40 object-cover"
                  />
                )}
                <div className="flex-1 p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${
                          a.severity === "high"
                            ? "bg-red-100 text-red-900"
                            : a.severity === "medium"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-900"
                        }`}
                      >
                        {a.severity}
                      </span>
                      <span className="text-[var(--muted-fg)]">
                        {new Date(a.detected_at).toLocaleString()}
                      </span>
                    </div>
                    {canScan && (
                      <DeleteButton
                        label="Delete"
                        variant="link"
                        confirmText="Delete this alert and its diff image?"
                        action={async () => {
                          "use server";
                          return deleteAlertAction(a.id);
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-2">
                    Change score:{" "}
                    <strong>
                      {a.change_score != null
                        ? `${(Number(a.change_score) * 100).toFixed(2)}%`
                        : "—"}
                    </strong>
                  </div>
                  <div className="mt-1 text-xs capitalize text-[var(--muted-fg)]">
                    Status: {a.status.replace("_", " ")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex px-4 py-2.5">
      <dt className="w-40 text-[var(--muted-fg)]">{label}</dt>
      <dd className="flex-1">{value}</dd>
    </div>
  );
}
