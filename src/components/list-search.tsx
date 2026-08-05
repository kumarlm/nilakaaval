"use client";

import { useEffect, useState } from "react";

export function ListSearch({
  targetId,
  placeholder,
  noun = "rows",
}: {
  targetId: string;
  placeholder?: string;
  noun?: string;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const container = document.getElementById(targetId);
    if (!container) return;

    const rows = container.querySelectorAll<HTMLElement>("[data-search]");
    const noMatch = container.querySelector<HTMLElement>("[data-no-match]");

    setTotalCount(rows.length);

    let visible = 0;
    const term = query.trim().toLowerCase();

    rows.forEach((el) => {
      const text = (el.dataset.search ?? "").toLowerCase();
      const hit = !term || text.includes(term);
      el.style.display = hit ? "" : "none";
      if (hit) visible++;
    });

    setVisibleCount(visible);

    // Show the "no match" row only if there's a query and no rows matched.
    if (noMatch) {
      noMatch.style.display = term && visible === 0 ? "" : "none";
    }
  }, [query, targetId]);

  return (
    <div className="flex items-center gap-4 mb-4">
      <input
        type="search"
        placeholder={placeholder ?? `Filter ${noun}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
      />
      {query && totalCount > 0 && (
        <span className="text-sm text-[var(--muted-fg)]">
          {visibleCount} of {totalCount} {noun}
        </span>
      )}
    </div>
  );
}
