import { NextResponse } from "next/server";
import { addTaskComment, getClient, getTaskComments, MAX_COMMENT_LENGTH } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";

const noStore = { "Cache-Control": "no-store" };

/** Feedback thread for one video — comments on that task's Notion page, only for its own client. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getSessionClientId();
  if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const { id } = await params;
  try {
    const comments = await getTaskComments(clientId, id);
    if (!comments) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ comments }, { headers: noStore });
  } catch (error) {
    console.error("Failed to load task comments:", error);
    return NextResponse.json({ error: "Could not load comments" }, { status: 502, headers: noStore });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = await getSessionClientId();
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment is empty" }, { status: 400, headers: noStore });
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400, headers: noStore });
  }

  try {
    if (!(await addTaskComment(client, id, text))) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
    }
    return NextResponse.json({ comments: (await getTaskComments(client.id, id)) ?? [] }, { headers: noStore });
  } catch (error) {
    console.error("Failed to post task comment:", error);
    return NextResponse.json({ error: "Could not post comment" }, { status: 502, headers: noStore });
  }
}
