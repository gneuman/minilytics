import type { Context } from 'hono';
import { siteFromApiKey, type AppEnv } from './env';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A visitor id we never want to confuse with a real browser visitor. */
function syntheticVisitor(name: string, platform: string | null): string {
  return `ext:${(platform ?? name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48)}`;
}

/**
 * Generic event ingestion, for enriching the data with external metrics
 * (e.g. LinkedIn post impressions) alongside the site's own traffic.
 *
 * POST /api/v1/events   Authorization: Bearer <site api key>
 * {
 *   "name": "linkedin_impressions",   // required: what happened
 *   "type": "external",               // optional, default "external" (never pageview/goal/outbound)
 *   "value": 1234,                    // optional number, stored in props.value
 *   "path": "/post/abc",              // optional
 *   "visitor_id": "<ml_vid>",         // optional: a real visitor; omit for aggregate platform metrics
 *   "timestamp": "2026-10-27T...",    // optional ISO string, default now
 *   "props": { "platform": "linkedin", ... }  // optional extra, merged with value
 * }
 *
 * When no visitor_id is given, the event is attached to a synthetic visitor
 * `ext:<platform-or-name>` (and a matching synthetic session), so aggregate
 * platform metrics are groupable and the NOT NULL schema stays intact.
 */
export async function handleEventApi(c: Context<AppEnv>) {
  const site = await siteFromApiKey(c);
  if (!site) return c.json({ error: 'invalid api key' }, 401);

  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  const name = str(b?.name)?.slice(0, 64);
  if (!name) return c.json({ error: 'name (string) is required' }, 400);

  // type defaults to "external"; block the reserved tracker types so external
  // data can't masquerade as real pageviews/goals/outbound clicks.
  let type = str(b?.type)?.slice(0, 32) ?? 'external';
  if (['pageview', 'goal', 'outbound'].includes(type)) type = 'external';

  const ts = typeof b?.timestamp === 'string' ? Date.parse(b.timestamp) || Date.now() : Date.now();
  const path = str(b?.path)?.slice(0, 500) ?? null;

  const platform = str((b?.props as Record<string, unknown> | undefined)?.platform);
  const props: Record<string, unknown> = { ...(typeof b?.props === 'object' && b?.props ? (b.props as object) : {}) };
  if (typeof b?.value === 'number') props.value = b.value;
  const propsJson = Object.keys(props).length ? JSON.stringify(props).slice(0, 1000) : null;

  const real = str(b?.visitor_id);
  const visitorId = real ?? syntheticVisitor(name, platform);

  if (real) {
    // A real visitor: attach to their latest session, like a server-side goal.
    const s = await c.env.DB.prepare(
      'SELECT id FROM sessions WHERE site_id = ? AND visitor_id = ? ORDER BY started_at DESC LIMIT 1',
    )
      .bind(site.id, real)
      .first<{ id: string }>();
    if (!s) return c.json({ error: 'visitor not found' }, 404);
    await c.env.DB.prepare(
      'INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(site.id, s.id, real, ts, type, name, path, propsJson)
      .run();
    return c.json({ ok: true, visitor_id: real });
  }

  // Aggregate platform metric: ensure a synthetic visitor + session exist, then log the event.
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO visitors (site_id, id, first_seen) VALUES (?, ?, ?)').bind(site.id, visitorId, ts),
    c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO sessions (site_id, id, visitor_id, started_at, last_seen_at, source, channel)
         VALUES (?, ?, ?, ?, ?, 'external', 'External')`,
      )
      .bind(site.id, visitorId, visitorId, ts, ts),
    c.env.DB
      .prepare('INSERT INTO events (site_id, session_id, visitor_id, ts, type, name, path, props) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(site.id, visitorId, visitorId, ts, type, name, path, propsJson),
  ]);
  return c.json({ ok: true, visitor_id: visitorId, synthetic: true });
}
