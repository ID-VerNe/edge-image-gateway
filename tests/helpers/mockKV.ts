export function makeMockKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: async (k: string, typeOrOptions?: any) => {
      const val = store.get(k) ?? null;
      if (val === null) return null;
      
      const isJson = typeOrOptions === 'json' || (typeof typeOrOptions === 'object' && typeOrOptions?.type === 'json');
      if (isJson) {
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }
      return val;
    },
    put: async (k: string, v: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: any) => { 
      store.set(k, v as string); 
    },
    delete: async (k: string) => { store.delete(k); },
    list: async (options?: any) => {
      const prefix = options?.prefix || '';
      const keys = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) keys.push({ name: k });
      }
      return { keys, list_complete: true, cursor: '' };
    },
    _store: store,
  } as any;
}
