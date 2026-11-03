import { NextResponse } from "next/server";
import { addComment, getComments, MAX_COMMENT_LENGTH } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";
import { isSameOrigin, readJson } from "@/lib/request-guard";
import { isLimited, recordHit } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "no-store" };

/** The viewer's Messages thread: comments on their own People row, covering all their brands. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ comments: await getComments(viewer.id, viewer.name) }, { headers: noStore });
  } catch (error) {
    console.error("Failed to load comments:", error);
    return NextResponse.json({ error: "Could not load comments" }, { status: 502, headers: noStore });
  }
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  // Anti-spam: up to 60 posts per person per 15 minutes.
  const postKey = `post:${viewer.id}`;
  if (isLimited(postKey)) return NextResponse.json({ error: "You’re posting very quickly — please wait a moment." }, { status: 429, headers: noStore });
  recordHit(postKey);

  const body = (await readJson(request)) as { text?: unknown } | undefined;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment is empty" }, { status: 400, headers: noStore });
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400, headers: noStore });
  }

  try {
    await addComment(viewer.name, text, viewer.id);
    return NextResponse.json({ comments: await getComments(viewer.id, viewer.name) }, { headers: noStore });
  } catch (error) {
    console.error("Failed to post comment:", error);
    return NextResponse.json({ error: "Could not post comment" }, { status: 502, headers: noStore });
  }
}
