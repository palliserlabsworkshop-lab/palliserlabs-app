import "server-only";
import { getClient, getPerson, type Actor, type ClientProfile } from "./notion";
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
  const brands = (await Promise.all(person.brandIds.map((id) => getClient(id)))).filter(
    (b): b is ClientProfile => b !== null,
  );
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
