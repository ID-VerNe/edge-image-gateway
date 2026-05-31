export const logger = {
  info: (event: string, data: Record<string, any>) => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...data }));
  },
  error: (event: string, data: Record<string, any>) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', event, ...data }));
  },
  warn: (event: string, data: Record<string, any>) => {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', event, ...data }));
  }
};
