import { NextResponse } from "next/server";
import { recordDownload } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";

/**
 * Download button target: records "Downloaded on" in Notion the first time,
 * then sends the client to the final video in Google Drive.
 * (It records the click — Drive doesn't tell us whether the file was saved.)
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await params;
  const link = await recordDownload(viewer.brandIds, id).catch(() => null);
  if (!link || !/^https?:\/\//i.test(link)) {
    return new NextResponse("Video not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(link, { headers: { "Cache-Control": "no-store" } });
}
