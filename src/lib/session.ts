import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "pl_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** The session holds only the client's Notion page ID — nothing else is trusted from the browser. */
export async function createSession(clientId: string) {
  const token = await new SignJWT({ cid: clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(env.sessionSecret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSessionClientId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { algorithms: ["HS256"] });
    return typeof payload.cid === "string" ? payload.cid : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
