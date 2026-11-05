import { describe, expect, it } from 'vitest';
import { cleanFunnel } from '../src/worker/stats';

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
        { type: 'page', value: '/diagnostico/' },
        { type: 'page', value: '/diagnostico/agenda/' },
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
