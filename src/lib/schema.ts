/**
 * Notion property names used by the portal. If you rename a column in
 * Notion, update it here — nothing else needs to change.
 */
export const CLIENT_PROPS = {
  name: "Name",
  email: "Email",
  company: "Company",
  status: "Status",
  appPassword: "App Password",
} as const;

export const TASK_PROPS = {
  title: "Task",
  status: "Status",
  dueDate: "Due date",
  client: "Client",
} as const;

export const FILE_PROPS = {
  name: "File name",
  file: "File/URL",
  type: "Type",
  client: "Client",
} as const;

/** Task status values that count as "Completed" (case-insensitive). */
export const DONE_STATUSES = ["done", "completed", "complete"];

/** Client Status values that are NOT allowed to log in (case-insensitive). */
export const BLOCKED_CLIENT_STATUSES = ["inactive", "archived", "disabled", "former"];
