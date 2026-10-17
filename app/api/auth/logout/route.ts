import { deleteCurrentSession, isSameOriginRequest } from "../../../auth";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  await deleteCurrentSession();
  return Response.redirect(new URL("/login", request.url), 303);
}
