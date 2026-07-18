import { Hono } from 'hono';
import { AppEnvironment } from '../../../types/env';
import { dbService } from '../../../services/database';
import { ProviderConfig } from '../../../providers/types';
import { logger } from '../../../utils/logger';
import { getRegistry, resetRegistry } from '../../../providers/registry';

const providersApi = new Hono<AppEnvironment>();

/**
 * GET / — List all storage providers.
 */
providersApi.get('/', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const providers = await dbService.getAllProviders(c.env.DB);
    const registry = getRegistry();
    const currentWriteId = registry.getCurrentWriteId();
    return c.json({ providers, currentWriteId });
  } catch (err: any) {
    return c.json({ error: 'Failed to query providers', message: err.message }, 500);
  }
});

/**
 * POST / — Create a new storage provider.
 */
providersApi.post('/', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const body = await c.req.json() as any;
    const { id, type, name, settings, status, capacityLimitBytes } = body;

    if (!id || !type || !name) {
      return c.json({ error: 'Missing required fields: id, type, name' }, 400);
    }

    // Validate provider type
    const validTypes = ['github', 's3', 'googledrive', 'memory'];
    if (!validTypes.includes(type)) {
      return c.json({ error: `Invalid provider type. Must be one of: ${validTypes.join(', ')}` }, 400);
    }

    // Check for duplicate ID
    const existing = await dbService.getAllProviders(c.env.DB);
    if (existing.some(p => p.id === id)) {
      return c.json({ error: `Provider with ID "${id}" already exists` }, 409);
    }

    const provider: ProviderConfig = {
      id,
      type,
      name,
      status: status || 'active',
      capacityLimitBytes: capacityLimitBytes || 5 * 1024 * 1024 * 1024, // 5GB default
      usedBytes: 0,
      fileCount: 0,
      settings: settings || {},
    };

    await dbService.upsertProvider(c.env.DB, provider);
    c.executionCtx.waitUntil(logger.recordAudit(c, 'CREATE_PROVIDER', { id, type, name }));

    // Invalidate registry cache so it reloads on next request
    resetRegistry();

    return c.json({ success: true, provider });
  } catch (err: any) {
    return c.json({ error: 'Failed to create provider', message: err.message }, 500);
  }
});

/**
 * PUT /:id — Update a storage provider.
 */
providersApi.put('/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const id = c.req.param('id');
    const body = await c.req.json() as any;
    const { type, name, settings, status, capacityLimitBytes } = body;

    const existing = await dbService.getAllProviders(c.env.DB);
    const current = existing.find(p => p.id === id);
    if (!current) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    const updated: ProviderConfig = {
      ...current,
      type: type || current.type,
      name: name || current.name,
      status: status || current.status,
      capacityLimitBytes: capacityLimitBytes || current.capacityLimitBytes,
      settings: settings || current.settings,
    };

    await dbService.upsertProvider(c.env.DB, updated);
    c.executionCtx.waitUntil(logger.recordAudit(c, 'UPDATE_PROVIDER', { id, ...body }));

    resetRegistry();

    return c.json({ success: true, provider: updated });
  } catch (err: any) {
    return c.json({ error: 'Failed to update provider', message: err.message }, 500);
  }
});

/**
 * DELETE /:id — Delete a storage provider.
 */
providersApi.delete('/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const id = c.req.param('id');

    // Check if provider has any files
    const { results } = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM path_providers WHERE provider_id = ?`
    ).bind(id).first() as any;

    if (results && results.count > 0) {
      return c.json({
        error: 'Cannot delete provider with existing files',
        details: `Provider has ${results.count} files. Migrate or delete them first.`,
      }, 409);
    }

    await c.env.DB.prepare('DELETE FROM providers WHERE id = ?').bind(id).run();
    c.executionCtx.waitUntil(logger.recordAudit(c, 'DELETE_PROVIDER', { id }));

    resetRegistry();

    return c.json({ success: true, message: `Provider "${id}" deleted` });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete provider', message: err.message }, 500);
  }
});

/**
 * POST /:id/route/write — Set this provider as the active write target.
 */
providersApi.post('/:id/route/write', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 not configured' }, 400);
  }

  try {
    const id = c.req.param('id');

    const existing = await dbService.getAllProviders(c.env.DB);
    if (!existing.some(p => p.id === id)) {
      return c.json({ error: 'Provider not found' }, 404);
    }

    await dbService.setConfig(c.env.DB, 'route::current_write', id);
    c.executionCtx.waitUntil(logger.recordAudit(c, 'SWITCH_WRITE_PROVIDER', { target: id }));

    resetRegistry();

    return c.json({ success: true, currentWriteId: id });
  } catch (err: any) {
    return c.json({ error: 'Failed to set write provider', message: err.message }, 500);
  }
});

export default providersApi;