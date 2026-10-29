import "server-only";
import { importPKCS8, SignJWT } from "jose";

/**
 * Minimal Google Drive client using a service account (no Google SDK needed).
 *
 * Setup (see README): put the whole service-account JSON key in GOOGLE_SERVICE_ACCOUNT_JSON,
 * the "Final edits" folder ID in DRIVE_FINAL_EDITS_FOLDER_ID, and share that folder with the
 * service account's email as Editor. Without both env vars every function here is a no-op.
 */

type ServiceAccount = { client_email: string; private_key: string };
export type DriveItem = { id: string; name: string; mimeType: string; webViewLink?: string; parents?: string[] };

const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const COMMON = "supportsAllDrives=true";

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as Partial<ServiceAccount>;
    return json.client_email && json.private_key ? (json as ServiceAccount) : null;
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    return null;
  }
}

export function finalEditsFolderId(): string | null {
  return process.env.DRIVE_FINAL_EDITS_FOLDER_ID?.trim() || null;
}

export function isDriveConfigured(): boolean {
  return Boolean(serviceAccount() && finalEditsFolderId());
}

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const sa = serviceAccount();
  if (!sa) throw new Error("Google service account is not configured");
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function drive<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Drive ${init.method ?? "GET"} ${path.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function listFolder(folderId: string): Promise<DriveItem[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,parents)");
  const data = await drive<{ files: DriveItem[] }>(
    `/files?q=${q}&fields=${fields}&pageSize=100&orderBy=createdTime&includeItemsFromAllDrives=true&${COMMON}`,
  );
  return data.files ?? [];
}

const subfolderCache = new Map<string, string>();

/** Finds (or creates) a named subfolder inside the Final edits folder, e.g. "Delivered". */
export async function ensureSubfolder(name: string): Promise<string> {
  const cached = subfolderCache.get(name);
  if (cached) return cached;
  const root = finalEditsFolderId()!;
  const existing = (await listFolder(root)).find((f) => f.mimeType === FOLDER_MIME && f.name === name);
  const id =
    existing?.id ??
    (
      await drive<{ id: string }>(`/files?${COMMON}`, {
        method: "POST",
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [root] }),
      })
    ).id;
  subfolderCache.set(name, id);
  return id;
}

/** Makes a file or folder viewable by anyone with the link, so clients can watch it. */
export async function shareWithAnyone(fileId: string): Promise<void> {
  await drive(`/files/${fileId}/permissions?${COMMON}`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

/** Moves a file or folder into another folder. Its link stays the same. */
export async function moveTo(fileId: string, folderId: string): Promise<void> {
  const file = await drive<{ parents?: string[] }>(`/files/${fileId}?fields=parents&${COMMON}`);
  const remove = (file.parents ?? []).filter((p) => p !== folderId).join(",");
  if (!remove && file.parents?.includes(folderId)) return;
  await drive(`/files/${fileId}?addParents=${folderId}${remove ? `&removeParents=${remove}` : ""}&${COMMON}`, {
    method: "PATCH",
    body: "{}",
  });
}

export function isFolder(item: DriveItem): boolean {
  return item.mimeType === FOLDER_MIME;
}

export function viewLink(item: DriveItem): string {
  return (
    item.webViewLink ??
    (isFolder(item) ? `https://drive.google.com/drive/folders/${item.id}` : `https://drive.google.com/file/d/${item.id}/view`)
  );
}
