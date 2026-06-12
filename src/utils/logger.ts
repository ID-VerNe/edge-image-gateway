import { alertThrottled } from './notifications';
import { dbService } from '../services/database';

export const logger = {
  info: (event: string, data: Record<string, any>) => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...data }));
  },
  error: (event: string, data: Record<string, any>) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', event, ...data }));
  },
  warn: (event: string, data: Record<string, any>) => {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', event, ...data }));
  },
  metrics: (c: any, data: {
    repoId?: string;
    cacheStatus: 'HIT' | 'MISS' | 'BYPASS' | 'R2-HIT';
    statusCode: number;
    durationMs: number;
    hasResize: boolean;
    pathPrefix: string;
  }) => {
    const ae = c.env.ANALYTICS_ENGINE;
    if (ae) {
      ae.writeDataPoint({
        blobs: [
          data.pathPrefix,
          data.repoId || 'unknown',
          data.cacheStatus,
          data.hasResize ? 'true' : 'false'
        ],
        doubles: [
          data.statusCode,
          data.durationMs
        ],
        indexes: [data.repoId || 'unknown']
      });
    }
  },
  captureError: (c: any, err: any, context: Record<string, any> = {}) => {
    const dsn = c.env.SENTRY_DSN;
    if (!dsn) return;
    try {
      const url = new URL(dsn);
      const projectId = url.pathname.slice(1);
      const apiUrl = `https://${url.host}/api/${projectId}/store/`;
      const auth = `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=cf-worker-img-proxy/1.0`;
      
      const event = {
        event_id: crypto.randomUUID().replace(/-/g, ''),
        timestamp: Date.now() / 1000,
        platform: 'javascript',
        level: 'error',
        message: err.message || String(err),
        exception: { values: [{ type: err.name || 'Error', value: err.message || String(err), stacktrace: err.stack ? { frames: [] } : undefined }] },
        extra: context,
        tags: { repo_id: context.repoId, path: context.path, event_type: context.event }
      };

      c.executionCtx.waitUntil(fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': auth },
        body: JSON.stringify(event)
      }));
    } catch (e) {
      console.error('Sentry reporting failed:', e);
    }
  },
  recordAudit: async (c: any, action: string, data: Record<string, any>) => {
    const user = c.get('user') || { email: 'system' };
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const timestamp = Date.now();

    // Phase 3: D1 primary for audit logs
    if (c.env.DB) {
      try {
        await dbService.recordAudit(c.env.DB, action, user.email, ip, data);
      } catch (e) {
        console.error('Failed to record audit log to D1:', e);
      }
    }
  }
};
