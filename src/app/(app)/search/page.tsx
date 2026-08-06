import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RESTRICTION_TYPES } from "@/lib/regions";
import { buildOrFilter } from "@/lib/list-filter";
import {
  PAGE_SIZE,
  getPaginationParams,
  getPaginationInfo,
  getSortParams,
  paramsExcept,
} from "@/lib/pagination";
import { SortableHeader } from "@/components/sortable-header";
import { Pagination } from "@/components/pagination";

const SORTABLE_COLUMNS = ["name", "restriction_type", "survey_no", "area_hectares", "last_scanned_at"] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const { q } = sp;
  const query = q?.trim() ?? "";

  const supabase = await createClient();
  if (!supabase) return null;

  let parcels: Array<{
    id: string;
    name: string;
    district: string;
    taluk: string;
    village: string;
    survey_no: string | null;
    restriction_type: string;
    area_hectares: number | null;
    last_scanned_at: string | null;
    status: string;
    notes: string | null;
  }> = [];

  let count: number | null = null;
  let page = 1;
  let offset = 0;
  const { column: sortColumn, dir: sortDir } = getSortParams(
    sp,
    SORTABLE_COLUMNS,
    "created_at",
    "desc",
  );

  if (query) {
    const { page: p, offset: o } = getPaginationParams(sp);
    page = p;
    offset = o;

    const filter = buildOrFilter(query, [
      "name",
      "district",
      "taluk",
      "village",
      "survey_no",
      "notes",
      "restriction_type",
      "status",
    ]);

    const { data, count: c } = await supabase
      .from("parcels")
      .select(
        "id, name, district, taluk, village, survey_no, restriction_type, area_hectares, last_scanned_at, status, notes",
        { count: "exact" },
      )
      .or(filter)
      .order(sortColumn, { ascending: sortDir === "asc" })
      .range(offset, offset + PAGE_SIZE - 1);
    parcels = data ?? [];
    count = c;
  }

  const headerParams = paramsExcept(sp, ["sort", "dir", "page"]);
  const pageOtherParams = paramsExcept(sp, ["page"]);

  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-semibold">Search</h1>
      <p className="mt-1 text-sm text-[var(--muted-fg)]">
        {query ? `Results for "${query}"` : "Enter a search term above."}
      </p>

      {query && (
        <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-4 py-2 font-medium">
                  <SortableHeader label="Name" column="name" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/search" otherParams={headerParams} />
                </th>
                <th className="px-4 py-2 font-medium">
                  <SortableHeader label="Type" column="restriction_type" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/search" otherParams={headerParams} />
                </th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">
                  <SortableHeader label="Survey #" column="survey_no" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/search" otherParams={headerParams} />
                </th>
                <th className="px-4 py-2 font-medium">
                  <SortableHeader label="Area (ha)" column="area_hectares" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/search" otherParams={headerParams} />
                </th>
                <th className="px-4 py-2 font-medium">
                  <SortableHeader label="Last scan" column="last_scanned_at" activeColumn={sortColumn} activeDir={sortDir} baseUrl="/search" otherParams={headerParams} />
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {parcels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                    No parcels matched &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              ) : null}
              {parcels.map((p) => {
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
                      <Link
                        href={`/parcels/${p.id}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Pagination
            page={page}
            totalPages={getPaginationInfo(count, page).totalPages}
            baseUrl="/search"
            searchParams={pageOtherParams}
          />
        </div>
      )}
    </main>
  );
}
