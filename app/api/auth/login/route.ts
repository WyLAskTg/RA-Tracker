import { eq } from "drizzle-orm";
import {
  createSession,
  isSameOriginRequest,
  normalizeEmail,
  safeReturnPath,
  verifyPassword,
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

  const [user] = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      passwordSalt: users.passwordSalt,
      passwordIterations: users.passwordIterations,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const valid =
    user &&
    (await verifyPassword(
      password,
      user.passwordHash,
      user.passwordSalt,
      user.passwordIterations,
    ));
  if (!valid) return back(request, returnTo);

  await createSession(user.id);
  return Response.redirect(new URL(returnTo, request.url), 303);
}

function back(request: Request, returnTo: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("return_to", returnTo);
  url.searchParams.set("error", "Email or password is incorrect.");
  return Response.redirect(url, 303);
}
