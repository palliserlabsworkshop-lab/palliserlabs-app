import { NextResponse } from "next/server";
import { archiveDownloadedVideos } from "@/lib/notion";
import { archiveDriveFiles, syncFinalEdits } from "@/lib/drive-sync";

/**
 * Runs daily (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
 * Archives downloaded videos in Notion (and files them into Drive's Archive folder),
 * then picks up any final edits waiting in the Drive folder.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { archived, links } = await archiveDownloadedVideos();
    await archiveDriveFiles(links);
    const drive = await syncFinalEdits();
    return NextResponse.json({ archived, drive });
  } catch (error) {
    console.error("Daily job failed:", error);
    return NextResponse.json({ error: "Daily job failed" }, { status: 500 });
  }
}
