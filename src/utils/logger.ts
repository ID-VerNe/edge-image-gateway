import { alertThrottled } from './notifications';

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
    cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
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

    // Real-time Anomaly Detection (4xx Ratio)
    if (c.env.REPO_REGISTRY) {
      const minute = Math.floor(Date.now() / 60000);
      const totalKey = `stats::total::\${minute}`;
      const err4xxKey = `stats::4xx::\${minute}`;
      
      c.executionCtx.waitUntil((async () => {
        try {
          // Increment counters (Best effort, non-atomic KV is fine for trend detection)
          const [tStr, eStr] = await Promise.all([
            c.env.REPO_REGISTRY.get(totalKey),
            c.env.REPO_REGISTRY.get(err4xxKey)
          ]);
          
          const total = (parseInt(tStr || '0', 10)) + 1;
          let err4xx = parseInt(eStr || '0', 10);
          if (data.statusCode >= 400 && data.statusCode < 500) err4xx++;
          
          await Promise.all([
            c.env.REPO_REGISTRY.put(totalKey, total.toString(), { expirationTtl: 300 }),
            c.env.REPO_REGISTRY.put(err4xxKey, err4xx.toString(), { expirationTtl: 300 })
          ]);

          // Alert if ratio > 30% and volume is significant (> 10 reqs)
          if (total > 10 && (err4xx / total) > 0.3) {
            await alertThrottled('anomaly_4xx', 
              `🕵️ <b>Traffic Anomaly Detected</b>\nHigh 4xx error rate: <b>\${Math.round((err4xx/total)*100)}%</b>\nMinute: \${minute}\nTotal: \${total} | 4xx: \${err4xx}\nPossible scraping or broken links.`,
              c.env, 1, c.executionCtx
            );
          }
        } catch {}
      })());
    }
  },
  captureError: (c: any, err: any, context: Record<string, any> = {}) => {
    const dsn = c.env.SENTRY_DSN;
    if (!dsn) return;
    try {
      const url = new URL(dsn);
      const projectId = url.pathname.slice(1);
      const apiUrl = `https://\${url.host}/api/\${projectId}/store/`;
      const auth = `Sentry sentry_version=7, sentry_key=\${url.username}, sentry_client=cf-worker-img-proxy/1.0`;
      
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
    if (!c.env.REPO_REGISTRY) return;
    try {
      const user = c.get('user') || { email: 'system' };
      const ip = c.req.header('CF-Connecting-IP') || 'unknown';
      const timestamp = Date.now();
      const auditKey = `audit::\${timestamp}::\${action}`;
      
      const payload = {
        ts: new Date(timestamp).toISOString(),
        action,
        user: user.email,
        ip,
        ...data
      };

      await c.env.REPO_REGISTRY.put(auditKey, JSON.stringify(payload), { 
        expirationTtl: 90 * 24 * 60 * 60 // 90 days 
      });
    } catch (e) {
      console.error('Failed to record audit log:', e);
    }
  }
};
