import type { Context } from 'hono';
import type { AppEnv } from './env';
import { currencyDecimals } from './payments';
import { breakdown, makeCtx, overview, type BreakdownRow } from './stats';

/** Revenue is stored in minor units (cents); AI shouldn't have to divide. */
function toMajor(minor: number, decimals: number): number {
  return minor / 10 ** decimals;
}

function topRows(rows: BreakdownRow[], decimals: number, limit = 10) {
  return rows.slice(0, limit).map((r) => ({
    label: r.label ?? '(none)',
    visitors: r.visitors,
    revenue: toMajor(r.revenue, decimals),
    customers: r.customers,
    revenuePerVisitor: r.visitors ? toMajor(r.revenue, decimals) / r.visitors : 0,
  }));
}

/**
 * GET /api/v1/summary — a compact, AI-ready snapshot of a site for the given
 * range: KPIs (now vs previous period) plus top sources, channels and entry
 * pages ranked by revenue. Everything in major currency units.
 *
 * Composes the existing overview() + breakdown() functions; no new SQL.
 * Accepts the same range/filter query params as the dashboard (?range=30d, etc.).
 */
export async function handleSummaryApi(c: Context<AppEnv>) {
  const ctx = makeCtx(c);
  const site = ctx.site;
  const decimals = currencyDecimals(site.currency);

  const [ov, bySource, byChannel, byEntry] = await Promise.all([
    overview(ctx),
    breakdown(ctx, 'source', 50),
    breakdown(ctx, 'channel', 50),
    breakdown(ctx, 'entry_page', 50),
  ]);

  const flatKpis = (k: typeof ov.current) => ({
    ...k,
    revenue: toMajor(k.revenue, decimals),
    revenuePerVisitor: toMajor(k.revenuePerVisitor, decimals),
  });

  return c.json({
    site: { id: site.id, name: site.name, domain: site.domain },
    range: ov.range,
    currency: site.currency,
    kpis: {
      current: flatKpis(ov.current),
      previous: flatKpis(ov.previous),
      online: ov.online,
    },
    topSources: topRows(bySource, decimals),
    topChannels: topRows(byChannel, decimals),
    topEntryPages: topRows(byEntry, decimals),
  });
}
