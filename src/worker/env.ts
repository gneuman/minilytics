import type { Context, Next } from 'hono';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Dashboard login password (set with `wrangler secret put ADMIN_PASSWORD`). */
  ADMIN_PASSWORD: string;
  /** Random string used to sign the login cookie (`wrangler secret put SESSION_SECRET`). */
  SESSION_SECRET: string;
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  currency: string;
  api_key: string;
  dodo_webhook_secret: string | null;
  stripe_webhook_secret: string | null;
  created_at: number;
}

export type AppEnv = { Bindings: Env; Variables: { site: Site } };

const siteCache = new Map<string, { site: Site | null; at: number }>();

/** Sites change rarely; cache them per isolate so ingestion costs one fewer read per event. */
export async function getSite(db: D1Database, id: string): Promise<Site | null> {
  const hit = siteCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.site;
  const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first<Site>();
  siteCache.set(id, { site, at: Date.now() });
  return site;
}

export function forgetSite(id: string) {
  siteCache.delete(id);
}

/** Resolve the site from an `Authorization: Bearer <api_key>` header, or null. */
export async function siteFromApiKey(c: Context<AppEnv>): Promise<Site | null> {
  const key = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) return null;
  return c.env.DB.prepare('SELECT * FROM sites WHERE api_key = ?').bind(key).first<Site>();
}

/**
 * Middleware for the API-key endpoints (/api/v1/read/*, /summary, /events).
 * Loads the site from the Bearer key into `c.set('site')` — the same variable
 * `loadSite` uses — so `makeCtx(c)` and the stats functions work unchanged.
 */
export async function requireApiKey(c: Context<AppEnv>, next: Next) {
  const site = await siteFromApiKey(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);
  c.set('site', site);
  await next();
}
