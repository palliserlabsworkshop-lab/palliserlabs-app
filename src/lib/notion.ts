import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  Client,
  collectPaginatedAPI,
  isFullComment,
  isFullDatabase,
  isFullPage,
  isNotionClientError,
  APIErrorCode,
  type PageObjectResponse,
  type QueryDataSourceParameters,
} from "@notionhq/client";
import { env, normalizeNotionId } from "./env";
import {
  BLOCKED_CLIENT_STATUSES,
  CLIENT_PROPS,
  DONE_STATUSES,
  FILE_PROPS,
  NEW_PROJECT_STATUS,
  TASK_PROPS,
} from "./schema";
import { briefRows, parseBrief, type Brief } from "./brief";

// ---------------------------------------------------------------------------
// Client + data source resolution
// ---------------------------------------------------------------------------

let notionClient: Client | null = null;
function notion(): Client {
  notionClient ??= new Client({ auth: env.notionToken });
  return notionClient;
}

type Schema = Record<string, string>; // property name -> property type
type DataSource = { id: string; schema: Schema };

// Only database *structure* is cached in memory — never client data.
const dataSourceCache = new Map<string, Promise<DataSource>>();

async function loadDataSource(databaseId: string): Promise<DataSource> {
  let dataSourceId = databaseId;
  try {
    const db = await notion().databases.retrieve({ database_id: databaseId });
    if (isFullDatabase(db) && db.data_sources.length > 0) dataSourceId = db.data_sources[0].id;
  } catch (error) {
    // The ID may already be a data source ID rather than a database ID.
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ObjectNotFound) throw error;
  }
  const ds = await notion().dataSources.retrieve({ data_source_id: dataSourceId });
  const schema: Schema = {};
  for (const [name, prop] of Object.entries(ds.properties)) schema[name] = prop.type;
  return { id: ds.id, schema };
}

function dataSource(databaseId: string): Promise<DataSource> {
  let cached = dataSourceCache.get(databaseId);
  if (!cached) {
    cached = loadDataSource(databaseId);
    cached.catch(() => dataSourceCache.delete(databaseId));
    dataSourceCache.set(databaseId, cached);
  }
  return cached;
}

type Filter = QueryDataSourceParameters["filter"];
type Sorts = QueryDataSourceParameters["sorts"];

async function queryAll(ds: DataSource, filter?: Filter, sorts?: Sorts): Promise<PageObjectResponse[]> {
  const results = await collectPaginatedAPI(notion().dataSources.query, {
    data_source_id: ds.id,
    filter,
    sorts,
  });
  return results.filter((r): r is PageObjectResponse => r.object === "page" && isFullPage(r));
}

// ---------------------------------------------------------------------------
// Property readers — tolerant of whichever property type you chose in Notion
// ---------------------------------------------------------------------------

type Property = PageObjectResponse["properties"][string];

/** Column names are matched ignoring case, spaces and punctuation ("File / URL" = "File/URL"). */
function looseKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Returns the property's real name as it appears in Notion, or the given name if none matches. */
function resolveName(names: Iterable<string>, wanted: string): string {
  const list = [...names];
  if (list.includes(wanted)) return wanted;
  return list.find((n) => looseKey(n) === looseKey(wanted)) ?? wanted;
}

function findProp(page: PageObjectResponse, name: string): Property | undefined {
  return page.properties[resolveName(Object.keys(page.properties), name)];
}

function richText(items: { plain_text: string }[]): string {
  return items.map((t) => t.plain_text).join("");
}

function propText(prop: Property | undefined): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return richText(prop.title);
    case "rich_text":
      return richText(prop.rich_text);
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    case "url":
      return prop.url ?? "";
    case "number":
      return prop.number == null ? "" : String(prop.number);
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "multi_select":
      return prop.multi_select.map((o) => o.name).join(", ");
    case "unique_id":
      return prop.unique_id.number == null ? "" : `${prop.unique_id.prefix ?? ""}${prop.unique_id.number}`;
    case "formula":
      if (prop.formula.type === "string") return prop.formula.string ?? "";
      if (prop.formula.type === "number") return prop.formula.number == null ? "" : String(prop.formula.number);
      return "";
    default:
      return "";
  }
}

/** Reads a named property, falling back to the page title for title-like fields. */
function getText(page: PageObjectResponse, name: string, fallbackToTitle = false): string {
  const prop = findProp(page, name);
  if (prop || !fallbackToTitle) return propText(prop).trim();
  const title = Object.values(page.properties).find((p) => p.type === "title");
  return propText(title).trim();
}

