/**
 * Brand scoping rules — which brands a signed-in viewer may see or act on.
 * Pure functions (no Notion, no cookies) so they can be unit-tested.
 * The viewer's brand list always comes from Notion on the server, never from the browser.
 */

/** Notion IDs appear with and without dashes; compare them in one form. */
export function sameId(a: string, b: string): boolean {
  const norm = (id: string) => id.replace(/-/g, "").toLowerCase();
  return norm(a) === norm(b);
}

/** True when the brand is one the viewer is linked to. */
export function canUseBrand(viewerBrandIds: string[], brandId: string | null | undefined): boolean {
  return Boolean(brandId) && viewerBrandIds.some((id) => sameId(id, brandId!));
}

/**
 * The brands a view should show. `requested` comes from the URL (?brand=…) and is only a
 * filter: anything not in the viewer's own set (or "all"/missing) falls back to all of them.
 */
export function scopeBrands(viewerBrandIds: string[], requested?: string | null): string[] {
  if (requested && requested !== "all" && canUseBrand(viewerBrandIds, requested)) {
    return viewerBrandIds.filter((id) => sameId(id, requested));
  }
  return viewerBrandIds;
}

/** Which of the viewer's brands a task/file belongs to (first match), for labels and filtering. */
export function ownBrandOf(relationIds: string[], viewerBrandIds: string[]): string | null {
  for (const rel of relationIds) {
    const match = viewerBrandIds.find((id) => sameId(id, rel));
    if (match) return match;
  }
  return null;
}
