import type { Context } from 'hono';
import type { AppEnv } from './env';
import { breakdown, makeCtx, overview, type Ctx } from './stats';

/**
 * Traffic that arrives from AI assistants (channel "AI": ChatGPT, Perplexity,
 * Gemini, Copilot, Claude...), now vs the previous window of the same length.
 * Built to answer one question every month: is AI traffic going up? (GRO-994)
 *
 * Every number comes with its denominator: AI visitors out of all visitors,
 * and the previous period next to the current one. Composes overview() and
 * breakdown(); no new SQL.
 */
export interface AiReport {
  current: { visitors: number; sessions: number; pageviews: number };
  previous: { visitors: number; sessions: number; pageviews: number };
  /** Change in AI visitors, as a fraction. null when the previous period had 0 (no base to compare). */
  change: number | null;
  /** AI visitors out of all the site's visitors, in each period. */
  share: { current: { ai: number; of: number }; previous: { ai: number; of: number } };
  sources: { label: string; visitors: number; previousVisitors: number }[];
  entryPages: { label: string; visitors: number }[];
  series: { bucket: number | string; visitors: number }[];
}

export function aiChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

export async function aiReport(ctx: Ctx): Promise<AiReport> {
  const aiCtx: Ctx = { ...ctx, filters: { ...ctx.filters, channel: 'AI' } };
  const prevCtx: Ctx = {
    ...aiCtx,
    range: { ...ctx.range, from: ctx.range.from - (ctx.range.to - ctx.range.from), to: ctx.range.from },
  };

  const [all, ai, bySource, bySourcePrev, byEntry] = await Promise.all([
    overview(ctx),
    overview(aiCtx),
    breakdown(aiCtx, 'source', 50),
    breakdown(prevCtx, 'source', 50),
    breakdown(aiCtx, 'entry_page', 20),
  ]);

  const pick = (k: typeof ai.current) => ({ visitors: k.visitors, sessions: k.sessions, pageviews: k.pageviews });
  const prevBy = new Map(bySourcePrev.map((r) => [r.label ?? '(none)', r.visitors]));
  const labels = new Set([...bySource.map((r) => r.label ?? '(none)'), ...prevBy.keys()]);
  const curBy = new Map(bySource.map((r) => [r.label ?? '(none)', r.visitors]));

  return {
    current: pick(ai.current),
    previous: pick(ai.previous),
    change: aiChange(ai.current.visitors, ai.previous.visitors),
    share: {
      current: { ai: ai.current.visitors, of: all.current.visitors },
      previous: { ai: ai.previous.visitors, of: all.previous.visitors },
    },
    sources: [...labels]
      .map((label) => ({ label, visitors: curBy.get(label) ?? 0, previousVisitors: prevBy.get(label) ?? 0 }))
      .sort((a, b) => b.visitors - a.visitors || b.previousVisitors - a.previousVisitors),
    entryPages: byEntry.map((r) => ({ label: r.label ?? '(none)', visitors: r.visitors })),
    series: ai.series.map((s) => ({ bucket: s.bucket, visitors: s.visitors })),
  };
}

/** GET /api/v1/read/ai — AI-assistant traffic for the site, same range params as the rest of the API. */
export async function handleAiApi(c: Context<AppEnv>) {
  const ctx = makeCtx(c);
  const site = ctx.site;
  return c.json({
    site: { id: site.id, name: site.name, domain: site.domain },
    range: ctx.range,
    ...(await aiReport(ctx)),
  });
}
