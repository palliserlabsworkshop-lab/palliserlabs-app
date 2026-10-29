import { NextResponse } from "next/server";
import { addComment, getComments, MAX_COMMENT_LENGTH } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";

const noStore = { "Cache-Control": "no-store" };

/** The viewer's Messages thread: their People row (or, for older client logins, their client row). */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ comments: await getComments(viewer.messagesPageId, viewer.name) }, { headers: noStore });
  } catch (error) {
    console.error("Failed to load comments:", error);
    return NextResponse.json({ error: "Could not load comments" }, { status: 502, headers: noStore });
  }
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment is empty" }, { status: 400, headers: noStore });
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400, headers: noStore });
  }

  try {
    await addComment(viewer.name, text, viewer.messagesPageId);
    return NextResponse.json({ comments: await getComments(viewer.messagesPageId, viewer.name) }, { headers: noStore });
  } catch (error) {
    console.error("Failed to post comment:", error);
    return NextResponse.json({ error: "Could not post comment" }, { status: 502, headers: noStore });
  }
}
