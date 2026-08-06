export const PAGE_SIZE = 10;

type SearchParams = Record<string, string | string[] | undefined>;

export function getPaginationParams(searchParams: SearchParams, paramName = "page") {
  const page = Math.max(1, parseInt((searchParams[paramName] as string) ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  return { page, offset };
}

export function getPaginationInfo(count: number | null, page: number) {
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return { totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}

export function getFilterParam(searchParams: SearchParams, paramName = "filter") {
  const raw = searchParams[paramName];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getSortParams(
  searchParams: SearchParams,
  allowed: readonly string[],
  defaultColumn: string,
  defaultDir: "asc" | "desc" = "desc",
  sortParamName = "sort",
  dirParamName = "dir",
): { column: string; dir: "asc" | "desc" } {
  const rawColumn = searchParams[sortParamName];
  const column =
    typeof rawColumn === "string" && allowed.includes(rawColumn) ? rawColumn : defaultColumn;
  const rawDir = searchParams[dirParamName];
  const dir: "asc" | "desc" = rawDir === "asc" ? "asc" : rawDir === "desc" ? "desc" : defaultDir;
  return { column, dir };
}

// Serialize the current search params as a query string, dropping the given
// keys — used to carry filter/sort/other-list state along when a link only
// intends to change one of page/sort/filter.
export function paramsExcept(searchParams: SearchParams, excludeKeys: string[]) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (excludeKeys.includes(key)) continue;
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  return params.toString();
}
