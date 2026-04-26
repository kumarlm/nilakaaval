"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    (search.get("mode") as Mode) ?? "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState<"none" | "form" | "google">("none");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function getSupabase() {
    try {
      return createClient();
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy("form");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName || null },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      setBusy("none");
      if (error) return setError(error.message);

      // If email confirmation is on (default), user has no session yet.
      if (!data.session) {
        setInfo(
          `Account created. Check ${email} for a confirmation link to finish signing up.`,
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy("none");
    if (error) return setError(error.message);
    router.replace("/dashboard");
    router.refresh();
  }

  async function onGoogle() {
    setError(null);
    setInfo(null);
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
    if (error) {
      setBusy("none");
      setError(error.message);
    }
    // On success the browser is redirecting; no further state to set.
  }

  return (
    <main className="flex-1 grid place-items-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
        <Link href="/" className="text-xs text-[var(--muted-fg)] hover:underline">
          ← Home
        </Link>

        <div className="mt-3 flex items-center gap-1 rounded-lg bg-[var(--muted)] p-1 text-sm">
          <TabBtn active={mode === "signin"} onClick={() => setMode("signin")}>
            Sign in
          </TabBtn>
          <TabBtn active={mode === "signup"} onClick={() => setMode("signup")}>
            Create account
          </TabBtn>
        </div>

        <h1 className="mt-5 text-xl font-semibold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">
          {mode === "signin"
            ? "Sign in to manage restricted parcels and review alerts."
            : "Anyone can create a viewer account. An admin will promote authorities."}
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <Field label="Full name">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={input}
                placeholder="A. Selvam"
                autoComplete="name"
              />
            </Field>
          )}

          <Field label="Email" required>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Password" required>
            <input
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : ""}
            />
          </Field>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {info && (
            <p className="rounded bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== "none"}
            className="w-full rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-60"
          >
            {busy === "form"
              ? mode === "signup" ? "Creating account…" : "Signing in…"
              : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted-fg)]">
          <span className="flex-1 h-px bg-[var(--border)]" />
          <span>or</span>
          <span className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={busy !== "none"}
          className="w-full flex items-center justify-center gap-2 rounded border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-60"
        >
          <GoogleIcon />
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}

const input =
  "mt-1 block w-full rounded border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--muted-fg)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded px-3 py-1.5 transition ${
        active
          ? "bg-[var(--background)] shadow-sm font-medium"
          : "text-[var(--muted-fg)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 4.9l6.2 5.2C40.3 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
