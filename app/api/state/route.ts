import { eq } from "drizzle-orm";
import { getCurrentUser } from "../../auth";
import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Sign in is required." }, { status: 401 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const [record] = await getDb().select({ dataJson: userStates.dataJson, updatedAt: userStates.updatedAt }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  if (!record) return Response.json({ exists: false, state: null });
  try {
    return Response.json({ exists: true, state: JSON.parse(record.dataJson), updatedAt: record.updatedAt });
  } catch {
    return Response.json({ error: "Saved tracker data is invalid." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
  const state = body?.state;
  if (!state || typeof state !== "object" || !Array.isArray((state as { semesters?: unknown }).semesters)) return Response.json({ error: "Invalid tracker data." }, { status: 400 });
  const dataJson = JSON.stringify(state);
  if (dataJson.length > 1_500_000) return Response.json({ error: "Tracker data is too large." }, { status: 413 });
  const now = new Date().toISOString();
  await getDb().insert(userStates).values({ userId: user.userId, email: user.email, dataJson, updatedAt: now }).onConflictDoUpdate({ target: userStates.userId, set: { email: user.email, dataJson, updatedAt: now } });
  return Response.json({ ok: true, updatedAt: now });
}