function getDate(page: PageObjectResponse, name: string): string | null {
  const prop = findProp(page, name);
  if (prop?.type === "date") return prop.date?.start ?? null;
  if (prop?.type === "formula" && prop.formula.type === "date") return prop.formula.date?.start ?? null;
  return null;
}

function readFileLink(page: PageObjectResponse, name: string): string | null {
  const prop = findProp(page, name);
  if (!prop) return null;
  if (prop.type === "files") {
    const first = prop.files[0];
    if (!first) return null;
    return first.type === "file" ? first.file.url : first.external.url;
  }
  const text = propText(prop);
  return text || null;
}

/** Builds an "equals" filter appropriate for the property's actual type. */
function equalsFilter(schema: Schema, wanted: string, value: string): Filter | null {
  const property = resolveName(Object.keys(schema), wanted);
  switch (schema[property]) {
    case "email":
      return { property, email: { equals: value } };
    case "rich_text":
      return { property, rich_text: { equals: value } };
    case "title":
      return { property, title: { equals: value } };
    case "phone_number":
      return { property, phone_number: { equals: value } };
    default:
      return null;
  }
}

/** Every task/file query goes through this — the client isolation guarantee. */
function belongsToClient(property: string, clientId: string): Filter {
  return { property, relation: { contains: clientId } };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export type ClientProfile = { id: string; name: string; company: string; email: string };

function toProfile(page: PageObjectResponse): ClientProfile {
  return {
    id: page.id,
    name: getText(page, CLIENT_PROPS.name, true),
    company: getText(page, CLIENT_PROPS.company),
    email: getText(page, CLIENT_PROPS.email),
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function isBlocked(page: PageObjectResponse): boolean {
  const status = getText(page, CLIENT_PROPS.status).toLowerCase();
  return BLOCKED_CLIENT_STATUSES.includes(status);
}

/**
 * Returns the client whose Email + App Password match, or null.
 * The password comparison happens here on the server; it is never sent to the browser.
 */
export async function authenticateClient(email: string, password: string): Promise<ClientProfile | null> {
  const ds = await dataSource(env.clientsDbId);
  const wanted = email.trim().toLowerCase();

  let candidates: PageObjectResponse[] = [];
  for (const value of new Set([email.trim(), wanted])) {
    const filter = equalsFilter(ds.schema, CLIENT_PROPS.email, value);
    if (!filter) break;
    candidates = await queryAll(ds, filter);
    if (candidates.length) break;
  }
  // Notion's "equals" may be case-sensitive (Jane@Co.com vs jane@co.com), and some property
  // types (e.g. formula) can't be filtered on — fall back to matching in code. This only
  // runs on the failure path, which is already throttled.
  if (!candidates.length) candidates = await queryAll(ds);

  for (const page of candidates) {
    if (getText(page, CLIENT_PROPS.email).toLowerCase() !== wanted) continue;
    let stored = getText(page, CLIENT_PROPS.appPassword).replace(/\s/g, "");
    // A Number property drops leading zeros (0042 -> 42), so pad back to 4 digits.
    if (/^\d{1,3}$/.test(stored)) stored = stored.padStart(4, "0");
    if (!/^\d{4}$/.test(stored)) continue;
    if (safeEqual(stored, password) && !isBlocked(page)) return toProfile(page);
  }
  return null;
}

/** Loads a client by page ID, verifying the page really is a row in the Clients DB. */
export async function getClient(clientId: string): Promise<ClientProfile | null> {
  try {
    const [ds, page] = await Promise.all([
      dataSource(env.clientsDbId),
      notion().pages.retrieve({ page_id: clientId }),
    ]);
    if (!isFullPage(page) || page.in_trash) return null;
    const parent = page.parent;
    const parentId =
      parent.type === "data_source_id" ? parent.data_source_id : parent.type === "database_id" ? parent.database_id : "";
    const ok =
      normalizeNotionId(parentId) === normalizeNotionId(ds.id) ||
      (parent.type === "data_source_id" && normalizeNotionId(parent.database_id) === env.clientsDbId) ||
      normalizeNotionId(parentId) === env.clientsDbId;
    if (!ok || isBlocked(page)) return null;
    return toProfile(page);
  } catch (error) {
    if (isNotionClientError(error) && error.code === APIErrorCode.ObjectNotFound) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type Task = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  done: boolean;
  hasBrief: boolean;
};

export async function getTasks(clientId: string): Promise<Task[]> {
  const ds = await dataSource(env.tasksDbId);
  const dueDate = resolveName(Object.keys(ds.schema), TASK_PROPS.dueDate);
  const sorts: Sorts = ds.schema[dueDate]
    ? [{ property: dueDate, direction: "ascending" }]
    : undefined;
  const pages = await queryAll(ds, belongsToClient(resolveName(Object.keys(ds.schema), TASK_PROPS.client), clientId), sorts);
  return pages.map((page) => {
    const status = getText(page, TASK_PROPS.status);
    return {
      id: page.id,
      title: getText(page, TASK_PROPS.title, true) || "Untitled task",
      status: status || NEW_PROJECT_STATUS,
      dueDate: getDate(page, TASK_PROPS.dueDate),
      done: DONE_STATUSES.includes(status.toLowerCase()),
      hasBrief: Boolean(getText(page, TASK_PROPS.briefData)),
    };
  });
}

// ---------------------------------------------------------------------------
// Projects — client-submitted briefs, stored as rows in the Tasks DB
// ---------------------------------------------------------------------------

type RichTextRequest = { type: "text"; text: { content: string; link?: { url: string } | null } };

/** Notion caps each text object at 2000 characters, so long text is split across several. */
function chunkText(text: string, link?: string): RichTextRequest[] {
  const chunks: RichTextRequest[] = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: "text", text: { content: text.slice(i, i + 2000), link: link ? { url: link } : null } });
  }
  return chunks.length ? chunks : [{ type: "text", text: { content: "" } }];
}

/** The readable brief written into the Notion page body for the editor. */
function briefBlocks(brief: Brief) {
  const paragraph = (rich_text: RichTextRequest[]) =>
    ({ object: "block", type: "paragraph", paragraph: { rich_text } }) as const;
  const blocks: unknown[] = [
    { object: "block", type: "heading_2", heading_2: { rich_text: chunkText("Client brief") } },
  ];
  for (const row of briefRows(brief)) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: chunkText(row.label) },
    });
    if (!row.values.length) {
      blocks.push(paragraph(chunkText("—")));
    } else if (row.links || row.values.length > 1) {
      for (const value of row.values) {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: chunkText(value, row.links ? value : undefined) },
        });
      }
    } else {
      blocks.push(paragraph(chunkText(row.values[0])));
    }
  }
  return blocks;
}

