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
  PERSON_PROPS,
  REVIEW_STATUS,
  APPROVED_STATUS,
  ARCHIVE_AFTER_DOWNLOAD_DAYS,
  ARCHIVED_STATUS,
  BLOCKED_CLIENT_STATUSES,
  CLIENT_PROPS,
  DONE_STATUSES,
  FILE_PROPS,
  HIDE_DONE_AFTER_DAYS,
  NEW_PROJECT_STATUS,
  TASK_PROPS,
  TWEAKS_STATUS,
} from "./schema";
import { statusKind } from "./status";
import { ownBrandOf } from "./scope";
import { briefRows, FORMAT_OPTIONS, labelsFor, parseBrief, PLATFORM_OPTIONS, type Brief } from "./brief";

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

function getNumber(page: PageObjectResponse, name: string): number | null {
  const prop = findProp(page, name);
  if (prop?.type === "number") return prop.number;
  const n = Number(propText(prop));
  return propText(prop) && Number.isFinite(n) ? n : null;
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

/**
 * Every task/file query goes through this — the isolation guarantee. Matches rows linked to
 * any of the viewer's brands. Returns null for an empty list, and callers then return nothing
 * (an empty list must never mean "no filter").
 */
function belongsToAny(property: string, brandIds: string[]): Filter | null {
  if (!brandIds.length) return null;
  const one = (id: string) => ({ property, relation: { contains: id } });
  return brandIds.length === 1 ? one(brandIds[0]) : ({ or: brandIds.map(one) } as Filter);
}

/** The Tasks/Files column linking to a brand — "Client" or (if renamed) "Brand". */
function brandColumn(schema: Schema, wanted: string): string {
  const names = Object.keys(schema);
  for (const candidate of [wanted, "Brand", "Brands", "Clients"]) {
    const name = resolveName(names, candidate);
    if (schema[name] === "relation") return name;
  }
  return resolveName(names, wanted);
}

function relationIds(page: PageObjectResponse, name: string): string[] {
  const prop = page.properties[name];
  return prop?.type === "relation" ? prop.relation.map((r) => r.id) : [];
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
  const page = await matchLogin(env.clientsDbId, CLIENT_PROPS, email, password);
  return page ? toProfile(page) : null;
}

/**
 * Who is acting: a person (People DB) or a legacy client login (Clients DB row).
 * `brandIds` always comes from Notion on the server.
 */
export type Actor = { kind: "person" | "client"; id: string; name: string; email: string; brandIds: string[] };

/** Finds the row in a database whose Email + 4-digit App Password match. Timing-safe. */
async function matchLogin(
  databaseId: string,
  props: { email: string; appPassword: string },
  email: string,
  password: string,
): Promise<PageObjectResponse | null> {
  const ds = await dataSource(databaseId);
  const wanted = email.trim().toLowerCase();
  let candidates: PageObjectResponse[] = [];
  for (const value of new Set([email.trim(), wanted])) {
    const filter = equalsFilter(ds.schema, props.email, value);
    if (!filter) break;
    candidates = await queryAll(ds, filter);
    if (candidates.length) break;
  }
  if (!candidates.length) candidates = await queryAll(ds);
  for (const page of candidates) {
    if (getText(page, props.email).toLowerCase() !== wanted) continue;
    let stored = getText(page, props.appPassword).replace(/\s/g, "");
    if (/^\d{1,3}$/.test(stored)) stored = stored.padStart(4, "0");
    if (!/^\d{4}$/.test(stored)) continue;
    if (safeEqual(stored, password) && !isBlocked(page)) return page;
  }
  return null;
}

export type PersonProfile = { id: string; name: string; email: string; brandIds: string[] };

function toPerson(page: PageObjectResponse, schema: Schema): PersonProfile {
  return {
    id: page.id,
    name: getText(page, PERSON_PROPS.name, true),
    email: getText(page, PERSON_PROPS.email),
    brandIds: relationIds(page, brandColumn(schema, PERSON_PROPS.brands)),
  };
}

/** People login (only when PEOPLE_DB_ID is set). */
export async function authenticatePerson(email: string, password: string): Promise<PersonProfile | null> {
  const dbId = env.peopleDbId;
  if (!dbId) return null;
  const page = await matchLogin(dbId, PERSON_PROPS, email, password);
  return page ? toPerson(page, (await dataSource(dbId)).schema) : null;
}

/** Loads a person by page ID, verifying it's a row in the People DB and not blocked. */
export async function getPerson(personId: string): Promise<PersonProfile | null> {
  const dbId = env.peopleDbId;
  if (!dbId) return null;
  const page = await loadRowOf(dbId, personId);
  return page ? toPerson(page, (await dataSource(dbId)).schema) : null;
}

/** Retrieves a page and checks it belongs to the given database (and isn't trashed or blocked). */
async function loadRowOf(databaseId: string, pageId: string): Promise<PageObjectResponse | null> {
  try {
    const [ds, page] = await Promise.all([dataSource(databaseId), notion().pages.retrieve({ page_id: pageId })]);
    if (!isFullPage(page) || page.in_trash) return null;
    const parent = page.parent;
    const parentId =
      parent.type === "data_source_id" ? parent.data_source_id : parent.type === "database_id" ? parent.database_id : "";
    const ok =
      normalizeNotionId(parentId) === normalizeNotionId(ds.id) ||
      (parent.type === "data_source_id" && normalizeNotionId(parent.database_id) === databaseId) ||
      normalizeNotionId(parentId) === databaseId;
    return ok && !isBlocked(page) ? page : null;
  } catch (error) {
    if (isNotionClientError(error) && (error.code === APIErrorCode.ObjectNotFound || error.code === APIErrorCode.ValidationError)) {
      return null;
    }
    throw error;
  }
}

/** Loads a client by page ID, verifying the page really is a row in the Clients DB. */
export async function getClient(clientId: string): Promise<ClientProfile | null> {
  const page = await loadRowOf(env.clientsDbId, clientId);
  return page ? toProfile(page) : null;
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
  finalVideo: string | null;
  revisionRound: number | null;
  approvedOn: string | null;
  downloadedOn: string | null;
  /** Finished long enough ago to leave the main dashboard (shown under "Archive"). */
  archived: boolean;
  /** Which of the viewer's brands this task belongs to (null outside a viewer context). */
  brandId: string | null;
};

const DAY_MS = 86_400_000;
const daysSince = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / DAY_MS : 0);

