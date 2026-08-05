// Join a row's searchable values into a single lowercase haystack, rendered
// into a `data-search` attribute and matched client-side by <ListSearch>.
// Nullish and empty parts are dropped.
export function searchKey(
  ...parts: Array<string | number | null | undefined>
): string {
  return parts
    .filter((p) => p != null && p !== "")
    .join(" ")
    .toLowerCase();
}
