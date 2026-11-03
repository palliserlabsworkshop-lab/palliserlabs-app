import { NextResponse } from "next/server";
import { recordPresence, type PresenceState } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";
import { isSameOrigin, readJson } from "@/lib/request-guard";
import { isLimited, recordHit } from "@/lib/rate-limit";

const STATES: PresenceState[] = ["online", "away", "offline"];

/**
 * The dashboard checks in here about once a minute (and when the client goes away or leaves),
 * which keeps "Last seen" / "Presence" current on their People row. Signed-in, same-site only.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 401 });
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const key = `presence:${viewer.id}`;
  if (isLimited(key)) return new NextResponse(null, { status: 429 });
  recordHit(key);

  const body = (await readJson(request, 1024)) as { state?: unknown } | undefined;
  const state = STATES.find((s) => s === body?.state);
  if (!state) return new NextResponse(null, { status: 400 });
  try {
    await recordPresence(viewer.id, state);
  } catch (error) {
    console.error("Could not record presence:", error);
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
