import "server-only";
import { cache } from "react";
import { createPersonalBrand, getBrand, getPerson, type Actor, type Brand } from "./notion";
import { getSession, sameTag } from "./session";

/**
 * The signed-in person and the brands they can see, rebuilt from Notion on every request.
 * This is the single access gate: unlinking a brand (or setting a person or brand Inactive)
 * in Notion takes effect on the next request. Their Messages thread is their own People row.
 */
export type Viewer = Actor & { brands: Brand[] };

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (!session) return null;
  const person = await getPerson(session.personId);
  if (!person) return null;
  // Changing someone's Email or App Password in Notion signs them out everywhere.
  if (!sameTag(person.credentialTag, session.credentialTag)) return null;

  // Each linked brand must still be a live row in the Brands database.
  let linked = (await Promise.all(person.brandIds.map((id) => getBrand(id)))).filter((b): b is Brand => b !== null);

  // "Personal brand" tick box: create their personal brand the first time it's ticked;
  // when unticked, it stays in Notion but is hidden from the app.
  if (person.wantsPersonalBrand && !linked.some((b) => b.personal)) {
    try {
      const created = await getBrand(await createPersonalBrand(person));
      if (created) linked = [...linked, created];
    } catch (error) {
      console.error("Could not create personal brand:", error);
    }
  }
  if (!person.wantsPersonalBrand) linked = linked.filter((b) => !b.personal);

  // Businesses first, then their own personal brand, shown simply as "Personal".
  const brands = [
    ...linked.filter((b) => !b.personal),
    ...linked.filter((b) => b.personal).map((b) => ({ ...b, name: "Personal" })),
  ];
  return { id: person.id, name: person.name, email: person.email, brandIds: brands.map((b) => b.id), brands };
});
