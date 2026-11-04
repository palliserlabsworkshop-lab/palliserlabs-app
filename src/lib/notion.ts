import "server-only";
import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  LOCK_AFTER_FAILURES,
  LOCK_BASE_MINUTES,
  LOCK_MAX_MINUTES,
  PERSONAL_BRAND_TYPE,
  PERSON_PROPS,
  REVIEW_STATUS,
  APPROVED_STATUS,
  ARCHIVE_AFTER_DOWNLOAD_DAYS,
  ARCHIVED_STATUS,
  BLOCKED_STATUSES,
  BRAND_PROPS,
  DONE_STATUSES,
  FILE_PROPS,
  HIDE_DONE_AFTER_DAYS,
  NEW_PROJECT_STATUS,
  AWAITING_FOOTAGE_STATUS,
  BILLING_ACCOUNT_PROPS,
  CHARGE_PROPS,
  SCRIPT_STAGE_STATUS,
  SCRIPT_STATUS,
  TASK_PROPS,
  TWEAKS_STATUS,
} from "./schema";
import { statusKind } from "./status";
import { ownBrandOf } from "./scope";
import { briefRows, FORMAT_OPTIONS, labelsFor, parseBrief, PLATFORM_OPTIONS, type Brief } from "./brief";
import { scriptAdds, scriptKind, type ScriptRequest } from "./script";
import { hashPin, isPinHash, verifyPinHash } from "./pin";
import { BILLING_START_DATE, billingMonth, computeCharge, invoiceName, localDate } from "./billing";

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
// Brands and People
// ---------------------------------------------------------------------------

export type Brand = { id: string; name: string; personal: boolean };

function toBrand(page: PageObjectResponse): Brand {
  return {
    id: page.id,
    name: getText(page, BRAND_PROPS.name, true),
    personal: getText(page, BRAND_PROPS.type).toLowerCase() === PERSONAL_BRAND_TYPE.toLowerCase(),
  };
}

