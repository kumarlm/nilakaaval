"use client";

import { useState, useTransition } from "react";
import { sendTestEmailAction } from "./test-email-action";

export default function TestEmailButton({
  defaultTo,
}: {
  defaultTo: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    null | { ok: boolean; message: string }
  >(null);

  function onClick() {
    setResult(null);
    startTransition(async () => {
      const r = await sendTestEmailAction(to);
      setResult({
        ok: r.ok,
        message: r.ok ? `Sent to ${to}.` : `Failed: ${r.error ?? "unknown"}`,
      });
    });
  }

  return (
    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="recipient@example.com"
        className="flex-1 rounded border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
      />
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send test email"}
      </button>
      {result && (
        <span
          className={`text-xs sm:ml-2 ${
            result.ok ? "text-emerald-700" : "text-[var(--danger)]"
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
