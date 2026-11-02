import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const isProd = process.env.NODE_ENV === "production";
/**
 * "__Host-" cookies must be Secure, sent only to this exact host and path "/", and can't be
 * set or overwritten by any other (sub)domain. HttpOnly keeps it out of reach of JavaScript.
 */
const COOKIE = isProd ? "__Host-pl_session" : "pl_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const ISSUER = "palliser-labs-portal";

/**
 * The session holds only the person's Notion page ID plus a fingerprint of their current login
 * details (never the PIN itself). Nothing else is trusted from the browser.
 */
export async function createSession(personId: string, credentialTag: string) {
  const token = await new SignJWT({ pid: personId, cv: credentialTag })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(env.sessionSecret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<{ personId: string; credentialTag: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { algorithms: ["HS256"], issuer: ISSUER });
    if (typeof payload.pid !== "string" || typeof payload.cv !== "string") return null;
    return { personId: payload.pid, credentialTag: payload.cv };
  } catch {
    return null;
  }
}

/** Constant-time comparison for session fingerprints. */
export function sameTag(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