function getCheckbox(page: PageObjectResponse, name: string): boolean {
  const prop = findProp(page, name);
  return prop?.type === "checkbox" ? prop.checkbox : false;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function isBlocked(page: PageObjectResponse): boolean {
  const status = getText(page, "Status").toLowerCase();
  return BLOCKED_STATUSES.includes(status);
}


/** The signed-in person acting in the app. `brandIds` always comes from Notion on the server. */
export type Actor = { id: string; name: string; email: string; brandIds: string[] };

/** Finds the People row for an email (case-insensitive). */
async function findPersonByEmail(email: string): Promise<PageObjectResponse | null> {
  const ds = await dataSource(env.peopleDbId);
  const wanted = email.trim().toLowerCase();
  let candidates: PageObjectResponse[] = [];
  for (const value of new Set([email.trim(), wanted])) {
    const filter = equalsFilter(ds.schema, PERSON_PROPS.email, value);
    if (!filter) break;
    candidates = await queryAll(ds, filter);
    if (candidates.length) break;
  }
  if (!candidates.length) candidates = await queryAll(ds);
  return candidates.find((page) => getText(page, PERSON_PROPS.email).toLowerCase() === wanted) ?? null;
}

/** What's in "App Password": the client's own PIN (hashed), a temporary code you set, or nothing usable. */
type StoredCredential = { kind: "pin"; hash: string } | { kind: "temporary"; code: string } | null;

function rawCredential(page: PageObjectResponse): string {
  return getText(page, PERSON_PROPS.appPassword).replace(/\s/g, "");
}

function storedCredential(page: PageObjectResponse): StoredCredential {
  let raw = rawCredential(page);
  if (isPinHash(raw)) return { kind: "pin", hash: raw };
  if (/^\d{1,3}$/.test(raw)) raw = raw.padStart(4, "0"); // a Number column drops leading zeros
  return /^\d{4,6}$/.test(raw) ? { kind: "temporary", code: raw } : null;
}

/**
 * A fingerprint of the person's current login details, kept inside their session. If you change
 * their Email or App Password in Notion, the fingerprint changes and every existing session for
 * them stops working straight away. It never leaves the server.
 */
function credentialTag(page: PageObjectResponse): string {
  const material = `${page.id}|${getText(page, PERSON_PROPS.email).toLowerCase()}|${rawCredential(page)}`;
  return createHmac("sha256", env.sessionSecret).update(material).digest("base64url").slice(0, 32);
}

/** Saves the failed-login count and lock time (skipped if the People columns don't exist). */
async function recordLoginAttempt(page: PageObjectResponse, failures: number, lockedUntil: string | null) {
  const ds = await dataSource(env.peopleDbId);
  const names = Object.keys(ds.schema);
  const properties: Record<string, unknown> = {};
  const failedName = resolveName(names, PERSON_PROPS.failedLogins);
  if (ds.schema[failedName] === "number") properties[failedName] = { number: failures };
  const lockName = resolveName(names, PERSON_PROPS.lockedUntil);
  if (ds.schema[lockName] === "date") properties[lockName] = { date: lockedUntil ? { start: lockedUntil } : null };
  if (!Object.keys(properties).length) return;
  await notion().pages.update({
    page_id: page.id,
    properties: properties as Parameters<Client["pages"]["update"]>[0]["properties"],
  });
}

export type PersonProfile = {
  id: string;
  name: string;
  email: string;
  brandIds: string[];
  wantsPersonalBrand: boolean;
  /** Server-only fingerprint of the current login details (see credentialTag). */
  credentialTag: string;
  /** Signed in with a temporary code: must choose their own PIN before using the app. */
  needsSetup: boolean;
  /** Opted in to promotional emails. */
  marketing: boolean;
};

function toPerson(page: PageObjectResponse, schema: Schema): PersonProfile {
  return {
    id: page.id,
    name: getText(page, PERSON_PROPS.name, true),
    email: getText(page, PERSON_PROPS.email),
    brandIds: relationIds(page, brandColumn(schema, PERSON_PROPS.brands)),
    wantsPersonalBrand: getCheckbox(page, PERSON_PROPS.personalBrand),
    credentialTag: credentialTag(page),
    needsSetup: storedCredential(page)?.kind !== "pin",
    marketing: getCheckbox(page, PERSON_PROPS.marketing),
  };
}

/** Avoids creating two personal brands if two requests arrive at once. */
const personalBrandInFlight = new Map<string, Promise<string>>();

/**
 * Creates "<Name> – Personal" in the Brands database (Type: Personal brand) and links it to the
 * person. Called when their "Personal brand" box is ticked and they don't have one yet.
 */
export function createPersonalBrand(person: PersonProfile): Promise<string> {
  const running = personalBrandInFlight.get(person.id);
  if (running) return running;
  const job = (async () => {
    const brandsDs = await dataSource(env.clientsDbId);
    const names = Object.keys(brandsDs.schema);
    const titleName = names.find((n) => brandsDs.schema[n] === "title") ?? BRAND_PROPS.name;
    const typeName = resolveName(names, BRAND_PROPS.type);
    const properties: Record<string, unknown> = {
      [titleName]: { title: chunkText(`${person.name || "Personal"} – Personal`) },
    };
    if (brandsDs.schema[typeName] === "select") properties[typeName] = { select: { name: PERSONAL_BRAND_TYPE } };
    const page = await notion().pages.create({
      parent: { data_source_id: brandsDs.id },
      icon: { type: "emoji", emoji: "👤" },
      properties: properties as Parameters<Client["pages"]["create"]>[0]["properties"],
    });
    // Link it on the person's Brands relation (two-way, so the brand shows them under "People").
    const peopleDs = await dataSource(env.peopleDbId);
    const relName = brandColumn(peopleDs.schema, PERSON_PROPS.brands);
    await notion().pages.update({
      page_id: person.id,
      properties: {
        [relName]: { relation: [...person.brandIds, page.id].map((id) => ({ id })) },
      } as Parameters<Client["pages"]["update"]>[0]["properties"],
    });
    return page.id;
  })().finally(() => personalBrandInFlight.delete(person.id));
  personalBrandInFlight.set(person.id, job);
  return job;
}

export type LoginResult = { status: "ok"; person: PersonProfile } | { status: "wrong" } | { status: "locked" };

/**
 * Checks a PIN (or temporary code) for a People row. Timing-safe, server-only and brute-force
 * resistant: wrong attempts are counted on the person's row, so the limit holds across every
 * server. After LOCK_AFTER_FAILURES wrong attempts the account locks (15 min, doubling up to 24 h);
 * while locked, even the right PIN is refused. A correct attempt resets the count.
 * Used both for signing in and for confirming the current PIN on the Account page.
 */
async function attemptPin(page: PageObjectResponse, password: string): Promise<LoginResult> {
  const lockedUntil = getDate(page, PERSON_PROPS.lockedUntil);
  if (lockedUntil && Date.parse(lockedUntil) > Date.now()) return { status: "locked" };

  const stored = storedCredential(page);
  let matches = false;
  if (stored?.kind === "pin") matches = /^\d{6}$/.test(password) && (await verifyPinHash(password, stored.hash));
  else if (stored?.kind === "temporary") matches = safeEqual(stored.code, password);

  const failures = getNumber(page, PERSON_PROPS.failedLogins) ?? 0;
  if (matches && !isBlocked(page)) {
    if (failures || lockedUntil) await recordLoginAttempt(page, 0, null).catch((e) => console.error("Login reset failed:", e));
    return { status: "ok", person: toPerson(page, (await dataSource(env.peopleDbId)).schema) };
  }

  const next = failures + 1;
  let lock: string | null = null;
  if (next >= LOCK_AFTER_FAILURES) {
    const doublings = Math.floor((next - LOCK_AFTER_FAILURES) / LOCK_AFTER_FAILURES);
    const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** doublings, LOCK_MAX_MINUTES);
    lock = new Date(Date.now() + minutes * 60_000).toISOString();
  }
  await recordLoginAttempt(page, next, lock).catch((e) => console.error("Could not record failed login:", e));
  return { status: lock ? "locked" : "wrong" };
}

