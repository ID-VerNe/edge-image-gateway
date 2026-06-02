// @ts-ignore
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Edge Image Gateway Worker', () => {
  it('responds with ok on /healthz', async () => {
    const request = new Request('http://localhost/healthz');
    const ctx = createExecutionContext();
    
    // We pass empty environment since healthz doesn't need it
    const response = await app.fetch(request, {} as any, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBe('1.0.0');
    expect(body).toHaveProperty('env_configured');
  });
});
