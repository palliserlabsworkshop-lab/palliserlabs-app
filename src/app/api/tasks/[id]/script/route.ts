import { NextResponse } from "next/server";
import { getScript } from "@/lib/notion";
import { scriptFileName } from "@/lib/script";
import { getViewer } from "@/lib/viewer";

/** Downloads a project's script as a plain text file — only for the signed-in person's own brands. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login", request.url));

  const { id } = await params;
  const script = await getScript(viewer.brandIds, id).catch(() => null);
  if (!script || (!script.text && !script.link)) {
    return new NextResponse("Script not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const body = [script.title, "", script.text, ...(script.link ? ["", `Google Doc: ${script.link}`] : []), ""].join("\n");
  const name = scriptFileName(script.title);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="script.txt"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