/** Sign-in: email + PIN (or the temporary code you gave them). */
export async function authenticatePerson(email: string, password: string): Promise<LoginResult> {
  const page = await findPersonByEmail(email);
  if (!page) {
    // Do the same amount of work as a real check, so response times don't reveal which emails exist.
    await verifyPinHash(password, "pin1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA").catch(() => false);
    return { status: "wrong" };
  }
  return attemptPin(page, password);
}

/** Confirms the signed-in person's current PIN (same lockout rules as signing in). */
export async function confirmCurrentPin(personId: string, password: string): Promise<LoginResult> {
  const page = await loadRowOf(env.peopleDbId, personId);
  return page ? attemptPin(page, password) : { status: "wrong" };
}

/** Opt-in tick box plus the date it was given (the record of consent); both cleared on opt-out. */
function marketingProps(schema: Schema, on: boolean): Record<string, unknown> {
  const names = Object.keys(schema);
  const props: Record<string, unknown> = {};
  const box = resolveName(names, PERSON_PROPS.marketing);
  if (schema[box] === "checkbox") props[box] = { checkbox: on };
  const date = resolveName(names, PERSON_PROPS.marketingDate);
  if (schema[date] === "date") props[date] = { date: on ? { start: new Date().toISOString() } : null };
  return props;
}

/** The client switching promotional emails on or off from their Account page. */
export async function setMarketingPreference(personId: string, on: boolean): Promise<boolean> {
  const page = await loadRowOf(env.peopleDbId, personId);
  if (!page) return false;
  const props = marketingProps((await dataSource(env.peopleDbId)).schema, on);
  if (!Object.keys(props).length) return false;
  await notion().pages.update({ page_id: page.id, properties: props as Parameters<Client["pages"]["update"]>[0]["properties"] });
  return true;
}

export type PresenceState = "online" | "away" | "offline";

/**
 * Activity status for your "Who's online" view. "Last seen" is refreshed while the dashboard is
 * open; the Online formula in Notion shows Offline once it's 3+ minutes old. Going offline (closing
 * the dashboard, or 30 minutes untouched) back-dates it so the status changes straight away.
 */
export async function recordPresence(personId: string, state: PresenceState): Promise<void> {
  const ds = await dataSource(env.peopleDbId);
  const names = Object.keys(ds.schema);
  const properties: Record<string, unknown> = {};
  const seen = resolveName(names, PERSON_PROPS.lastSeen);
  const at = state === "offline" ? Date.now() - 5 * 60_000 : Date.now();
  if (ds.schema[seen] === "date") properties[seen] = { date: { start: new Date(at).toISOString() } };
  const presence = resolveName(names, PERSON_PROPS.presence);
  if (ds.schema[presence] === "select" && state !== "offline") {
    properties[presence] = { select: { name: state === "away" ? "Away" : "Online" } };
  }
  if (!Object.keys(properties).length) return;
  await notion().pages.update({ page_id: personId, properties: properties as Parameters<Client["pages"]["update"]>[0]["properties"] });
}

export type LoginChange = { ok: true; person: PersonProfile } | { ok: false; error: string };

/**
 * Saves a new PIN (hashed) and/or email on the person's People row and returns their refreshed
 * profile (so the current device can stay signed in while every other session is signed out).
 */
export async function updateLoginDetails(
  personId: string,
  change: { pin?: string; email?: string; marketing?: boolean },
): Promise<LoginChange> {
  const page = await loadRowOf(env.peopleDbId, personId);
  if (!page) return { ok: false, error: "We couldn’t find your account." };
  const ds = await dataSource(env.peopleDbId);
  const names = Object.keys(ds.schema);
  const properties: Record<string, unknown> = {};

  if (change.email !== undefined) {
    const email = change.email.trim().toLowerCase();
    const owner = await findPersonByEmail(email);
    if (owner && normalizeNotionId(owner.id) !== normalizeNotionId(page.id)) {
      return { ok: false, error: "That email is already used by another account." };
    }
    const emailName = resolveName(names, PERSON_PROPS.email);
    if (ds.schema[emailName] === "email") properties[emailName] = { email };
    else if (ds.schema[emailName] === "rich_text") properties[emailName] = { rich_text: chunkText(email) };
    else return { ok: false, error: "Email can’t be changed right now." };
  }
  if (change.pin !== undefined) {
    const pinName = resolveName(names, PERSON_PROPS.appPassword);
    if (ds.schema[pinName] !== "rich_text") return { ok: false, error: "Your PIN can’t be changed right now." };
    properties[pinName] = { rich_text: chunkText(await hashPin(change.pin)) };
  }
  if (change.marketing !== undefined) Object.assign(properties, marketingProps(ds.schema, change.marketing));
  if (!Object.keys(properties).length) return { ok: false, error: "Nothing to change." };

  const updated = await notion().pages.update({
    page_id: page.id,
    properties: properties as Parameters<Client["pages"]["update"]>[0]["properties"],
  });
  if (!isFullPage(updated)) return { ok: false, error: "Something went wrong. Please try again." };
  return { ok: true, person: toPerson(updated, ds.schema) };
}

