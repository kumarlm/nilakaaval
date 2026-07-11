import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RESTRICTION_TYPES } from "@/lib/regions";

// Escape PostgREST .or() filter syntax special characters so a raw search
// term can't break out of the ilike pattern or the comma-separated filter list.
function sanitize(q: string) {
  return q.replace(/[%,()*]/g, "");
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
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
  }> = [];

  if (query) {
    const term = sanitize(query);
    const { data } = await supabase
      .from("parcels")
      .select(
        "id, name, district, taluk, village, survey_no, restriction_type, area_hectares, last_scanned_at, status",
      )
      .or(
        `name.ilike.%${term}%,district.ilike.%${term}%,taluk.ilike.%${term}%,village.ilike.%${term}%,survey_no.ilike.%${term}%`,
      )
      .order("created_at", { ascending: false });
    parcels = data ?? [];
  }

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
              ) : (
                parcels.map((p) => {
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
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
