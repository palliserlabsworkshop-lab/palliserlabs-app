import { NextResponse } from "next/server";
import { syncFinalEdits } from "@/lib/drive-sync";

/** Manual/extra trigger for the Drive sync: GET with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncFinalEdits());
  } catch (error) {
    console.error("Drive sync failed:", error);
    return NextResponse.json({ error: "Drive sync failed" }, { status: 500 });
  }
}