/** Loads a person by page ID, verifying it's a row in the People DB and not blocked. */
export async function getPerson(personId: string): Promise<PersonProfile | null> {
  const page = await loadRowOf(env.peopleDbId, personId);
  return page ? toPerson(page, (await dataSource(env.peopleDbId)).schema) : null;
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

/** Loads a brand by page ID, verifying it's a live row in the Brands database. */
export async function getBrand(brandId: string): Promise<Brand | null> {
  const page = await loadRowOf(env.clientsDbId, brandId);
  return page ? toBrand(page) : null;
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
  /** Script step ("" when the project didn't start with a script). */
  scriptStatus: string;
  script: string;
  scriptLink: string | null;
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
    scriptStatus: getText(page, TASK_PROPS.scriptStatus),
    script: getText(page, TASK_PROPS.script),
    scriptLink: getText(page, TASK_PROPS.scriptLink) || null,
  };
}

/**
 * Notion returns at most 25 pieces of a text property in query results (each run of
 * formatting is a piece), so a long or heavily formatted script is fetched in full here.
 */
async function fullText(page: PageObjectResponse, wanted: string): Promise<string | null> {
  const prop = findProp(page, wanted);
  if (prop?.type !== "rich_text" || prop.rich_text.length < 25) return null;
  const parts: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion().pages.properties.retrieve({ page_id: page.id, property_id: prop.id, start_cursor: cursor });
    if (!("results" in res)) break;
    for (const item of res.results) if (item.type === "rich_text") parts.push(item.rich_text.plain_text);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return parts.join("").trim();
}

async function withFullScript(page: PageObjectResponse, task: Task): Promise<Task> {
  const text = await fullText(page, TASK_PROPS.script).catch(() => null);
  return text === null ? task : { ...task, script: text };
}

