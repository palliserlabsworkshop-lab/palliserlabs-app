import { NextResponse } from "next/server";
import { getClientFileLink } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";

/** Resolves a fresh download link for one of the signed-in client's files and redirects to it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getSessionClientId();
  if (!clientId) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await params;
  const link = await getClientFileLink(clientId, id).catch(() => null);
  if (!link || !/^https?:\/\//i.test(link)) {
    return new NextResponse("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(link, { headers: { "Cache-Control": "no-store" } });
}
