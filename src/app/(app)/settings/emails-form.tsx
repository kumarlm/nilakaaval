"use client";

import { useState, useTransition } from "react";
import { saveNotificationEmails } from "./save-emails-action";

export default function EmailsForm({
  initialEmails,
}: {
  initialEmails: string[];
}) {
  const [value, setValue] = useState(initialEmails.join("\n"));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    null | { ok: boolean; message: string }
  >(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const fd = new FormData();
    fd.set("emails", value);
    startTransition(async () => {
      const res = await saveNotificationEmails(fd);
      if (res.ok) {
        setFeedback({
          ok: true,
          message: `Saved ${res.count} address${res.count === 1 ? "" : "es"}.`,
        });
      } else {
        setFeedback({ ok: false, message: res.error ?? "save failed" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="rdo.coimbatore@tn.gov.in&#10;vao.anaikatti@tn.gov.in"
        className="block w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono"
      />
      <p className="text-xs text-[var(--muted-fg)]">
        One email per line, or comma-separated. These addresses receive an
        alert email any time change detection fires above the threshold —
        across all parcels you can see.
      </p>

      {feedback && (
        <p
          className={`text-sm ${
            feedback.ok ? "text-emerald-700" : "text-[var(--danger)]"
          }`}
        >
          {feedback.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
