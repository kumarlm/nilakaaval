import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) return null; // layout renders SetupRequired

  const [{ count: parcelCount }, { count: openAlerts }, { data: recent }] =
    await Promise.all([
      supabase.from("parcels").select("*", { count: "exact", head: true }),
      supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("parcels")
        .select("id, name, district, taluk, village, last_scanned_at, status")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  return (
    <main className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/map"
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)]"
        >
          + Mark restricted area
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Restricted parcels" value={parcelCount ?? 0} />
        <Stat label="Open alerts" value={openAlerts ?? 0} accent="warning" />
        <Stat label="Last scan" value="—" hint="Worker not deployed yet" />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Recently added parcels</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">District</th>
                <th className="px-4 py-2 font-medium">Taluk</th>
                <th className="px-4 py-2 font-medium">Village</th>
                <th className="px-4 py-2 font-medium">Last scan</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-fg)]">
                    No parcels yet. <Link href="/map" className="underline">Mark one on the map →</Link>
                  </td>
                </tr>
              ) : (
                recent!.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.district}</td>
                    <td className="px-4 py-2">{p.taluk}</td>
                    <td className="px-4 py-2">{p.village}</td>
                    <td className="px-4 py-2">
                      {p.last_scanned_at
                        ? new Date(p.last_scanned_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/parcels/${p.id}`} className="text-[var(--primary)] hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: "warning";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="text-sm text-[var(--muted-fg)]">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold ${
          accent === "warning" ? "text-[var(--warning)]" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-[var(--muted-fg)]">{hint}</div>}
    </div>
  );
}
