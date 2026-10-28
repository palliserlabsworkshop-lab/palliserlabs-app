"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateClient } from "@/lib/notion";
import { clearFailures, isLimited, recordFailure } from "@/lib/rate-limit";
import { createSession, destroySession } from "@/lib/session";

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
