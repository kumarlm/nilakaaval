import { createClient } from "@/lib/supabase/server";
import EmailsForm from "./emails-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, designation, district, notification_emails")
    .eq("id", user!.id)
    .maybeSingle();

  const initialEmails: string[] = profile?.notification_emails ?? [];

  return (
    <main className="flex-1 p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="mt-6 rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="Role" value={profile?.role ?? "viewer"} />
        <Row label="Name" value={profile?.full_name ?? "—"} />
        <Row label="Designation" value={profile?.designation ?? "—"} />
        <Row label="District" value={profile?.district ?? "—"} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Alert recipients</h2>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">
          You always get alerts to your account email. Add extra addresses
          below — district revenue inspectors, village admin officers, or your
          own secondary inbox.
        </p>
        <EmailsForm initialEmails={initialEmails} />
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex px-4 py-3 text-sm">
      <dt className="w-40 text-[var(--muted-fg)]">{label}</dt>
      <dd className="flex-1 capitalize">{value}</dd>
    </div>
  );
}
