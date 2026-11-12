import { describe, expect, it } from 'vitest';
import { cleanFunnel, funnel } from '../src/worker/stats';

describe('cleanFunnel (shared by create and edit)', () => {
  it('keeps a changed step type', () => {
    const f = cleanFunnel({
      name: ' Diagnostico ',
      steps: [
        { type: 'page', value: '/diagnostico/' },
        { type: 'page', value: ' /diagnostico/agenda/ ' },
      ],
    });
    expect(f).toEqual({
      name: 'Diagnostico',
      steps: [
        { type: 'page', value: '/diagnostico' },
        { type: 'page', value: '/diagnostico/agenda' },
      ],
    });
  });
  it('rejects a funnel without a name or with fewer than 2 valid steps', () => {
    expect(cleanFunnel({ name: '', steps: [{ type: 'page', value: '/' }, { type: 'page', value: '/a' }] })).toBeNull();
    expect(cleanFunnel({ name: 'x', steps: [{ type: 'page', value: '/' }, { type: 'nope', value: '/a' }] })).toBeNull();
    expect(cleanFunnel({ name: 'x', steps: 'bad' })).toBeNull();
    expect(cleanFunnel({})).toBeNull();
  });
});

describe('page steps use the same path rule as collected pageviews (INT-1912)', () => {
  it('cleanFunnel drops the trailing slash of a page step, like normalizePath', () => {
    const f = cleanFunnel({
      name: 'Diagnostico',
      steps: [
        { type: 'page', value: '/diagnostico/' },
        { type: 'page', value: '/' },
        { type: 'goal', value: 'signup/' },
      ],
    });
    expect(f?.steps).toEqual([
      { type: 'page', value: '/diagnostico' },
      { type: 'page', value: '/' },
      { type: 'goal', value: 'signup/' },
    ]);
  });

  it('a saved step /x/ counts visits to /x when the funnel is read', async () => {
    const rows = [
      { v: 'a', ts: 1, type: 'pageview', name: null, path: '/x' },
      { v: 'a', ts: 2, type: 'pageview', name: null, path: '/x/agenda' },
    ];
    const binds: unknown[][] = [];
    const db = {
      prepare: () => ({
        bind: (...p: unknown[]) => {
          binds.push(p);
          return { all: async () => ({ results: rows }) };
        },
      }),
    };
    const ctx = {
      db,
      site: { id: 1 },
      range: { from: 0, to: 10 },
      filters: {},
    } as unknown as Parameters<typeof funnel>[0];
    const out = await funnel(ctx, [
      { type: 'page', value: '/x/' },
      { type: 'page', value: '/x/agenda/' },
    ]);
    expect(out.map((s: { visitors: number }) => s.visitors)).toEqual([1, 1]);
    expect(binds[0]).toContain('/x');
  });
});
