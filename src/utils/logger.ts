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
  }
};