export type ProjectResult = { id: string };

/** Creates a Queued task for the client from a validated brief. */
export async function createProject(client: ClientProfile, brief: Brief): Promise<ProjectResult> {
  const ds = await dataSource(env.tasksDbId);
  const names = Object.keys(ds.schema);
  const titleName = names.find((n) => ds.schema[n] === "title") ?? TASK_PROPS.title;
  const statusName = resolveName(names, TASK_PROPS.status);
  const linkName = resolveName(names, TASK_PROPS.videoLink);
  const briefName = resolveName(names, TASK_PROPS.briefData);
  const clientName = resolveName(names, TASK_PROPS.client);
  const dueName = resolveName(names, TASK_PROPS.dueDate);

  // Built loosely and only for properties that exist, so a missing column never blocks a submission.
  const properties: Record<string, unknown> = {
    [titleName]: { title: chunkText(brief.projectName) },
    [clientName]: { relation: [{ id: client.id }] },
  };
  if (ds.schema[linkName] === "url") properties[linkName] = { url: brief.driveLink };
  else if (ds.schema[linkName] === "rich_text") properties[linkName] = { rich_text: chunkText(brief.driveLink) };
  if (ds.schema[dueName] === "date" && brief.deadline) properties[dueName] = { date: { start: brief.deadline } };
  if (ds.schema[briefName] === "rich_text") properties[briefName] = { rich_text: chunkText(JSON.stringify(brief)) };

  const withStatus = { ...properties };
  if (ds.schema[statusName] === "status") withStatus[statusName] = { status: { name: NEW_PROJECT_STATUS } };
  if (ds.schema[statusName] === "select") withStatus[statusName] = { select: { name: NEW_PROJECT_STATUS } };

  const create = (props: Record<string, unknown>) =>
    notion().pages.create({
      parent: { data_source_id: ds.id },
      properties: props as Parameters<Client["pages"]["create"]>[0]["properties"],
      children: briefBlocks(brief) as Parameters<Client["pages"]["create"]>[0]["children"],
    });

  try {
    const page = await create(withStatus);
    return { id: page.id };
  } catch (error) {
    // If "Queued" isn't a Status option in Notion, still save the project rather than lose it.
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ValidationError) throw error;
    console.error(`Could not set Status to "${NEW_PROJECT_STATUS}" — check the option exists in Notion.`, error);
    const page = await create(properties);
    return { id: page.id };
  }
}

