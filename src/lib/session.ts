import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "pl_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Who the cookie says is signed in: a person (People DB) or a legacy client-row login. */
export type Principal = { kind: "person" | "client"; id: string };

/** The session holds only a Notion page ID — nothing else is trusted from the browser. */
export async function createSession(principal: Principal) {
  const claims = principal.kind === "person" ? { pid: principal.id } : { cid: principal.id };
  const token = await new SignJWT(claims)
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

export async function getPrincipal(): Promise<Principal | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { algorithms: ["HS256"] });
    if (typeof payload.pid === "string") return { kind: "person", id: payload.pid };
    if (typeof payload.cid === "string") return { kind: "client", id: payload.cid }; // sessions from before People
    return null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
