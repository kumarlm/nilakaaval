import Link from "next/link";

// A <th> label that links to the same page with sort/dir toggled. Pure
// server-renderable — no client state, just an ordinary link.
export function SortableHeader({
  label,
  column,
  activeColumn,
  activeDir,
  baseUrl,
  otherParams = "",
  sortParamName = "sort",
  dirParamName = "dir",
  pageParamName = "page",
  includePage = true,
}: {
  label: string;
  column: string;
  activeColumn: string;
  activeDir: "asc" | "desc";
  baseUrl: string;
  otherParams?: string;
  sortParamName?: string;
  dirParamName?: string;
  pageParamName?: string;
  includePage?: boolean;
}) {
  const isActive = activeColumn === column;
  const nextDir: "asc" | "desc" = isActive && activeDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(otherParams);
  params.set(sortParamName, column);
  params.set(dirParamName, nextDir);
  if (includePage) params.set(pageParamName, "1");

  return (
    <Link
      href={`${baseUrl}?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:underline"
    >
      {label}
      <span className="text-[10px] leading-none text-[var(--primary)]">
        {isActive ? (activeDir === "asc" ? "▲" : "▼") : ""}
      </span>
    </Link>
  );
}
