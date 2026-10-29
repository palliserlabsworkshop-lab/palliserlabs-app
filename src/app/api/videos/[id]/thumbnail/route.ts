import { getFinalVideoLink } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";
import { driveInfo } from "@/lib/review";

/**
 * Serves the Drive thumbnail for a client's video through our own server.
 * Phone browsers block Google from inside other sites, so fetching it here
 * (server-to-Google, no cookies needed for "Anyone with the link" files) is
 * what makes the cover image show up on iPhone.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const clientId = await getSessionClientId();
  if (!clientId) return new Response(null, { status: 401 });

  const { id } = await params;
  const link = await getFinalVideoLink(clientId, id).catch(() => null);
  const info = link ? driveInfo(link) : null;
  if (!info?.thumbnail) return notFound();

  try {
    const res = await fetch(info.thumbnail, { redirect: "follow", cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return notFound();
    return new Response(res.body, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=600" },
    });
  } catch {
    return notFound();
  }
}
