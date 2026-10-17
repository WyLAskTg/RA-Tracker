import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Add the database to wrangler.jsonc before starting the application."
    );
  }

  return drizzle(env.DB, { schema });
}
