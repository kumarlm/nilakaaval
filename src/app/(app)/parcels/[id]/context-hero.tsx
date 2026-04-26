"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ContextHero({
  parcelId,
  imageUrl,
}: {
  parcelId: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function bake() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/parcels/${parcelId}/context`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <div className="font-medium">Context image</div>
          <div className="text-xs text-[var(--muted-fg)]">
            High-res satellite (MapTiler) — visual reference, not used for change detection.
          </div>
        </div>
        <button
          onClick={bake}
          disabled={busy}
          className="text-xs rounded border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--muted)] disabled:opacity-60"
        >
          {busy ? "Baking…" : imageUrl ? "Refresh" : "Generate"}
        </button>
      </div>
      {imageUrl ? (
        <div className="bg-[var(--muted)] grid place-items-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Parcel context satellite imagery"
            className="max-h-[360px] max-w-full rounded"
          />
        </div>
      ) : (
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-fg)]">
          {err
            ? `Failed: ${err}`
            : busy
              ? "Stitching tiles…"
              : 'No context image yet. Click "Generate" to create one.'}
        </div>
      )}
    </section>
  );
}
