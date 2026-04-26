import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-[var(--primary)] grid place-items-center text-[var(--primary-fg)] font-bold">
              நி
            </div>
            <span className="font-semibold tracking-tight">Nilakaaval</span>
          </div>
          {supabase ? (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)]"
              >
                Sign up
              </Link>
            </div>
          ) : (
            <Link
              href="/setup"
              className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white"
            >
              ⚙ Setup required
            </Link>
          )}
        </div>
      </header>

      <section className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-3xl text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Watch over Tamil Nadu&apos;s restricted lands.
          </h1>
          <p className="mt-5 text-lg text-[var(--muted-fg)]">
            Authorities mark restricted parcels — reserved forests, water bodies,
            poromboke, temple land. We pull high-resolution satellite imagery
            on a schedule, compare against the baseline, and flag suspected
            unauthorized construction for review.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href={supabase ? "/login?mode=signup" : "/setup"}
              className="rounded bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-fg)]"
            >
              {supabase ? "Create account" : "Configure Supabase"}
            </Link>
            <Link
              href={supabase ? "/login" : "/setup"}
              className="rounded border border-[var(--border)] px-5 py-2.5 text-sm font-medium"
            >
              {supabase ? "Sign in" : "Setup guide"}
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <Feature title="Mark restricted parcels" body="Draw polygons on the map; tag district, taluk, village and survey number." />
            <Feature title="Periodic satellite scans" body="High-resolution satellite imagery refreshed on a schedule, automatically compared." />
            <Feature title="Alerts &amp; review" body="Email + Telegram alerts. Review change-detection diffs in the dashboard." />
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted-fg)]">
        Built for educational / pilot use. Not an official Government of Tamil Nadu service.
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm text-[var(--muted-fg)]">{body}</p>
    </div>
  );
}