function toTask(page: PageObjectResponse, viewerBrandIds: string[] = [], brandCol = ""): Task {
  const status = getText(page, TASK_PROPS.status) || NEW_PROJECT_STATUS;
  const kind = statusKind(status);
  const done = DONE_STATUSES.includes(status.toLowerCase());
  const finalVideo = getText(page, TASK_PROPS.finalVideo) || null;
  const downloadedOn = getDate(page, TASK_PROPS.downloadedOn);
  const dueDate = getDate(page, TASK_PROPS.dueDate);
  // Hide rules (app only — Notion is only written by the daily archive job, for downloaded videos):
  //  - Status "Archived"
  //  - a delivered video downloaded more than ARCHIVE_AFTER_DOWNLOAD_DAYS ago
  //  - an older Done task with no final video, HIDE_DONE_AFTER_DAYS after its due date / last edit
  const archived =
    kind === "archived" ||
    (done && downloadedOn !== null && daysSince(downloadedOn) > ARCHIVE_AFTER_DOWNLOAD_DAYS) ||
    (done && !finalVideo && daysSince(dueDate ?? page.last_edited_time) > HIDE_DONE_AFTER_DAYS);
  return {
    id: page.id,
    title: getText(page, TASK_PROPS.title, true) || "Untitled task",
    status,
    dueDate,
    done,
    hasBrief: Boolean(getText(page, TASK_PROPS.briefData)),
    finalVideo,
    revisionRound: getNumber(page, TASK_PROPS.revisionRound),
    approvedOn: getDate(page, TASK_PROPS.approvedOn),
    downloadedOn,
    archived,
    brandId: brandCol ? ownBrandOf(relationIds(page, brandCol), viewerBrandIds) : null,
  };
}

