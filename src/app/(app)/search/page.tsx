import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RESTRICTION_TYPES } from "@/lib/regions";
import { searchKey } from "@/lib/search-key";
import { PAGE_SIZE, getPaginationParams, getPaginationInfo, buildPageUrl } from "@/lib/pagination";
import { ListSearch } from "@/components/list-search";
import { Pagination } from "@/components/pagination";

// Escape PostgREST .or() filter syntax special characters so a raw search
// term can't break out of the ilike pattern or the comma-separated filter list.
function sanitize(q: string) {
  return q.replace(/[%,()*]/g, "");
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
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

  if (query) {
    const { page: p, offset: o } = getPaginationParams(sp);
    page = p;
    offset = o;

    const term = sanitize(query);
    const filter = `name.ilike.%${term}%,district.ilike.%${term}%,taluk.ilike.%${term}%,village.ilike.%${term}%,survey_no.ilike.%${term}%,notes.ilike.%${term}%,restriction_type.ilike.%${term}%,status.ilike.%${term}%`;

    const { count: c } = await supabase
      .from("parcels")
      .select("id", { count: "exact", head: true })
      .or(filter);
    count = c;

    const { data } = await supabase
      .from("parcels")
      .select(
        "id, name, district, taluk, village, survey_no, restriction_type, area_hectares, last_scanned_at, status, notes",
      )
      .or(filter)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    parcels = data ?? [];
  }

  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-semibold">Search</h1>
      <p className="mt-1 text-sm text-[var(--muted-fg)]">
        {query ? `Results for "${query}"` : "Enter a search term above."}
      </p>

      {query && (
        <>
          <ListSearch targetId="search-results-table" noun="results" />
          <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm" id="search-results-table">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Survey #</th>
                <th className="px-4 py-2 font-medium">Area (ha)</th>
                <th className="px-4 py-2 font-medium">Last scan</th>
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
                  <tr key={p.id} className="border-t border-[var(--border)]" data-search={searchKey(p.name, type, p.village, p.taluk, p.district, p.survey_no, p.status, p.notes)}>
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
              <tr data-no-match style={{ display: "none" }}>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                  No parcels match your filter.
                </td>
              </tr>
            </tbody>
          </table>

          {(() => {
            const { totalPages } = getPaginationInfo(count, page);
            const buildUrl = (p: number) => {
              const params = new URLSearchParams({ q: query });
              return buildPageUrl("/search", p, params);
            };
            return <Pagination page={page} totalPages={totalPages} buildUrl={buildUrl} />;
          })()}
        </div>
        </>
      )}
    </main>
  );
}