export async function getTasks(brandIds: string[]): Promise<Task[]> {
  const ds = await dataSource(env.tasksDbId);
  const col = brandColumn(ds.schema, TASK_PROPS.client);
  const filter = belongsToAny(col, brandIds);
  if (!filter) return [];
  const dueDate = resolveName(Object.keys(ds.schema), TASK_PROPS.dueDate);
  const sorts: Sorts = ds.schema[dueDate] ? [{ property: dueDate, direction: "ascending" }] : undefined;
  const pages = await queryAll(ds, filter, sorts);
  return Promise.all(
    pages.map((page) => {
      const task = toTask(page, brandIds, col);
      // Only scripts the client can see right now need their full text.
      const kind = scriptKind(task.scriptStatus);
      return kind === "review" || kind === "approved" ? withFullScript(page, task) : task;
    }),
  );
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
  values: {
    status?: string;
    /** Select or Status columns, by name. */
    selects?: Record<string, string>;
    dates?: Record<string, string>;
    numbers?: Record<string, number>;
    urls?: Record<string, string>;
    texts?: Record<string, string>;
  },
) {
  const ds = await dataSource(env.tasksDbId);
  const names = Object.keys(ds.schema);
  const properties: Record<string, unknown> = {};
  if (values.status) {
    const name = resolveName(names, TASK_PROPS.status);
    if (ds.schema[name] === "status") properties[name] = { status: { name: values.status } };
    if (ds.schema[name] === "select") properties[name] = { select: { name: values.status } };
  }
  for (const [wanted, option] of Object.entries(values.selects ?? {})) {
    const name = resolveName(names, wanted);
    if (ds.schema[name] === "status") properties[name] = { status: { name: option } };
    if (ds.schema[name] === "select") properties[name] = { select: { name: option } };
  }
  for (const [wanted, text] of Object.entries(values.texts ?? {})) {
    const name = resolveName(names, wanted);
    if (ds.schema[name] === "rich_text") properties[name] = { rich_text: chunkText(text) };
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
  // Nothing to approve (or comment on) until there's a Final Video to watch.
  if (!getText(page, TASK_PROPS.finalVideo)) return { ok: false, error: "This video isn’t ready to watch yet." };
  try {
    await updateTask(page.id, { status: APPROVED_STATUS, dates: { [TASK_PROPS.approvedOn]: today() } });
  } catch (error) {
    return reviewError(error, APPROVED_STATUS);
  }
  // Add it to this period's invoice in Charges, after the client's response has been sent
  // (it never slows down, blocks or undoes the approval; the daily catch-up retries any failure).
  after(() => chargeApprovedVideo(page));
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
  // Nothing to approve (or comment on) until there's a Final Video to watch.
  if (!getText(page, TASK_PROPS.finalVideo)) return { ok: false, error: "This video isn’t ready to watch yet." };
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

/** Icons given to tasks created from the portal. */
const PROJECT_ICON = "🎬";
const SCRIPT_ICON = "✍️";

type Props = Record<string, unknown>;
type CreateProps = Parameters<Client["pages"]["create"]>[0]["properties"];
type Children = Parameters<Client["pages"]["create"]>[0]["children"];

/** The Tasks DB column names, resolved against the live schema. */
async function taskColumns() {
  const ds = await dataSource(env.tasksDbId);
  const names = Object.keys(ds.schema);
  const col = (wanted: string) => resolveName(names, wanted);
  return {
    ds,
    type: (name: string) => ds.schema[name],
    title: names.find((n) => ds.schema[n] === "title") ?? TASK_PROPS.title,
    status: col(TASK_PROPS.status),
    client: brandColumn(ds.schema, TASK_PROPS.client),
    requestedBy: col(TASK_PROPS.requestedBy),
    col,
  };
}

const optionValue = (type: string | undefined, name: string): unknown =>
  type === "status" ? { status: { name } } : type === "select" ? { select: { name } } : undefined;

/** Columns filled from a video brief: Brief Data, Video Link, Due date, Hooks, Format, Platform. */
function videoBriefProps(cols: Awaited<ReturnType<typeof taskColumns>>, brief: Brief): { essential: Props; optional: Props } {
  const { col, type } = cols;
  const essential: Props = {};
  const optional: Props = {};
  const briefName = col(TASK_PROPS.briefData);
  if (type(briefName) === "rich_text") essential[briefName] = { rich_text: chunkText(JSON.stringify(brief)) };
  const linkName = col(TASK_PROPS.videoLink);
  if (type(linkName) === "url") optional[linkName] = { url: brief.driveLinks[0] };
  else if (type(linkName) === "rich_text") optional[linkName] = { rich_text: chunkText(brief.driveLinks.join("\n")) };
  const dueName = col(TASK_PROPS.dueDate);
  if (type(dueName) === "date" && brief.deadline) optional[dueName] = { date: { start: brief.deadline } };
  const hooksName = col(TASK_PROPS.hooks);
  if (type(hooksName) === "number" && typeof brief.hookCount === "number") optional[hooksName] = { number: brief.hookCount };
  const visualCtasName = col(TASK_PROPS.visualCtas);
  if (type(visualCtasName) === "number") optional[visualCtasName] = { number: brief.visualCtas ?? 0 };
  // Footage is in: the 24-hour delivery clock starts now.
  const footageName = col(TASK_PROPS.footageSent);
  if (type(footageName) === "date") optional[footageName] = { date: { start: new Date().toISOString() } };
  // Multi-select option names can't contain commas, so "Other" is written plainly (details are in the brief).
  const options = (labels: string[]) => labels.map((name) => ({ name: name.replace(/,/g, " ").slice(0, 100) }));
  const formatName = col(TASK_PROPS.format);
  if (type(formatName) === "multi_select") optional[formatName] = { multi_select: options(labelsFor(brief.format, FORMAT_OPTIONS)) };
  const platformName = col(TASK_PROPS.platform);
  if (type(platformName) === "multi_select") {
    optional[platformName] = { multi_select: options(labelsFor(brief.platform, PLATFORM_OPTIONS)) };
  }
  const status = optionValue(type(cols.status), NEW_PROJECT_STATUS);
  if (status) optional[cols.status] = status;
  return { essential, optional };
}

/** Who asked for it — a link to their People row, or just their name. */
function requestedByProp(cols: Awaited<ReturnType<typeof taskColumns>>, actor: Actor): Props {
  if (cols.type(cols.requestedBy) === "relation") return { [cols.requestedBy]: { relation: [{ id: actor.id }] } };
  if (cols.type(cols.requestedBy) === "rich_text" && actor.name) {
    return { [cols.requestedBy]: { rich_text: chunkText(actor.name) } };
  }
  return {};
}

/**
 * Creates a task row. If Notion rejects an optional column (e.g. a missing Select option),
 * it retries with the essentials only, so a client's request is never lost.
 */
async function createTaskPage(
  cols: Awaited<ReturnType<typeof taskColumns>>,
  icon: string,
  essentials: Props,
  optional: Props,
  children: unknown[],
): Promise<ProjectResult> {
  const create = (props: Props) =>
    notion().pages.create({
      parent: { data_source_id: cols.ds.id },
      icon: { type: "emoji", emoji: icon as "🎬" },
      properties: props as CreateProps,
      children: children as Children,
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

/** Creates a Queued task for the client from a validated brief. */
export async function createProject(actor: Actor, brandId: string, brief: Brief): Promise<ProjectResult> {
  const cols = await taskColumns();
  const { essential, optional } = videoBriefProps(cols, brief);
  const essentials: Props = {
    [cols.title]: { title: chunkText(brief.projectName) },
    [cols.client]: { relation: [{ id: brandId }] },
    ...essential,
  };
  return createTaskPage(cols, PROJECT_ICON, essentials, { ...optional, ...requestedByProp(cols, actor) }, briefBlocks(brief));
}

/** The client's script request, written into the page body (their original stays here even after you edit Script). */
function scriptBlocks(request: ScriptRequest) {
  const heading = (text: string) => ({ object: "block", type: "heading_3", heading_3: { rich_text: chunkText(text) } });
  const paragraph = (rich_text: RichTextRequest[]) => ({ object: "block", type: "paragraph", paragraph: { rich_text } });
  const bullet = (text: string) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: chunkText(text) } });
  return [
    { object: "block", type: "heading_2", heading_2: { rich_text: chunkText("Script request") } },
    heading("Add"),
    ...scriptAdds(request).map(bullet),
    ...(request.notes ? [heading("Notes"), paragraph(chunkText(request.notes))] : []),
    heading("Client’s original script"),
    ...(request.link ? [paragraph(chunkText(request.link, request.link))] : []),
    ...(request.text ? [paragraph(chunkText(request.text))] : []),
    paragraph(chunkText("Edit the Script property (or the linked doc) into the final version, then set Script status to Ready for review.")),
  ];
}

/** Starts a project with the script step: Script status Queued, video Status "Script" until footage arrives. */
export async function createScriptProject(actor: Actor, brandId: string, request: ScriptRequest): Promise<ProjectResult> {
  const cols = await taskColumns();
  const scriptName = cols.col(TASK_PROPS.script);
  const linkName = cols.col(TASK_PROPS.scriptLink);
  const statusName = cols.col(TASK_PROPS.scriptStatus);
  const essentials: Props = {
    [cols.title]: { title: chunkText(request.projectName) },
    [cols.client]: { relation: [{ id: brandId }] },
  };
  const optional: Props = { ...requestedByProp(cols, actor) };
  // The video Status shows "Script" until footage arrives (then addFootage sets Queued).
  const stage = optionValue(cols.type(cols.status), SCRIPT_STAGE_STATUS);
  if (stage) optional[cols.status] = stage;
  const status = optionValue(cols.type(statusName), SCRIPT_STATUS.queued);
  if (status) essentials[statusName] = status;
  if (cols.type(scriptName) === "rich_text" && request.text) optional[scriptName] = { rich_text: chunkText(request.text) };
  const writtenHooksName = cols.col(TASK_PROPS.writtenHooks);
  if (cols.type(writtenHooksName) === "number") optional[writtenHooksName] = { number: request.hooks };
  const writtenCtasName = cols.col(TASK_PROPS.writtenCtas);
  if (cols.type(writtenCtasName) === "number") optional[writtenCtasName] = { number: request.ctas };
  if (cols.type(linkName) === "url" && request.link) optional[linkName] = { url: request.link };
  else if (cols.type(linkName) === "rich_text" && request.link) optional[linkName] = { rich_text: chunkText(request.link) };
  return createTaskPage(cols, SCRIPT_ICON, essentials, optional, scriptBlocks(request));
}

/** Client approves the script. Only allowed while it's Ready for review. */
export async function approveScript(actor: Actor, taskId: string): Promise<ReviewResult> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return { ok: false, error: "We couldn’t find that script." };
  if (scriptKind(getText(page, TASK_PROPS.scriptStatus)) !== "review") {
    return { ok: false, error: "This script isn’t waiting for review any more." };
  }
  try {
    // Approved script → it becomes a video project, waiting on the client's footage.
    await updateTask(page.id, {
      selects: { [TASK_PROPS.scriptStatus]: SCRIPT_STATUS.approved, [TASK_PROPS.status]: AWAITING_FOOTAGE_STATUS },
    });
  } catch (error) {
    return reviewError(error, SCRIPT_STATUS.approved);
  }
  await addComment(actor.name, "✅ Script approved — thank you!", page.id).catch(() => {});
  return { ok: true };
}

/** Client asks for script changes. The request is posted as a comment on the task page. */
export async function requestScriptChanges(actor: Actor, taskId: string, details: string): Promise<ReviewResult> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return { ok: false, error: "We couldn’t find that script." };
  if (scriptKind(getText(page, TASK_PROPS.scriptStatus)) !== "review") {
    return { ok: false, error: "This script isn’t waiting for review any more." };
  }
  try {
    await updateTask(page.id, { selects: { [TASK_PROPS.scriptStatus]: SCRIPT_STATUS.changes } });
  } catch (error) {
    return reviewError(error, SCRIPT_STATUS.changes);
  }
  await addComment(actor.name, `✏️ Script changes requested\n${details}`, page.id).catch((error) =>
    console.error("Script change comment failed:", error),
  );
  return { ok: true };
}

