"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Debounced text input that pushes the filter term to the URL, triggering a
// server re-query across the *entire* dataset (not just the currently
// loaded page) and resetting pagination to page 1.
export function TableFilter({
  initialValue = "",
  baseUrl,
  otherParams = "",
  paramName = "filter",
  pageParamName = "page",
  placeholder,
  noun = "rows",
}: {
  initialValue?: string;
  baseUrl: string;
  otherParams?: string;
  paramName?: string;
  pageParamName?: string;
  placeholder?: string;
  noun?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(otherParams);
      if (next.trim()) params.set(paramName, next.trim());
      else params.delete(paramName);
      params.set(pageParamName, "1");
      router.push(`${baseUrl}?${params.toString()}`);
    }, 400);
  }

  return (
    <input
      type="search"
      placeholder={placeholder ?? `Search ${noun}…`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mb-4 block w-full max-w-md rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
    />
  );
}
