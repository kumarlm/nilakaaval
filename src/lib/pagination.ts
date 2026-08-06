export const PAGE_SIZE = 10;

export function getPaginationParams(
  searchParams: Record<string, string | string[] | undefined>,
  paramName = "page",
) {
  const page = Math.max(1, parseInt((searchParams[paramName] as string) ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  return { page, offset };
}

export function getPaginationInfo(count: number | null, page: number) {
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  return { totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}
