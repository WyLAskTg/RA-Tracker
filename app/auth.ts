import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";

const SESSION_COOKIE = "ra_tracker_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 365;
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();

export type AuthUser = {
  userId: string;
  displayName: string;
  email: string;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPassword(value: string): boolean {
  return value.length >= 10 && value.length <= 128;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function hashPassword(
  password: string,
  salt = randomBytes(16),
  iterations = PASSWORD_ITERATIONS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt.buffer.slice(
        salt.byteOffset,
        salt.byteOffset + salt.byteLength,
      ) as ArrayBuffer,
      iterations,
    },
    key,
    256,
  );
  return {
    hash: toBase64Url(new Uint8Array(bits)),
    salt: toBase64Url(salt),
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const result = await hashPassword(password, fromBase64Url(salt), iterations);
  return timingSafeEqual(result.hash, expectedHash);
}

export async function createSession(userId: string): Promise<void> {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000,
  ).toISOString();

  await getDb().insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function deleteCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [record] = await getDb()
    .select({ userId: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, await sha256(token)),
        gt(sessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!record) return null;
  return {
    userId: record.userId,
    email: record.email,
    displayName: record.email,
  };
}

export async function requireUser(returnTo: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/";
    if (["/login", "/register"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }
  return result === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
