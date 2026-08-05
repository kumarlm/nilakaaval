import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { searchKey } from "@/lib/search-key";
import { ListSearch } from "@/components/list-search";
import DeleteButton from "@/components/delete-button";
import { deleteAlertAction } from "@/lib/delete-actions";

export default async function AlertsPage() {
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

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, parcel_id, detected_at, severity, status, change_score, notes, parcels(name, district, village)")
    .order("detected_at", { ascending: false });

  return (
    <main className="flex-1 p-6">
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mt-1 text-sm text-[var(--muted-fg)]">
        Suspected unauthorized changes detected by periodic scans. Review each
        alert and mark its outcome.
      </p>

      <ListSearch targetId="alerts-table" noun="alerts" />

      <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm" id="alerts-table">
          <thead className="bg-[var(--muted)] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Detected</th>
              <th className="px-4 py-2 font-medium">Parcel</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(alerts ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                  No alerts yet — upload two snapshots on a parcel to test, or wait for the daily scan.
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
                  <tr key={a.id} className="border-t border-[var(--border)]" data-search={searchKey(a.severity, a.status, a.notes, p?.name, p?.village, p?.district)}>
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
            <tr data-no-match style={{ display: "none" }}>
              <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                No alerts match your filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