export async function getTasks(brandIds: string[]): Promise<Task[]> {
  const ds = await dataSource(env.tasksDbId);
  const col = brandColumn(ds.schema, TASK_PROPS.client);
  const filter = belongsToAny(col, brandIds);
  if (!filter) return [];
  const dueDate = resolveName(Object.keys(ds.schema), TASK_PROPS.dueDate);
  const sorts: Sorts = ds.schema[dueDate] ? [{ property: dueDate, direction: "ascending" }] : undefined;
  const pages = await queryAll(ds, filter, sorts);
  return pages.map((page) => toTask(page, brandIds, col));
}

/** Loads one task page — only if it's linked to one of the viewer's brands. The ownership gate for every task action. */
async function getOwnedTaskPage(brandIds: string[], taskId: string): Promise<PageObjectResponse | null> {
  if (!/^[0-9a-f-]{32,36}$/i.test(taskId)) return null;
  const ds = await dataSource(env.tasksDbId);
  const filter = belongsToAny(brandColumn(ds.schema, TASK_PROPS.client), brandIds);
  if (!filter) return null;
  const pages = await queryAll(ds, filter);
  const target = normalizeNotionId(taskId);
  return pages.find((p) => normalizeNotionId(p.id) === target) ?? null;
}

/** Writes task properties by name, shaping each value to the column's actual type. Missing columns are skipped. */
async function updateTask(
  pageId: string,
  values: { status?: string; dates?: Record<string, string>; numbers?: Record<string, number>; urls?: Record<string, string> },
) {
  const ds = await dataSource(env.tasksDbId);
  const names = Object.keys(ds.schema);
  const properties: Record<string, unknown> = {};
  if (values.status) {
    const name = resolveName(names, TASK_PROPS.status);
    if (ds.schema[name] === "status") properties[name] = { status: { name: values.status } };
    if (ds.schema[name] === "select") properties[name] = { select: { name: values.status } };
  }
  for (const [wanted, date] of Object.entries(values.dates ?? {})) {
    const name = resolveName(names, wanted);
    if (ds.schema[name] === "date") properties[name] = { date: { start: date } };
  }
  for (const [wanted, url] of Object.entries(values.urls ?? {})) {
    const name = resolveName(names, wanted);
    if (ds.schema[name] === "url") properties[name] = { url };
    if (ds.schema[name] === "rich_text") properties[name] = { rich_text: chunkText(url) };
  }
  for (const [wanted, num] of Object.entries(values.numbers ?? {})) {
    const name = resolveName(names, wanted);
    if (ds.schema[name] === "number") properties[name] = { number: num };
  }
  if (!Object.keys(properties).length) return;
  await notion().pages.update({
    page_id: pageId,
    properties: properties as Parameters<Client["pages"]["update"]>[0]["properties"],
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export type ReviewResult = { ok: true } | { ok: false; error: string };

/** Explains a failed status write — usually a Status option missing in Notion. */
function reviewError(error: unknown, statusName: string): ReviewResult {
  if (isNotionClientError(error) && error.code === APIErrorCode.ValidationError) {
    console.error(`Could not set Status to "${statusName}" — check that option exists in Notion.`, error);
  } else {
    console.error("Review update failed:", error);
  }
  return { ok: false, error: "We couldn’t save that just now. Please try again, or message us below." };
}

/** Client approves the cut. Only allowed while the task is Ready for review. */
export async function approveVideo(actor: Actor, taskId: string): Promise<ReviewResult> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return { ok: false, error: "We couldn’t find that video." };
  if (statusKind(getText(page, TASK_PROPS.status)) !== "review") {
    return { ok: false, error: "This video isn’t waiting for review any more." };
  }
  try {
    await updateTask(page.id, { status: APPROVED_STATUS, dates: { [TASK_PROPS.approvedOn]: today() } });
  } catch (error) {
    return reviewError(error, APPROVED_STATUS);
  }
  await addComment(actor.name, "✅ Approved — thank you!", page.id).catch(() => {});
  return { ok: true };
}

export type TweakRequest = { areas: string[]; details: string; timestamp: string };

/** Client asks for changes. Moves the task to Tweaks requested and bumps the revision round. */
export async function requestTweaks(actor: Actor, taskId: string, req: TweakRequest): Promise<ReviewResult> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return { ok: false, error: "We couldn’t find that video." };
  if (statusKind(getText(page, TASK_PROPS.status)) !== "review") {
    return { ok: false, error: "This video isn’t waiting for review any more." };
  }
  const round = (getNumber(page, TASK_PROPS.revisionRound) ?? 1) + 1;
  try {
    await updateTask(page.id, { status: TWEAKS_STATUS, numbers: { [TASK_PROPS.revisionRound]: round } });
  } catch (error) {
    return reviewError(error, TWEAKS_STATUS);
  }
  const lines = [
    `✏️ Changes requested (for round ${round})`,
    req.areas.length ? `Areas: ${req.areas.join(", ")}` : "",
    req.timestamp ? `At: ${req.timestamp}` : "",
    req.details,
  ].filter(Boolean);
  // The request is posted as a comment on the task page, so the editor sees it (and gets notified) in Notion.
  await addComment(actor.name, lines.join("\n"), page.id).catch((error) => console.error("Tweak comment failed:", error));
  return { ok: true };
}

/** Returns the final video link and records the first download click. */
export async function recordDownload(brandIds: string[], taskId: string): Promise<string | null> {
  const page = await getOwnedTaskPage(brandIds, taskId);
  if (!page) return null;
  const link = getText(page, TASK_PROPS.finalVideo);
  if (!link) return null;
  if (!getDate(page, TASK_PROPS.downloadedOn)) {
    await updateTask(page.id, { dates: { [TASK_PROPS.downloadedOn]: today() } }).catch((error) =>
      console.error("Could not record download:", error),
    );
  }
  return link;
}

// ---------------------------------------------------------------------------
// Drive sync support — used by the Final edits folder automation (src/lib/drive-sync.ts)
// ---------------------------------------------------------------------------

export type CodedTask = { id: string; title: string; statusKind: string; finalVideo: string | null; revisionRound: number | null };

/** Finds the task whose Unique ID ("ID" column, e.g. PL-12) has this number. Null if the column doesn't exist. */
export async function findTaskByCode(code: number): Promise<CodedTask | null> {
  const ds = await dataSource(env.tasksDbId);
  const name = resolveName(Object.keys(ds.schema), TASK_PROPS.code);
  if (ds.schema[name] !== "unique_id") return null;
  const [page] = await queryAll(ds, { property: name, unique_id: { equals: code } });
  if (!page) return null;
  const task = toTask(page);
  return {
    id: page.id,
    title: task.title,
    statusKind: statusKind(task.status, task.done),
    finalVideo: task.finalVideo,
    revisionRound: task.revisionRound,
  };
}

/** Sets a task's Final Video and marks it Ready for review, with a note from the studio. */
export async function deliverFinalVideo(task: CodedTask, link: string): Promise<void> {
  await updateTask(task.id, {
    status: REVIEW_STATUS,
    urls: { [TASK_PROPS.finalVideo]: link },
    ...(task.revisionRound ? {} : { numbers: { [TASK_PROPS.revisionRound]: 1 } }),
  });
  // Posted as the integration (not the client) so it reads as coming from the studio.
  await notion()
    .comments.create({
      parent: { page_id: task.id },
      rich_text: [{ type: "text", text: { content: `🎬 New cut delivered from Google Drive — ready for the client to review.` } }],
    })
    .catch((error) => console.error("Delivery note failed:", error));
}

/** The final video link for one of this client's tasks (no side effects). */
export async function getFinalVideoLink(brandIds: string[], taskId: string): Promise<string | null> {
  const page = await getOwnedTaskPage(brandIds, taskId);
  return page ? getText(page, TASK_PROPS.finalVideo) || null : null;
}

/** Per-video feedback thread: comments on the task's own Notion page. */
export async function getTaskComments(actor: Actor, taskId: string): Promise<PortalComment[] | null> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  return page ? getComments(page.id, actor.name) : null;
}

