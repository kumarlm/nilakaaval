import Link from "next/link";

export default function SetupRequired() {
  return (
    <main className="flex-1 grid place-items-center px-6 py-16">
      <div className="max-w-2xl w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
          ⚙ Setup required
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Connect Supabase to continue</h1>
        <p className="mt-2 text-[var(--muted-fg)]">
          The app is running, but no Supabase project is wired up yet. Follow these
          three steps and reload.
        </p>

        <ol className="mt-6 space-y-5 text-sm">
          <li>
            <div className="font-medium">1. Create a Supabase project</div>
            <p className="mt-1 text-[var(--muted-fg)]">
              Sign up at{" "}
              <a className="underline" href="https://supabase.com" target="_blank" rel="noreferrer">
                supabase.com
              </a>
              . Free tier is sufficient.
            </p>
          </li>

          <li>
            <div className="font-medium">2. Run the schema migration</div>
            <p className="mt-1 text-[var(--muted-fg)]">
              In the Supabase SQL Editor, paste the contents of{" "}
              <code className="rounded bg-[var(--muted)] px-1">
                supabase/migrations/0001_init.sql
              </code>{" "}
              and run it.
            </p>
          </li>

          <li>
            <div className="font-medium">3. Add env vars</div>
            <p className="mt-1 text-[var(--muted-fg)]">
              From <em>Project Settings → API</em>, copy the project URL and the{" "}
              <em>anon public</em> key into <code className="rounded bg-[var(--muted)] px-1">.env.local</code>:
            </p>
            <pre className="mt-2 rounded bg-[var(--muted)] p-3 text-xs overflow-x-auto">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...`}
            </pre>
            <p className="mt-2 text-[var(--muted-fg)]">
              Then restart <code className="rounded bg-[var(--muted)] px-1">npm run dev</code>.
            </p>
          </li>
        </ol>

        <div className="mt-8 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-fg)]">
          <Link className="underline" href="/">
            ← Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
