import { eq } from "drizzle-orm";
import {
  createSession,
  hashPassword,
  isValidEmail,
  isValidPassword,
  isSameOriginRequest,
  normalizeEmail,
  safeReturnPath,
} from "../../../auth";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnPath(String(form.get("return_to") ?? "/"));

  if (!isValidEmail(email)) return back(request, returnTo, "Enter a valid email address.");
  if (!isValidPassword(password)) {
    return back(request, returnTo, "Password must be 10–128 characters.");
  }

  const [existing] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return back(request, returnTo, "An account with this email already exists.");

  const passwordData = await hashPassword(password);
  const userId = crypto.randomUUID();
  try {
    await getDb().insert(users).values({
      id: userId,
      email,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      passwordIterations: passwordData.iterations,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return back(request, returnTo, "Unable to create this account. Try signing in instead.");
  }

  await createSession(userId);
  return Response.redirect(new URL(returnTo, request.url), 303);
}

function back(request: Request, returnTo: string, error: string) {
  const url = new URL("/register", request.url);
  url.searchParams.set("return_to", returnTo);
  url.searchParams.set("error", error);
  return Response.redirect(url, 303);
}
