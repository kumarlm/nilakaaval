import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
import { SortableHeader } from "@/components/sortable-header";
import { Pagination } from "@/components/pagination";
import DeleteButton from "@/components/delete-button";
import { deleteAlertAction } from "@/lib/delete-actions";

const SORTABLE_COLUMNS = ["detected_at", "severity", "change_score", "status"] as const;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string; sort?: string; dir?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isAuthority = profile?.role === "authority";

  const params = await searchParams;
  const { page, offset } = getPaginationParams(params);
  const filterTerm = getFilterParam(params);
  const { column: sortColumn, dir: sortDir } = getSortParams(
    params,
    SORTABLE_COLUMNS,
    "detected_at",
    "desc",
  );

  // `!inner` makes the parcels join required so its columns can be matched
  // in the .or() filter below (PostgREST only allows filtering on embedded
  // resources when the join is inner).
  let query = supabase
    .from("alerts")
    .select(
      "id, parcel_id, detected_at, severity, status, change_score, notes, parcels!inner(name, district, village)",
      { count: "exact" },
    );
  if (filterTerm) {
    query = query.or(
      buildOrFilter(filterTerm, [
        "severity",
        "status",
        "notes",
        "parcels.name",
        "parcels.district",
        "parcels.village",
      ]),
    );
  }
  const { data: alerts, count } = await query
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(offset, offset + PAGE_SIZE - 1);

  const headerParams = paramsExcept(params, ["sort", "dir", "page"]);
  const filterOtherParams = paramsExcept(params, ["filter", "page"]);
  const pageOtherParams = paramsExcept(params, ["page"]);

  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mt-1 text-sm text-[var(--muted-fg)]">
        Suspected unauthorized changes detected by periodic scans. Review each
        alert and mark its outcome.
      </p>

      <div className="mt-6">
        <TableFilter
          initialValue={filterTerm}
          baseUrl="/alerts"
          otherParams={filterOtherParams}
          noun="alerts"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Detected" column="detected_at" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/alerts" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">Parcel</th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Severity" column="severity" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/alerts" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Score" column="change_score" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/alerts" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Status" column="status" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/alerts" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                  {filterTerm
                    ? `No alerts match "${filterTerm}".`
                    : "No alerts yet — upload two snapshots on a parcel to test, or wait for the daily scan."}
                </td>
              </tr>
            ) : null}
            {(alerts ?? []).map((a) => {
                const parcel = a.parcels as
                  | { name: string; district: string; village: string }
                  | { name: string; district: string; village: string }[]
                  | null;
                const p = Array.isArray(parcel) ? parcel[0] : parcel;
                return (
                  <tr key={a.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">{new Date(a.detected_at).toLocaleString()}</td>
                    <td className="px-4 py-2">
                      {p ? `${p.name} · ${p.village}, ${p.district}` : "—"}
                    </td>
                    <td className="px-4 py-2 capitalize">{a.severity}</td>
                    <td className="px-4 py-2">{a.change_score != null ? `${(Number(a.change_score) * 100).toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-2 capitalize">{a.status.replace("_", " ")}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-3">
                        <Link href={`/parcels/${a.parcel_id}`} className="text-[var(--primary)] hover:underline">
                          Review
                        </Link>
                        {isAuthority && (
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
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        <Pagination
          page={page}
          totalPages={getPaginationInfo(count, page).totalPages}
          baseUrl="/alerts"
          searchParams={pageOtherParams}
        />
      </div>
    </main>
  );
}
