import { NextResponse } from "next/server";
import { hasCronSecret } from "@/lib/request-guard";
import { archiveDownloadedVideos, chargeUnbilledApprovals } from "@/lib/notion";
import { archiveDriveFiles, syncFinalEdits } from "@/lib/drive-sync";

/**
 * Runs daily (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
 * Archives downloaded videos in Notion (and files them into Drive's Archive folder),
 * picks up any final edits waiting in the Drive folder, and adds any missing charges to Charges.
 */
export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { archived, links } = await archiveDownloadedVideos();
    await archiveDriveFiles(links);
    const drive = await syncFinalEdits();
    // Billing catch-up: any approved video without a charge row gets one (never charges twice).
    const charged = await chargeUnbilledApprovals().catch((error) => {
      console.error("Billing catch-up failed:", error);
      return -1;
    });
    return NextResponse.json({ archived, drive, charged });
  } catch (error) {
    console.error("Daily job failed:", error);
    return NextResponse.json({ error: "Daily job failed" }, { status: 500 });
  }
}
