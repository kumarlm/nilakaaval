"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RescanButton({
  parcelId,
  canScan,
}: {
  parcelId: string;
  canScan: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setStatus("running");
    setError(null);
    try {
      const res = await fetch(`/api/scan/${parcelId}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }

  if (!canScan) {
    return (
      <button
        disabled
        title="Only authority users can trigger scans."
        className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium opacity-60 cursor-not-allowed"
      >
        Re-scan now
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={status === "running"}
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-60"
      >
        {status === "running" ? "Scanning…" : "Re-scan now"}
      </button>
      {error && (
        <span className="text-xs text-[var(--danger)] max-w-xs text-right">
          {error}
        </span>
      )}
    </div>
  );
}
