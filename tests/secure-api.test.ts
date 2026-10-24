import { describe, expect, it, vi } from 'vitest';
import { secureApi } from '../lib/secure-api';

vi.mock('../lib/api-token', () => ({ getApiToken: () => 'a'.repeat(64) }));

describe('route-level protection without the proxy', () => {
  it('rejects missing and incorrect secrets before running the handler', async () => {
    const business = vi.fn(() => Response.json({ ok: true }));
    const endpoint = secureApi(business);
    for (const token of ['', 'b'.repeat(64)]) {
      const response = await endpoint(new Request('http://localhost:3000/api/export', { headers: { host: 'localhost:3000', 'x-insights-token': token } }));
      expect(response.status).toBe(403);
    }
    expect(business).not.toHaveBeenCalled();
  });
  it('serves authenticated requests without changing the handler response', async () => {
    const endpoint = secureApi(() => Response.json({ ok: true }));
    const response = await endpoint(new Request('http://localhost:3000/api/export', { headers: { host: 'localhost:3000', 'x-insights-token': 'a'.repeat(64) } }));
    expect(await response.json()).toEqual({ ok: true });
  });
});
