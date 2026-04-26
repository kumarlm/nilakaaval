"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadSnapshot({
  parcelId,
  canUpload,
}: {
  parcelId: string;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [capturedAt, setCapturedAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    score?: number;
    severity?: string | null;
    alertId?: string;
    processError?: string;
    snapshotId?: string;
    email?: { sent: boolean; reason?: string; recipients: string[] };
  }>(null);

  if (!canUpload) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (capturedAt) {
        fd.append("captured_at", new Date(capturedAt).toISOString());
      }
      const res = await fetch(`/api/parcels/${parcelId}/snapshots`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult({
        score: body.changeScore,
        severity: body.severity,
        alertId: body.alertId,
        processError: body.processError,
        snapshotId: body.snapshotId,
        email: body.email,
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setCapturedAt(new Date().toISOString().slice(0, 16));
  }

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="rounded border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
      >
        Upload snapshot
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-lg bg-[var(--background)] p-6 shadow-lg border border-[var(--border)]">
            <h2 className="text-lg font-semibold">Upload snapshot</h2>
            <p className="mt-1 text-xs text-[var(--muted-fg)]">
              Use this to test change detection. Upload a &ldquo;before&rdquo; image
              first (saved as a snapshot), then upload an &ldquo;after&rdquo; image
              with edits — the diff pipeline runs automatically and alerts if
              the score crosses 5%.
            </p>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-[var(--muted-fg)]">
                  Image file <span className="text-[var(--danger)]">*</span>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm file:mr-3 file:rounded file:border file:border-[var(--border)] file:bg-[var(--muted)] file:px-3 file:py-1.5 file:text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-[var(--muted-fg)]">
                  Captured at
                </span>
                <input
                  type="datetime-local"
                  value={capturedAt}
                  onChange={(e) => setCapturedAt(e.target.value)}
                  className="mt-1 block w-full rounded border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

              {result && (
                <div className="rounded bg-[var(--muted)] p-3 text-xs space-y-1.5">
                  <div className="font-medium">✓ Snapshot saved.</div>

                  {result.score === undefined && !result.processError ? (
                    <div className="text-[var(--muted-fg)]">
                      First snapshot for this parcel — nothing to compare yet.
                      Upload a different image next to trigger change detection.
                    </div>
                  ) : result.score !== undefined ? (
                    <>
                      <div>
                        Change score:{" "}
                        <strong>{(result.score * 100).toFixed(2)}%</strong>
                        {result.severity ? (
                          <>
                            {" "}· severity{" "}
                            <strong className="capitalize">{result.severity}</strong>
                          </>
                        ) : (
                          <span className="text-[var(--muted-fg)]">
                            {" "}· below 5% alert threshold
                          </span>
                        )}
                      </div>
                      {result.alertId ? (
                        <>
                          <div className="text-[var(--warning)]">
                            ⚠ Alert created — see the Alerts section below or
                            the Alerts page.
                          </div>
                          {result.email && (
                            <div
                              className={
                                result.email.sent
                                  ? "text-emerald-700"
                                  : "text-[var(--danger)]"
                              }
                            >
                              {result.email.sent
                                ? `✉ Email sent to ${result.email.recipients.length} recipient${result.email.recipients.length === 1 ? "" : "s"}`
                                : `✉ Email NOT sent: ${result.email.reason ?? "unknown"}`}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-[var(--muted-fg)]">
                          No alert raised. To force one, upload an image that
                          differs more visibly from the previous snapshot
                          (paint a coloured rectangle on it in any image
                          editor).
                        </div>
                      )}
                    </>
                  ) : null}

                  {result.processError && (
                    <div className="text-[var(--danger)]">
                      Diff failed: {result.processError}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!file || busy}
                  className="flex-1 rounded bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Upload &amp; diff"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-[var(--border)] px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
