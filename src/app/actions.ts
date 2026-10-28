"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { approveVideo, authenticateClient, createProject, getClient, requestTweaks } from "@/lib/notion";
import { TWEAK_AREAS } from "@/lib/review";
import { isoDateFromToday, validateBrief, type BriefErrors } from "@/lib/brief";
import { clearFailures, isLimited, recordFailure } from "@/lib/rate-limit";
import { createSession, destroySession, getSessionClientId } from "@/lib/session";

export type LoginState = { error?: string; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", email };
  if (!/^\d{4}$/.test(password)) return { error: "Your App Password is 4 digits.", email };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const keys = [`email:${email.toLowerCase()}`, ...(ip ? [`ip:${ip}`] : [])];
  if (keys.some(isLimited)) {
    return { error: "Too many attempts. Please wait 15 minutes and try again.", email };
  }

  let clientId: string;
  try {
    const client = await authenticateClient(email, password);
    if (!client) {
      keys.forEach(recordFailure);
      return { error: "That email and App Password don’t match our records.", email };
    }
    clientId = client.id;
  } catch (error) {
    console.error("Login failed:", error);
    return { error: "We couldn’t reach the server. Please try again shortly.", email };
  }

  keys.forEach(clearFailures);
  await createSession(clientId);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export type ProjectState = { ok?: boolean; errors?: BriefErrors; formError?: string };

/** Creates a Queued task in Notion from the intake form. The client comes from the session, never the form. */
export async function submitProject(input: Record<string, unknown>): Promise<ProjectState> {
  const clientId = await getSessionClientId();
  const client = clientId ? await getClient(clientId) : null;
  if (!client) redirect("/login");

  // Allow "today" on the server so clients ahead of UTC can still pick their local tomorrow.
  const { brief, errors } = validateBrief(input, isoDateFromToday(0));
  if (Object.keys(errors).length) return { errors };

  try {
    await createProject(client, brief);
  } catch (error) {
    console.error("Failed to create project:", error);
    return { formError: "We couldn’t send your project. Please try again in a moment." };
  }
  return { ok: true };
}

export type ReviewState = { ok?: boolean; error?: string };

/** Client approves a video that's Ready for review. Ownership and state are checked in the Notion layer. */
export async function approveVideoAction(taskId: string): Promise<ReviewState> {
  const clientId = await getSessionClientId();
  const client = clientId ? await getClient(clientId) : null;
  if (!client) redirect("/login");
  return approveVideo(client, taskId);
}

/** Client asks for changes on a video that's Ready for review. */
export async function requestTweaksAction(
  taskId: string,
  input: { areas?: unknown; details?: unknown; timestamp?: unknown },
): Promise<ReviewState> {
  const clientId = await getSessionClientId();
  const client = clientId ? await getClient(clientId) : null;
  if (!client) redirect("/login");

  const areas = Array.isArray(input.areas)
    ? input.areas.filter((a): a is string => typeof a === "string" && TWEAK_AREAS.includes(a)).slice(0, TWEAK_AREAS.length)
    : [];
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 1500) : "";
  const timestamp = typeof input.timestamp === "string" ? input.timestamp.trim().slice(0, 40) : "";
  if (!details) return { error: "Tell us what you’d like changed." };
  return requestTweaks(client, taskId, { areas, details, timestamp });
}