export type Project = Task & { brief: Brief | null };

/** Loads one task for the client (only found if its Client relation is this client). */
export async function getProject(clientId: string, taskId: string): Promise<Project | null> {
  if (!/^[0-9a-f-]{32,36}$/i.test(taskId)) return null;
  const ds = await dataSource(env.tasksDbId);
  const pages = await queryAll(ds, belongsToClient(resolveName(Object.keys(ds.schema), TASK_PROPS.client), clientId));
  const target = normalizeNotionId(taskId);
  const page = pages.find((p) => normalizeNotionId(p.id) === target);
  if (!page) return null;
  const status = getText(page, TASK_PROPS.status);
  const briefJson = getText(page, TASK_PROPS.briefData);
  return {
    id: page.id,
    title: getText(page, TASK_PROPS.title, true) || "Untitled task",
    status: status || NEW_PROJECT_STATUS,
    dueDate: getDate(page, TASK_PROPS.dueDate),
    done: DONE_STATUSES.includes(status.toLowerCase()),
    hasBrief: Boolean(briefJson),
    brief: briefJson ? parseBrief(briefJson) : null,
  };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type ClientFile = { id: string; name: string; type: string; hasLink: boolean };

async function queryClientFiles(clientId: string) {
  const ds = await dataSource(env.filesDbId);
  return queryAll(ds, belongsToClient(resolveName(Object.keys(ds.schema), FILE_PROPS.client), clientId), [
    { timestamp: "created_time", direction: "descending" },
  ]);
}

export async function getFiles(clientId: string): Promise<ClientFile[]> {
  const pages = await queryClientFiles(clientId);
  return pages.map((page) => ({
    id: page.id,
    name: getText(page, FILE_PROPS.name, true) || "Untitled file",
    type: getText(page, FILE_PROPS.type),
    hasLink: Boolean(readFileLink(page, FILE_PROPS.file)),
  }));
}

/**
 * Returns a fresh link for one of this client's files. Notion-hosted file URLs
 * expire after ~1 hour, so they are resolved on click rather than embedded in the page.
 * Looking the file up through the client-filtered query means another client's
 * file ID simply isn't found.
 */
export async function getClientFileLink(clientId: string, fileId: string): Promise<string | null> {
  const pages = await queryClientFiles(clientId);
  const target = normalizeNotionId(fileId);
  const page = pages.find((p) => normalizeNotionId(p.id) === target);
  return page ? readFileLink(page, FILE_PROPS.file) : null;
}

// ---------------------------------------------------------------------------
// Comments — the client's own row-page in the Clients DB is the thread
// ---------------------------------------------------------------------------

export type PortalComment = {
  id: string;
  text: string;
  createdAt: string;
  author: string;
  fromClient: boolean;
};

let botIdPromise: Promise<string> | null = null;
function botUserId(): Promise<string> {
  botIdPromise ??= notion()
    .users.me({})
    .then((me) => me.id)
    .catch((error) => {
      botIdPromise = null;
      throw error;
    });
  return botIdPromise;
}

export async function getComments(clientId: string): Promise<PortalComment[]> {
  const [botId, comments] = await Promise.all([
    botUserId(),
    collectPaginatedAPI(notion().comments.list, { block_id: clientId }),
  ]);
  return comments
    .filter(isFullComment)
    .map((c) => {
      // Comments posted from the portal are authored by the integration (bot user).
      const fromClient = c.created_by.id === botId;
      return {
        id: c.id,
        text: richText(c.rich_text),
        createdAt: c.created_time,
        author: fromClient ? "You" : c.display_name?.resolved_name || "Palliser Labs",
        fromClient,
      };
    })
    .filter((c) => c.text.trim().length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const MAX_COMMENT_LENGTH = 2000; // Notion's per-text-object limit

export async function addComment(client: ClientProfile, text: string): Promise<void> {
  const base = {
    parent: { page_id: client.id },
    rich_text: [{ type: "text" as const, text: { content: text.slice(0, MAX_COMMENT_LENGTH) } }],
  };
  try {
    // Shows the client's name as the author in Notion instead of the integration's.
    await notion().comments.create({
      ...base,
      display_name: { type: "custom", custom: { name: client.name || client.email || "Client" } },
    });
  } catch (error) {
    // If the workspace rejects a custom author name, still deliver the comment.
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ValidationError) throw error;
    await notion().comments.create(base);
  }
}
