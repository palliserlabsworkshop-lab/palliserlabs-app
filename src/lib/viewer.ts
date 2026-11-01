import "server-only";
import { createPersonalBrand, getClient, getPerson, type Actor, type ClientProfile } from "./notion";
import { getPrincipal } from "./session";

/**
 * Everything the app knows about the signed-in viewer, rebuilt from Notion on every request.
 * This is the single access gate: unlinking a brand (or blocking a person) in Notion takes
 * effect on the next request.
 */
export type Viewer = Actor & {
  /** Notion page whose comments are this viewer's Messages thread. */
  messagesPageId: string;
  brands: ClientProfile[];
};

export async function getViewer(): Promise<Viewer | null> {
  const principal = await getPrincipal();
  if (!principal) return null;

  if (principal.kind === "client") {
    const client = await getClient(principal.id);
    if (!client) return null;
    return {
      kind: "client",
      id: client.id,
      name: client.name,
      email: client.email,
      brandIds: [client.id],
      brands: [client],
      messagesPageId: client.id,
    };
  }

  const person = await getPerson(principal.id);
  if (!person) return null;
  // Each linked brand must still be a live row in the Brands (Clients) database.
  let linked = (await Promise.all(person.brandIds.map((id) => getClient(id)))).filter(
    (b): b is ClientProfile => b !== null,
  );

  // "Personal brand" tick box: create their personal brand the first time it's ticked;
  // when unticked, it stays in Notion but is hidden from the app.
  if (person.wantsPersonalBrand && !linked.some((b) => b.personal)) {
    try {
      const created = await getClient(await createPersonalBrand(person));
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
  return {
    kind: "person",
    id: person.id,
    name: person.name,
    email: person.email,
    brandIds: brands.map((b) => b.id),
    brands,
    messagesPageId: person.id, // one Messages thread per person, covering all their brands
  };
}
