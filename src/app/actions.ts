"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  addFootage,
  approveScript,
  approveVideo,
  authenticatePerson,
  createProject,
  createScriptProject,
  requestScriptChanges,
  requestTweaks,
} from "@/lib/notion";
import { validateScriptRequest, type ScriptErrors } from "@/lib/script";
import { confirmCurrentPin, updateLoginDetails } from "@/lib/notion";
import { pinProblem } from "@/lib/pin-rules";
import { getViewerForSetup } from "@/lib/viewer";
import { canUseBrand } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { TWEAK_AREAS } from "@/lib/review";
import { isoDateFromToday, validateBrief, type BriefErrors } from "@/lib/brief";
import { clearFailures, isLimited, recordFailure } from "@/lib/rate-limit";
import { createSession, destroySession } from "@/lib/session";

export type LoginState = { error?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCKED_MESSAGE = "Too many attempts. For your security, sign-in is paused for a while — try again later or message us.";

/** A short, slightly random pause after a failed sign-in, so guessing is slow and timing reveals nothing. */
const slowDown = () => new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const password = String(formData.get("password") ?? "").trim().slice(0, 8);

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email };
  if (!/^\d{4,6}$/.test(password)) return { error: "Enter your 6-digit PIN (or the code we gave you).", email };

  const h = await headers();
  // Vercel sets x-real-ip to the visitor's address (it can't be spoofed through Vercel's edge).
  const ip = (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0])?.trim().slice(0, 64);
  const keys = [`email:${email.toLowerCase()}`, ...(ip ? [`ip:${ip}`] : [])];
  if (keys.some(isLimited)) {
    await slowDown();
    return { error: LOCKED_MESSAGE, email };
  }

  let person: { id: string; credentialTag: string; needsSetup: boolean };
  try {
    const result = await authenticatePerson(email, password);
    if (result.status !== "ok") {
      keys.forEach(recordFailure);
      await slowDown();
      // The same wording whether or not the email exists, so it can't be used to find accounts.
      return result.status === "locked"
        ? { error: LOCKED_MESSAGE, email }
        : { error: "That email and App Password don’t match our records.", email };
    }
    person = result.person;
  } catch (error) {
    console.error("Login failed:", error);
    return { error: "We couldn’t reach the server. Please try again shortly.", email };
  }

  keys.forEach(clearFailures);
  await createSession(person.id, person.credentialTag);
  // Signed in with a temporary code → choose their own PIN first.
  redirect(person.needsSetup ? "/welcome" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export type ProjectState = { ok?: boolean; errors?: BriefErrors; formError?: string };

/**
 * Creates a Queued task in Notion from the intake form. Who's asking comes from the session;
 * the chosen brand must be one of theirs (a forged brand ID is rejected).
 */
export async function submitProject(input: Record<string, unknown>): Promise<ProjectState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const brandId = typeof input.brandId === "string" && input.brandId ? input.brandId : viewer.brandIds[0];
  if (!canUseBrand(viewer.brandIds, brandId)) {
    return { formError: "Please choose which brand this project is for." };
  }

  // Allow "today" on the server so clients ahead of UTC can still pick their local tomorrow.
  const { brief, errors } = validateBrief(input, isoDateFromToday(0));
  if (Object.keys(errors).length) return { errors };

  try {
    await createProject(viewer, brandId, brief);
  } catch (error) {
    console.error("Failed to create project:", error);
    return { formError: "We couldn’t send your project. Please try again in a moment." };
  }
  return { ok: true };
}

export type ReviewState = { ok?: boolean; error?: string };

/** Client approves a video that's Ready for review. Ownership and state are checked in the Notion layer. */
export async function approveVideoAction(taskId: string): Promise<ReviewState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return approveVideo(viewer, taskId);
}

/** Client asks for changes on a video that's Ready for review. */
export async function requestTweaksAction(
  taskId: string,
  input: { areas?: unknown; details?: unknown; timestamp?: unknown },
): Promise<ReviewState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const areas = Array.isArray(input.areas)
    ? input.areas.filter((a): a is string => typeof a === "string" && TWEAK_AREAS.includes(a)).slice(0, TWEAK_AREAS.length)
    : [];
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 1500) : "";
  const timestamp = typeof input.timestamp === "string" ? input.timestamp.trim().slice(0, 40) : "";
  if (!details) return { error: "Tell us what you’d like changed." };
  return requestTweaks(viewer, taskId, { areas, details, timestamp });
}

export type ScriptState = { ok?: boolean; errors?: ScriptErrors; formError?: string };