/**
 * Second half of a script-first project: the footage and video brief are added to the same
 * task, which then enters the production queue (Status Queued).
 */
export async function addFootage(actor: Actor, taskId: string, brief: Brief): Promise<ReviewResult> {
  const page = await getOwnedTaskPage(actor.brandIds, taskId);
  if (!page) return { ok: false, error: "We couldn’t find that project." };
  if (getText(page, TASK_PROPS.briefData)) return { ok: false, error: "Footage has already been sent for this project." };
  const cols = await taskColumns();
  const { essential, optional } = videoBriefProps(cols, brief);
  const update = (props: Props) =>
    notion().pages.update({ page_id: page.id, properties: props as Parameters<Client["pages"]["update"]>[0]["properties"] });
  try {
    await update({ ...essential, ...optional });
  } catch (error) {
    if (!isNotionClientError(error) || error.code !== APIErrorCode.ValidationError) return reviewError(error, NEW_PROJECT_STATUS);
    console.error("Notion rejected an optional column — saving the footage with essentials only.", error);
    try {
      await update(essential);
    } catch (retryError) {
      return reviewError(retryError, NEW_PROJECT_STATUS);
    }
  }
  await notion()
    .blocks.children.append({
      block_id: page.id,
      children: briefBlocks(brief) as Parameters<Client["blocks"]["children"]["append"]>[0]["children"],
    })
    .catch((error) => console.error("Could not add the brief to the page body:", error));
  await addComment(actor.name, "🎬 Footage sent — the brief is on this page.", page.id).catch(() => {});
  return { ok: true };
}

