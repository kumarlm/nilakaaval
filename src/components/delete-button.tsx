"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Server action that performs the delete. Returns { ok, error? }. */
  action: () => Promise<{ ok: boolean; error?: string }>;
  /** Confirm prompt shown before action runs. */
  confirmText: string;
  /** Visible button label. */
  label?: string;
  /** Visual variant. */
  variant?: "danger" | "icon" | "link";
  className?: string;
};

export default function DeleteButton({
  action,
  confirmText,
  label = "Delete",
  variant = "danger",
  className = "",
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    if (!confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "delete failed");
      else router.refresh();
    });
  }

  const baseCls =
    variant === "danger"
      ? "rounded bg-[var(--danger)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      : variant === "icon"
        ? "text-[var(--danger)] hover:underline text-xs"
        : "text-[var(--danger)] hover:underline text-xs";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`${baseCls} disabled:opacity-50`}
      >
        {pending ? "Deleting…" : label}
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}
