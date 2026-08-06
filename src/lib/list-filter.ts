// Escape PostgREST .or() filter syntax special characters so a raw filter
// term can't break out of the ilike pattern or the comma-separated filter list.
export function sanitizeFilterTerm(q: string) {
  return q.replace(/[%,()*]/g, "");
}

// Build a PostgREST .or() filter string matching `term` against every given
// column with a case-insensitive substring search.
export function buildOrFilter(term: string, columns: string[]) {
  const safe = sanitizeFilterTerm(term);
  return columns.map((c) => `${c}.ilike.%${safe}%`).join(",");
}
