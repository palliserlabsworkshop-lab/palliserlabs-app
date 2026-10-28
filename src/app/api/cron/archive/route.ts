import { NextResponse } from "next/server";
import { archiveDownloadedVideos } from "@/lib/notion";

/** Runs daily (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const archived = await archiveDownloadedVideos();
    return NextResponse.json({ archived });
  } catch (error) {
    console.error("Archive job failed:", error);
    return NextResponse.json({ error: "Archive job failed" }, { status: 500 });
  }
}
