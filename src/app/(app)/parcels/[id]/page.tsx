import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESTRICTION_TYPES } from "@/lib/regions";
import { buildOrFilter } from "@/lib/list-filter";
import {
  PAGE_SIZE,
  getPaginationParams,
  getPaginationInfo,
  getFilterParam,
  getSortParams,
  paramsExcept,
} from "@/lib/pagination";
import { TableFilter } from "@/components/table-filter";
import { Pagination } from "@/components/pagination";
import ParcelMiniMap from "./mini-map";
import RescanButton from "./rescan-button";
import UploadSnapshot from "./upload-snapshot";
import DeleteButton from "@/components/delete-button";
import {
  deleteAlertAction,
  deleteParcelAction,
  deleteSnapshotAction,
} from "@/lib/delete-actions";

const SNAPSHOT_SORTABLE = ["captured_at", "source", "cloud_cover"] as const;
const ALERT_SORTABLE = ["detected_at", "severity", "status", "change_score"] as const;

type DetailSearchParams = {
  snapshot_page?: string;
  snapshot_filter?: string;
  snapshot_sort?: string;
  snapshot_dir?: string;
  alert_page?: string;
  alert_filter?: string;
  alert_sort?: string;
  alert_dir?: string;
};

export default async function ParcelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DetailSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

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

  const { page: snapshotPage, offset: snapshotOffset } = getPaginationParams(sp, "snapshot_page");
  const snapshotFilter = getFilterParam(sp, "snapshot_filter");
  const { column: snapshotSort, dir: snapshotDir } = getSortParams(
    sp,
    SNAPSHOT_SORTABLE,
    "captured_at",
    "desc",
    "snapshot_sort",
    "snapshot_dir",
  );

  const { page: alertPage, offset: alertOffset } = getPaginationParams(sp, "alert_page");
  const alertFilter = getFilterParam(sp, "alert_filter");
  const { column: alertSort, dir: alertDir } = getSortParams(
    sp,
    ALERT_SORTABLE,
    "detected_at",
    "desc",
    "alert_sort",
    "alert_dir",
  );

  let snapshotQuery = supabase
    .from("snapshots")
    .select("id, captured_at, image_url, source, cloud_cover", { count: "exact" })
    .eq("parcel_id", id);
  if (snapshotFilter) {
    snapshotQuery = snapshotQuery.or(buildOrFilter(snapshotFilter, ["source"]));
  }
  const { data: snapshots, count: snapshotCount } = await snapshotQuery
    .order(snapshotSort, { ascending: snapshotDir === "asc" })
    .range(snapshotOffset, snapshotOffset + PAGE_SIZE - 1);

  let alertQuery = supabase
    .from("alerts")
    .select("id, detected_at, severity, status, change_score, diff_image_url, notes", { count: "exact" })
    .eq("parcel_id", id);
  if (alertFilter) {
    alertQuery = alertQuery.or(buildOrFilter(alertFilter, ["severity", "status", "notes"]));
  }
  const { data: alerts, count: alertCount } = await alertQuery
    .order(alertSort, { ascending: alertDir === "asc" })
    .range(alertOffset, alertOffset + PAGE_SIZE - 1);

  const type =
    RESTRICTION_TYPES.find((r) => r.value === parcel.restriction_type)?.label ??
    parcel.restriction_type;

  const snapshotFilterOtherParams = paramsExcept(sp, ["snapshot_filter", "snapshot_page"]);
  const snapshotPageOtherParams = paramsExcept(sp, ["snapshot_page"]);
  const alertFilterOtherParams = paramsExcept(sp, ["alert_filter", "alert_page"]);
  const alertPageOtherParams = paramsExcept(sp, ["alert_page"]);

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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Snapshots</h2>
          <SortLinks
            baseUrl={`/parcels/${id}`}
            otherParams={paramsExcept(sp, ["snapshot_sort", "snapshot_dir", "snapshot_page"])}
            sortParamName="snapshot_sort"
            dirParamName="snapshot_dir"
            activeColumn={snapshotSort}
            activeDir={snapshotDir}
            options={[
              { label: "Newest first", column: "captured_at", dir: "desc" },
              { label: "Oldest first", column: "captured_at", dir: "asc" },
              { label: "Source", column: "source", dir: "asc" },
            ]}
          />
        </div>
        {snapshotCount === 0 && !snapshotFilter ? (
          <p className="mt-2 text-sm text-[var(--muted-fg)]">
            No imagery captured yet. Click <strong>Re-scan now</strong> above
            to capture the first snapshot.
          </p>
        ) : (
          <>
            <div className="mt-3">
              <TableFilter
                initialValue={snapshotFilter}
                baseUrl={`/parcels/${id}`}
                otherParams={snapshotFilterOtherParams}
                paramName="snapshot_filter"
                pageParamName="snapshot_page"
                noun="snapshots"
              />
            </div>
            {(snapshots ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">
                No snapshots match &ldquo;{snapshotFilter}&rdquo;.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-3">
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
            <Pagination
              page={snapshotPage}
              totalPages={getPaginationInfo(snapshotCount, snapshotPage).totalPages}
              baseUrl={`/parcels/${id}`}
              paramName="snapshot_page"
              searchParams={snapshotPageOtherParams}
            />
          </>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Alerts</h2>
          <SortLinks
            baseUrl={`/parcels/${id}`}
            otherParams={paramsExcept(sp, ["alert_sort", "alert_dir", "alert_page"])}
            sortParamName="alert_sort"
            dirParamName="alert_dir"
            activeColumn={alertSort}
            activeDir={alertDir}
            options={[
              { label: "Newest first", column: "detected_at", dir: "desc" },
              { label: "Oldest first", column: "detected_at", dir: "asc" },
              { label: "Severity", column: "severity", dir: "desc" },
            ]}
          />
        </div>
        {alertCount === 0 && !alertFilter ? (
          <p className="mt-2 text-sm text-[var(--muted-fg)]">No alerts yet.</p>
        ) : (
          <>
            <div className="mt-3">
              <TableFilter
                initialValue={alertFilter}
                baseUrl={`/parcels/${id}`}
                otherParams={alertFilterOtherParams}
                paramName="alert_filter"
                pageParamName="alert_page"
                noun="alerts"
              />
            </div>
            {(alerts ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted-fg)]">
                No alerts match &ldquo;{alertFilter}&rdquo;.
              </p>
            ) : (
              <ul className="space-y-3">
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
            <Pagination
              page={alertPage}
              totalPages={getPaginationInfo(alertCount, alertPage).totalPages}
              baseUrl={`/parcels/${id}`}
              paramName="alert_page"
              searchParams={alertPageOtherParams}
            />
          </>
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

function SortLinks({
  baseUrl,
  otherParams,
  sortParamName,
  dirParamName,
  activeColumn,
  activeDir,
  options,
}: {
  baseUrl: string;
  otherParams: string;
  sortParamName: string;
  dirParamName: string;
  activeColumn: string;
  activeDir: "asc" | "desc";
  options: Array<{ label: string; column: string; dir: "asc" | "desc" }>;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--muted-fg)]">
      <span>Sort:</span>
      {options.map((o) => {
        const isActive = activeColumn === o.column && activeDir === o.dir;
        const params = new URLSearchParams(otherParams);
        params.set(sortParamName, o.column);
        params.set(dirParamName, o.dir);
        return (
          <Link
            key={o.label}
            href={`${baseUrl}?${params.toString()}`}
            className={isActive ? "font-medium text-[var(--primary)]" : "hover:underline"}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