/** The script for one of this person's projects, for Copy / Download. */
export async function getScript(brandIds: string[], taskId: string): Promise<{ title: string; text: string; link: string | null } | null> {
  const page = await getOwnedTaskPage(brandIds, taskId);
  if (!page) return null;
  const task = await withFullScript(page, toTask(page));
  if (!scriptKind(task.scriptStatus)) return null;
  return { title: task.title, text: task.script, link: task.scriptLink };
}

export type Project = Task & { brief: Brief | null };

/** Loads one task for the client (only found if its Client relation is this client). */
export async function getProject(brandIds: string[], taskId: string): Promise<Project | null> {
  const page = await getOwnedTaskPage(brandIds, taskId);
  if (!page) return null;
  const briefJson = getText(page, TASK_PROPS.briefData);
  const task = await withFullScript(page, toTask(page));
  return { ...task, brief: briefJson ? parseBrief(briefJson) : null };
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
// Comments — Messages live on the person's People row; video feedback on the task page
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
/**
 * Comments on a page. Portal posts carry the poster's name. In someone's own Messages thread
 * (their People row) only they post through the portal, so every portal post there is theirs,
 * even if you've since renamed them (e.g. "Liam" → "Liam S"). On shared video threads the
 * name tells co-workers apart, so keep names unique within a brand.
 */
export async function getComments(pageId: string, viewerName: string, ownThread = false): Promise<PortalComment[]> {
  const [botId, comments] = await Promise.all([
    botUserId(),
    collectPaginatedAPI(notion().comments.list, { block_id: pageId }),
  ]);
  return comments
    .filter(isFullComment)
    .map((c) => {
      const viaPortal = c.created_by.id === botId && c.display_name?.type === "custom";
      const name = c.display_name?.resolved_name ?? "";
      const mine = viaPortal && (ownThread || !name || name.trim().toLowerCase() === viewerName.trim().toLowerCase());
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

// ---------------------------------------------------------------------------
// Charges — one row per approved video, grouped into invoices (see src/lib/billing.ts)
// ---------------------------------------------------------------------------

type BillingAccount = { id: string; name: string };

async function retrievePage(pageId: string): Promise<PageObjectResponse | null> {
  try {
    const page = await notion().pages.retrieve({ page_id: pageId });
    return isFullPage(page) && !page.in_trash ? page : null;
  } catch {
    return null;
  }
}

/** Who pays for a brand: the Billing account linked on its Brands row (null if none set yet). */
async function billingAccountForBrand(brandId: string): Promise<{ brandName: string; account: BillingAccount | null }> {
  const brand = await retrievePage(brandId);
  if (!brand) return { brandName: "", account: null };
  const brandName = getText(brand, BRAND_PROPS.name, true);
  const rel = resolveName(Object.keys(brand.properties), BRAND_PROPS.billingAccount);
  const [accountId] = relationIds(brand, rel);
  const page = accountId ? await retrievePage(accountId) : null;
  if (!page) return { brandName, account: null };
  return {
    brandName,
    account: {
      id: page.id,
      name: getText(page, BILLING_ACCOUNT_PROPS.name, true),
    },
  };
}

/** IDs of tasks that already have a charge (so a video is never charged twice). */
async function chargedTaskIds(): Promise<Set<string>> {
  const ds = await dataSource(env.chargesDbId);
  const taskCol = resolveName(Object.keys(ds.schema), CHARGE_PROPS.task);
  const pages = await queryAll(ds);
  return new Set(pages.flatMap((p) => relationIds(p, taskCol)).map(normalizeNotionId));
}

/**
 * Creates the charge row for one approved video. Safe to call more than once: if the video already
 * has a charge, nothing happens. Never throws into the approval flow — failures are logged and the
 * daily catch-up tries again.
 */
async function createChargeForTask(task: PageObjectResponse, approvedAt: Date, alreadyCharged?: Set<string>): Promise<boolean> {
  const id = normalizeNotionId(task.id);
  const charged = alreadyCharged ?? (await chargedTaskIds());
  if (charged.has(id)) return false;

  const tasksDs = await dataSource(env.tasksDbId);
  const brandCol = brandColumn(tasksDs.schema, TASK_PROPS.client);
  const [brandId] = relationIds(task, brandCol);
  const { brandName, account } = brandId ? await billingAccountForBrand(brandId) : { brandName: "", account: null };

  const charge = computeCharge({
    visualHooks: getNumber(task, TASK_PROPS.hooks),
    visualCtas: getNumber(task, TASK_PROPS.visualCtas),
    writtenHooks: getNumber(task, TASK_PROPS.writtenHooks),
    writtenCtas: getNumber(task, TASK_PROPS.writtenCtas),
    footageSent: getDate(task, TASK_PROPS.footageSent),
    deliveredOn: getDate(task, TASK_PROPS.deliveredOn),
  });


  const ds = await dataSource(env.chargesDbId);
  const names = Object.keys(ds.schema);
  const col = (wanted: string) => resolveName(names, wanted);
  const props: Record<string, unknown> = {};
  const set = (wanted: string, type: string, value: unknown) => {
    const name = col(wanted);
    if (ds.schema[name] === type) props[name] = value;
  };
  const titleName = names.find((n) => ds.schema[n] === "title") ?? CHARGE_PROPS.video;
  props[titleName] = { title: chunkText(getText(task, TASK_PROPS.title, true) || "Untitled video") };
  set(CHARGE_PROPS.invoice, "select", { select: { name: invoiceName(account?.name ?? null, billingMonth(approvedAt)) } });
  set(CHARGE_PROPS.brand, "rich_text", { rich_text: chunkText(brandName) });
  set(CHARGE_PROPS.breakdown, "rich_text", { rich_text: chunkText(charge.breakdown) });
  set(CHARGE_PROPS.total, "number", { number: charge.totalCents / 100 });
  set(CHARGE_PROPS.late, "checkbox", { checkbox: charge.late });
  const day = localDate(approvedAt);
  const approvedDay = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
  set(CHARGE_PROPS.approvedOn, "date", { date: { start: approvedDay } });
  if (account) set(CHARGE_PROPS.account, "relation", { relation: [{ id: account.id }] });
  set(CHARGE_PROPS.task, "relation", { relation: [{ id: task.id }] });
  set(CHARGE_PROPS.videoEdits, "number", { number: charge.videoEdits });
  set(CHARGE_PROPS.extraWrittenHooks, "number", { number: charge.extraWrittenHooks });
  set(CHARGE_PROPS.extraVisualHooks, "number", { number: charge.extraVisualHooks });
  set(CHARGE_PROPS.extraWrittenCtas, "number", { number: charge.extraWrittenCtas });
  set(CHARGE_PROPS.extraVisualCtas, "number", { number: charge.extraVisualCtas });

  await notion().pages.create({
    parent: { data_source_id: ds.id },
    icon: { type: "emoji", emoji: charge.late ? "🎁" : "🧾" },
    properties: props as Parameters<Client["pages"]["create"]>[0]["properties"],
  });
  charged.add(id);
  return true;
}

/** Called right after a client approves a video. */
async function chargeApprovedVideo(task: PageObjectResponse): Promise<void> {
  await createChargeForTask(task, new Date()).catch((error) => console.error("Could not create charge (the daily catch-up will retry):", error));
}

/**
 * Daily catch-up: charges any approved video (with a Final Video) that doesn't have a charge yet —
 * e.g. one you marked Approved in Notion yourself, or one where the first attempt failed.
 * Only approvals on or after BILLING_START_DATE are picked up, so nothing older is back-billed.
 */
export async function chargeUnbilledApprovals(): Promise<number> {
  const ds = await dataSource(env.tasksDbId);
  const charged = await chargedTaskIds();
  const pages = await queryAll(ds);
  let created = 0;
  for (const page of pages) {
    if (statusKind(getText(page, TASK_PROPS.status)) !== "done") continue;
    if (!getText(page, TASK_PROPS.finalVideo)) continue; // a video, not a script-only job
    const approved = getDate(page, TASK_PROPS.approvedOn) ?? page.last_edited_time.slice(0, 10);
    if (approved < BILLING_START_DATE) continue;
    // A date-only Approved on is taken as midday Melbourne time, so it lands on the right day.
    const at = new Date(approved.length === 10 ? `${approved}T02:00:00Z` : approved);
    try {
      if (await createChargeForTask(page, at, charged)) created++;
    } catch (error) {
      console.error(`Could not charge ${page.id}:`, error);
    }
  }
  return created;
}