export async function addTaskComment(actor: Actor, taskId: string, text: string): Promise<boolean> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return false;
  await addComment(actor.name, text, page.id);
  return true;
}

/**
 * Daily job: sets Status to Archived on delivered videos downloaded more than
 * ARCHIVE_AFTER_DOWNLOAD_DAYS ago. Only rows that went through the review flow
 * (they have "Downloaded on") are touched; nothing else in Notion is changed.
 */
export async function archiveDownloadedVideos(): Promise<{ archived: number; links: string[] }> {
  const ds = await dataSource(env.tasksDbId);
  const name = resolveName(Object.keys(ds.schema), TASK_PROPS.downloadedOn);
  if (ds.schema[name] !== "date") return { archived: 0, links: [] };
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DOWNLOAD_DAYS * DAY_MS).toISOString().slice(0, 10);
  const pages = await queryAll(ds, { property: name, date: { before: cutoff } });
  let archived = 0;
  const links: string[] = []; // final videos, so the Drive files can be filed into Archive too
  for (const page of pages) {
    const kind = statusKind(getText(page, TASK_PROPS.status));
    if (kind !== "done") continue;
    try {
      await updateTask(page.id, { status: ARCHIVED_STATUS });
      archived++;
      const link = getText(page, TASK_PROPS.finalVideo);
      if (link) links.push(link);
    } catch (error) {
      reviewError(error, ARCHIVED_STATUS);
      break; // most likely the option is missing — no point retrying every row
    }
  }
  return { archived, links };
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
/** Icon given to tasks created from the portal. */
const PROJECT_ICON = "🎬";

