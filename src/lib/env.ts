import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Accepts either a bare Notion ID or a full Notion URL and returns the
 * 32-character ID (the last hex run in the string, ignoring any ?v= view id).
 */
export function normalizeNotionId(raw: string): string {
  const withoutQuery = raw.split("?")[0];
  const matches = withoutQuery.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  if (!matches) throw new Error(`Not a valid Notion ID or URL: ${raw}`);
  return matches[matches.length - 1].toLowerCase();
}

export const env = {
  get notionToken() {
    return required("NOTION_TOKEN");
  },
  get clientsDbId() {
    return normalizeNotionId(required("CLIENTS_DB_ID"));
  },
  get tasksDbId() {
    return normalizeNotionId(required("TASKS_DB_ID"));
  },
  get filesDbId() {
    return normalizeNotionId(required("FILES_DB_ID"));
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return new TextEncoder().encode(secret);
  },
};
