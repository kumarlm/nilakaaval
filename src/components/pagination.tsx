"use client";

import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  buildUrl,
}: {
  page: number;
  totalPages: number;
  buildUrl: (newPage: number) => string;
}) {
  const isPrevDisabled = page === 1;
  const isNextDisabled = page === totalPages;

  return (
    <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted-fg)]">
      <div>
        Page {page} of {totalPages}
      </div>
      <div className="flex gap-2">
        <Link
          href={buildUrl(page - 1)}
          className={`rounded border px-3 py-1 transition-colors ${
            isPrevDisabled
              ? "border-[var(--border)] cursor-not-allowed opacity-50"
              : "border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--primary-fg)]"
          }`}
          aria-disabled={isPrevDisabled}
          tabIndex={isPrevDisabled ? -1 : 0}
          onClick={(e) => isPrevDisabled && e.preventDefault()}
        >
          ← Previous
        </Link>
        <Link
          href={buildUrl(page + 1)}
          className={`rounded border px-3 py-1 transition-colors ${
            isNextDisabled
              ? "border-[var(--border)] cursor-not-allowed opacity-50"
              : "border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--primary-fg)]"
          }`}
          aria-disabled={isNextDisabled}
          tabIndex={isNextDisabled ? -1 : 0}
          onClick={(e) => isNextDisabled && e.preventDefault()}
        >
          Next →
        </Link>
      </div>
    </div>
  );
}