/** Starts a project with the script step. Same brand check as submitProject. */
export async function submitScript(input: Record<string, unknown>): Promise<ScriptState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const brandId = typeof input.brandId === "string" && input.brandId ? input.brandId : viewer.brandIds[0];
  if (!canUseBrand(viewer.brandIds, brandId)) {
    return { formError: "Please choose which brand this project is for." };
  }
  const { request, errors } = validateScriptRequest(input);
  if (Object.keys(errors).length) return { errors };
  try {
    await createScriptProject(viewer, brandId, request);
  } catch (error) {
    console.error("Failed to create script project:", error);
    return { formError: "We couldn’t send your script. Please try again in a moment." };
  }
  return { ok: true };
}

export async function approveScriptAction(taskId: string): Promise<ReviewState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return approveScript(viewer, taskId);
}

export async function requestScriptChangesAction(taskId: string, details: unknown): Promise<ReviewState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const text = typeof details === "string" ? details.trim().slice(0, 1500) : "";
  if (!text) return { error: "Tell us what you’d like changed." };
  return requestScriptChanges(viewer, taskId, text);
}

/** Adds footage + the video brief to a project that started with a script. Ownership is checked in the Notion layer. */
export async function addFootageAction(taskId: string, input: Record<string, unknown>): Promise<ProjectState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { brief, errors } = validateBrief(input, isoDateFromToday(0));
  if (Object.keys(errors).length) return { errors };
  const result = await addFootage(viewer, taskId, brief);
  return result.ok ? { ok: true } : { formError: result.error };
}

// ---------------------------------------------------------------------------
// Account: choosing a PIN (first sign-in) and changing PIN or email later
// ---------------------------------------------------------------------------

export type AccountState = { ok?: boolean; error?: string; field?: "current" | "pin" | "confirm" | "email" | "emailConfirm" };

const field = (formData: FormData, name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max);

/** First sign-in with a temporary code: choose a 6-digit PIN (and confirm or correct their email). */
export async function setupAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewerForSetup();
  if (!viewer) redirect("/login");
  if (!viewer.needsSetup) redirect("/dashboard");

  const pin = field(formData, "pin", 6);
  const confirm = field(formData, "confirm", 6);
  const email = field(formData, "email", 254).toLowerCase();
  const problem = pinProblem(pin);
  if (problem) return { error: problem, field: "pin" };
  if (pin !== confirm) return { error: "The two PINs don’t match.", field: "confirm" };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", field: "email" };

  const result = await updateLoginDetails(viewer.id, {
    pin,
    ...(email !== viewer.email.toLowerCase() ? { email } : {}),
  }).catch((error) => {
    console.error("Account setup failed:", error);
    return { ok: false as const, error: "We couldn’t save that just now. Please try again." };
  });
  if (!result.ok) return { error: result.error, field: "email" };
  // New login details → new session for this device (any other sessions are now signed out).
  await createSession(result.person.id, result.person.credentialTag);
  redirect("/dashboard");
}

/** Shared check for Account changes: the current PIN, with the same lockout as signing in. */
async function checkCurrentPin(personId: string, current: string): Promise<AccountState | null> {
  if (!/^\d{6}$/.test(current)) return { error: "Enter your current 6-digit PIN.", field: "current" };
  const check = await confirmCurrentPin(personId, current);
  if (check.status === "ok") return null;
  await slowDown();
  return { error: check.status === "locked" ? LOCKED_MESSAGE : "That isn’t your current PIN.", field: "current" };
}

export async function changePin(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const failed = await checkCurrentPin(viewer.id, field(formData, "current", 6));
  if (failed) return failed;
  const pin = field(formData, "pin", 6);
  const problem = pinProblem(pin);
  if (problem) return { error: problem, field: "pin" };
  if (pin !== field(formData, "confirm", 6)) return { error: "The two PINs don’t match.", field: "confirm" };
  const result = await updateLoginDetails(viewer.id, { pin }).catch(() => null);
  if (!result?.ok) return { error: result?.error ?? "We couldn’t save that just now. Please try again." };
  await createSession(result.person.id, result.person.credentialTag);
  return { ok: true };
}

export async function changeEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const failed = await checkCurrentPin(viewer.id, field(formData, "current", 6));
  if (failed) return failed;
  const email = field(formData, "email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", field: "email" };
  if (email !== field(formData, "emailConfirm", 254).toLowerCase()) {
    return { error: "The two emails don’t match.", field: "emailConfirm" };
  }
  if (email === viewer.email.toLowerCase()) return { error: "That’s already your email.", field: "email" };
  const result = await updateLoginDetails(viewer.id, { email }).catch(() => null);
  if (!result?.ok) return { error: result?.error ?? "We couldn’t save that just now. Please try again.", field: "email" };
  await createSession(result.person.id, result.person.credentialTag);
  return { ok: true };
}
