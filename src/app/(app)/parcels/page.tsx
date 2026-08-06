import Link from "next/link";
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
import { SortableHeader } from "@/components/sortable-header";
import { Pagination } from "@/components/pagination";
import DeleteButton from "@/components/delete-button";
import { deleteParcelAction } from "@/lib/delete-actions";

const SORTABLE_COLUMNS = ["name", "restriction_type", "survey_no", "area_hectares", "last_scanned_at"] as const;

export default async function ParcelsPage({
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
    "created_at",
    "desc",
  );

  let query = supabase
    .from("parcels")
    .select(
      "id, name, district, taluk, village, survey_no, restriction_type, area_hectares, last_scanned_at, status, notes",
      { count: "exact" },
    );
  if (filterTerm) {
    query = query.or(
      buildOrFilter(filterTerm, [
        "name",
        "district",
        "taluk",
        "village",
        "survey_no",
        "notes",
        "restriction_type",
        "status",
      ]),
    );
  }
  const { data: parcels, count } = await query
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(offset, offset + PAGE_SIZE - 1);

  const headerParams = paramsExcept(params, ["sort", "dir", "page"]);
  const filterOtherParams = paramsExcept(params, ["filter", "page"]);
  const pageOtherParams = paramsExcept(params, ["page"]);

  return (
    <main className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Parcels</h1>
        <Link
          href="/map"
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)]"
        >
          + New on map
        </Link>
      </div>

      <div className="mt-6">
        <TableFilter
          initialValue={filterTerm}
          baseUrl="/parcels"
          otherParams={filterOtherParams}
          noun="parcels"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Name" column="name" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/parcels" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Type" column="restriction_type" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/parcels" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Survey #" column="survey_no" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/parcels" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Area (ha)" column="area_hectares" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/parcels" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2 font-medium">
                <SortableHeader label="Last scan" column="last_scanned_at" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/parcels" otherParams={headerParams} />
              </th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(parcels ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                  {filterTerm ? `No parcels match "${filterTerm}".` : "No parcels recorded yet."}
                </td>
              </tr>
            ) : null}
            {(parcels ?? []).map((p) => {
              const type =
                RESTRICTION_TYPES.find((r) => r.value === p.restriction_type)
                  ?.label ?? p.restriction_type;
              return (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{type}</td>
                  <td className="px-4 py-2">{`${p.village}, ${p.taluk}, ${p.district}`}</td>
                  <td className="px-4 py-2">{p.survey_no ?? "—"}</td>
                  <td className="px-4 py-2">
                    {p.area_hectares ? Number(p.area_hectares).toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {p.last_scanned_at
                      ? new Date(p.last_scanned_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-3">
                      <Link
                        href={`/parcels/${p.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        Open
                      </Link>
                      {isAuthority && (
                        <DeleteButton
                          label="Delete"
                          variant="link"
                          confirmText={`Delete parcel "${p.name}"? All its snapshots and alerts will be removed too. This cannot be undone.`}
                          action={async () => {
                            "use server";
                            return deleteParcelAction(p.id);
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
          baseUrl="/parcels"
          searchParams={pageOtherParams}
        />
      </div>
    </main>
  );
}
