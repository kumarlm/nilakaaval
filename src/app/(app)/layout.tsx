import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SetupRequired from "@/components/setup-required";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  if (!supabase) return <SetupRequired />;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, district, designation")
    .eq("id", user.id)
    .maybeSingle();

  // Self-heal: if no profile row exists (e.g. user signed up before the
  // schema/trigger was in place), create one with the service-role key.
  if (!profile) {
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("profiles")
        .upsert({ id: user.id, email: user.email }, { onConflict: "id" });
      const { data: fresh } = await supabase
        .from("profiles")
        .select("role, full_name, district, designation")
        .eq("id", user.id)
        .maybeSingle();
      profile = fresh;
    }
  }

  const role = profile?.role ?? "viewer";

  return (
    <div className="flex-1 flex">
      <aside className="hidden md:flex md:w-60 flex-col border-r border-[var(--border)] bg-[var(--background)]">
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-[var(--primary)] grid place-items-center text-[var(--primary-fg)] font-bold">
              பூ
            </div>
            <span className="font-semibold">Bhoomi Watch</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/map" label="Map" />
          <NavLink href="/parcels" label="Parcels" />
          <NavLink href="/alerts" label="Alerts" />
          <NavLink href="/settings" label="Settings" />
        </nav>
        <div className="border-t border-[var(--border)] p-4 text-xs text-[var(--muted-fg)]">
          <div className="font-medium text-[var(--foreground)] truncate">
            {profile?.full_name ?? user.email}
          </div>
          <div className="mt-0.5 capitalize">{role}{profile?.designation ? ` · ${profile.designation}` : ""}</div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs underline hover:text-[var(--foreground)]">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded px-3 py-2 hover:bg-[var(--muted)]"
    >
      {label}
    </Link>
  );
}
