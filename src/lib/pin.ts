import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { env } from "./env";

/**
 * Client PINs. Clients choose their own 6-digit PIN, which is stored in Notion's "App Password"
 * column only as a salted scrypt hash ("pin1$…"). Nobody can read it back out, including you.
 * The hash is also keyed with a secret derived from SESSION_SECRET, so a copy of the Notion
 * database alone isn't enough to guess PINs offline. (Changing SESSION_SECRET therefore means
 * everyone needs a new temporary code.)
 *
 * A plain number in "App Password" (4–6 digits) is a temporary code that you set. Signing in
 * with it takes the client straight to "Choose your PIN".
 */

export { PIN_LENGTH, pinProblem } from "./pin-rules";
const PREFIX = "pin1";
const SCRYPT: ScryptOptions = { N: 16384, r: 8, p: 1 };

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, 32, SCRYPT, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

function pepper(): Buffer {
  return createHmac("sha256", env.sessionSecret).update("palliser-labs/pin-pepper/v1").digest();
}

export function isPinHash(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pin, Buffer.concat([salt, pepper()]));
  return `${PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [prefix, saltText, keyText] = stored.split("$");
  if (prefix !== PREFIX || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = await scrypt(pin, Buffer.concat([Buffer.from(saltText, "base64url"), pepper()]));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