export async function createProject(actor: Actor, brandId: string, brief: Brief): Promise<ProjectResult> {
  const ds = await dataSource(env.tasksDbId);
  const names = Object.keys(ds.schema);
  const col = (wanted: string) => resolveName(names, wanted);
  const titleName = names.find((n) => ds.schema[n] === "title") ?? TASK_PROPS.title;
  const statusName = col(TASK_PROPS.status);
  const linkName = col(TASK_PROPS.videoLink);
  const briefName = col(TASK_PROPS.briefData);
  const clientName = brandColumn(ds.schema, TASK_PROPS.client);
  const requestedByName = col(TASK_PROPS.requestedBy);
  const dueName = col(TASK_PROPS.dueDate);
  const hooksName = col(TASK_PROPS.hooks);
  const formatName = col(TASK_PROPS.format);
  const platformName = col(TASK_PROPS.platform);

  // Essentials: always written. If anything optional is rejected, we retry with just these
  // so a client's brief is never lost (the full brief is also in the page body).
  const essentials: Record<string, unknown> = {
    [titleName]: { title: chunkText(brief.projectName) },
    [clientName]: { relation: [{ id: brandId }] },
  };
  if (ds.schema[briefName] === "rich_text") essentials[briefName] = { rich_text: chunkText(JSON.stringify(brief)) };

  // Optional columns: only written when they exist with the expected type.
  const optional: Record<string, unknown> = {};
  if (ds.schema[linkName] === "url") optional[linkName] = { url: brief.driveLinks[0] };
  else if (ds.schema[linkName] === "rich_text") optional[linkName] = { rich_text: chunkText(brief.driveLinks.join("\n")) };
  if (ds.schema[dueName] === "date" && brief.deadline) optional[dueName] = { date: { start: brief.deadline } };
  if (ds.schema[hooksName] === "number" && brief.hookCount) optional[hooksName] = { number: brief.hookCount };
  // Multi-select option names can't contain commas, so "Other" is written plainly (details are in the brief).
  const options = (labels: string[]) => labels.map((name) => ({ name: name.replace(/,/g, " ").slice(0, 100) }));
  if (ds.schema[formatName] === "multi_select") {
    optional[formatName] = { multi_select: options(labelsFor(brief.format, FORMAT_OPTIONS)) };
  }
  if (ds.schema[platformName] === "multi_select") {
    optional[platformName] = { multi_select: options(labelsFor(brief.platform, PLATFORM_OPTIONS)) };
  }
  // Who asked for it — a link to their People row, or just their name.
  if (ds.schema[requestedByName] === "relation" && actor.kind === "person") {
    optional[requestedByName] = { relation: [{ id: actor.id }] };
  } else if (ds.schema[requestedByName] === "rich_text" && actor.name) {
    optional[requestedByName] = { rich_text: chunkText(actor.name) };
  }
  if (ds.schema[statusName] === "status") optional[statusName] = { status: { name: NEW_PROJECT_STATUS } };
  if (ds.schema[statusName] === "select") optional[statusName] = { select: { name: NEW_PROJECT_STATUS } };

  const create = (props: Record<string, unknown>) =>
    notion().pages.create({
      parent: { data_source_id: ds.id },
      icon: { type: "emoji", emoji: PROJECT_ICON },
      properties: props as Parameters<Client["pages"]["create"]>[0]["properties"],
      children: briefBlocks(brief) as Parameters<Client["pages"]["create"]>[0]["children"],
    });

  try {
    const page = await create({ ...essentials, ...optional });
    return { id: page.id };
  } catch (error) {
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ValidationError) throw error;
    console.error("Notion rejected an optional column — saving the project with essentials only.", error);
    const page = await create(essentials);
    return { id: page.id };
  }
}

