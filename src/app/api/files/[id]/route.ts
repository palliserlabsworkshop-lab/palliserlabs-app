import { NextResponse } from "next/server";
import { getClientFileLink } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";

/** Resolves a fresh download link for one of the signed-in client's files and redirects to it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await params;
  const link = await getClientFileLink(viewer.brandIds, id).catch(() => null);
  if (!link || !/^https?:\/\//i.test(link)) {
    return new NextResponse("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(link, { headers: { "Cache-Control": "no-store" } });
}