export type Project = Task & { brief: Brief | null };

/** Loads one task for the client (only found if its Client relation is this client). */
export async function getProject(brandIds: string[], taskId: string): Promise<Project | null> {
  const page = await getOwnedTaskPage(brandIds, taskId);
  if (!page) return null;
  const briefJson = getText(page, TASK_PROPS.briefData);
  return { ...toTask(page), brief: briefJson ? parseBrief(briefJson) : null };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export type ClientFile = { id: string; name: string; type: string; hasLink: boolean; brandId: string | null };

async function queryBrandFiles(brandIds: string[]): Promise<{ pages: PageObjectResponse[]; col: string }> {
  const ds = await dataSource(env.filesDbId);
  const col = brandColumn(ds.schema, FILE_PROPS.client);
  const filter = belongsToAny(col, brandIds);
  if (!filter) return { pages: [], col };
  return { pages: await queryAll(ds, filter, [{ timestamp: "created_time", direction: "descending" }]), col };
}

export async function getFiles(brandIds: string[]): Promise<ClientFile[]> {
  const { pages, col } = await queryBrandFiles(brandIds);
  return pages.map((page) => ({
    id: page.id,
    name: getText(page, FILE_PROPS.name, true) || "Untitled file",
    type: getText(page, FILE_PROPS.type),
    hasLink: Boolean(readFileLink(page, FILE_PROPS.file)),
    brandId: ownBrandOf(relationIds(page, col), brandIds),
  }));
}

/**
 * Returns a fresh link for one of the viewer's files. Notion-hosted file URLs expire after
 * ~1 hour, so they are resolved on click. Looking the file up through the brand-filtered
 * query means anyone else's file ID simply isn't found.
 */
export async function getClientFileLink(brandIds: string[], fileId: string): Promise<string | null> {
  const { pages } = await queryBrandFiles(brandIds);
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

/**
 * Open comments on a page. Callers must already have checked the viewer may see this page.
 * Portal posts are authored by the integration with the poster's name, so on shared brands
 * a post is "You" only if it carries the viewer's own name — a partner's shows their name.
 */
export async function getComments(pageId: string, viewerName: string): Promise<PortalComment[]> {
  const [botId, comments] = await Promise.all([
    botUserId(),
    collectPaginatedAPI(notion().comments.list, { block_id: pageId }),
  ]);
  return comments
    .filter(isFullComment)
    .map((c) => {
      const viaPortal = c.created_by.id === botId && c.display_name?.type === "custom";
      const name = c.display_name?.resolved_name ?? "";
      const mine = viaPortal && (!name || name.trim().toLowerCase() === viewerName.trim().toLowerCase());
      return {
        id: c.id,
        text: richText(c.rich_text),
        createdAt: c.created_time,
        author: mine ? "You" : name || "Palliser Labs",
        fromClient: mine,
      };
    })
    .filter((c) => c.text.trim().length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const MAX_COMMENT_LENGTH = 2000; // Notion's per-text-object limit

/** Posts a comment on a page under the poster's name. */
export async function addComment(authorName: string, text: string, pageId: string): Promise<void> {
  const base = {
    parent: { page_id: pageId },
    rich_text: [{ type: "text" as const, text: { content: text.slice(0, MAX_COMMENT_LENGTH) } }],
  };
  try {
    // Shows the client's name as the author in Notion instead of the integration's.
    await notion().comments.create({
      ...base,
      display_name: { type: "custom", custom: { name: authorName || "Client" } },
    });
  } catch (error) {
    // If the workspace rejects a custom author name, still deliver the comment.
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ValidationError) throw error;
    await notion().comments.create(base);
  }
}
