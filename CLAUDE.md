# Claude Agent Instructions

## Project Overview

**Edge Image Gateway** - A Cloudflare Workers-based image hosting service using GitHub as storage backend, with D1 as primary database, KV for rate limiting/monitoring, and R2 for cache.

## Architecture

- **Storage**: GitHub private repository (main storage)
- **Database**: Cloudflare D1 (primary, all data operations)
- **KV**: Only for rate limiting, notification throttling, GitHub API monitoring
- **Cache**: R2 (L2 image variant cache) + Edge cache (L1)
- **Framework**: Hono + TypeScript

## Deployment

**IMPORTANT**: Always deploy to production environment:

```bash
npx wrangler deploy --env production
```

**Production details:**
- Worker name: `img-proxy`
- Domain: `img.yuuverne.site`
- Environment: production

**DO NOT** use `pnpm run deploy` without `--env production` - it deploys to development by default.

## Key Principles

### 1. D1-First Architecture
- All data writes/reads go to D1 first
- KV is NOT a mirror - only used for specific features
- Never add KV writes for data storage

### 2. KV Usage (Limited)
KV writes are ONLY allowed for:
- Rate limiting & IP bans (`middleware/rateLimit.ts`)
- Notification throttling (`utils/notifications.ts`)
- GitHub API rate monitoring (`services/github.ts`)

**DO NOT** write to KV for:
- File metadata (use D1 `paths` table)
- Repo metadata (use D1 `repos` table)
- Auth tokens (use D1 `auth_tokens` table)
- Audit logs (use D1 `audit_logs` table)

### 3. Token Path Prefix
When a token has `pathPrefix` set:
- Uploads automatically go to that directory
- Ensures returned URL matches actual file path
- Prevents ERR_BLOCKED_BY_ORB errors

## Common Tasks

### Add New Feature
1. Check if it needs data persistence → use D1
2. Never add KV writes for data storage
3. Test locally: `pnpm dev`
4. Deploy: `npx wrangler deploy --env production`

### Debug Issues
- Check D1 first for data issues
- KV is only for rate limiting/monitoring
- Logs: `npx wrangler tail --env production`

### Database Changes
- Schema: `scripts/schema.sql`
- Migrations: Update D1 via wrangler
- Never assume KV has the data

## Project Structure

```
src/
├── routes/
│   ├── image.ts           # Image serving & processing
│   └── admin/             # Management panel
│       └── api/           # Admin APIs
├── services/
│   ├── database.ts        # D1 operations (primary)
│   ├── github.ts          # GitHub API wrapper
│   └── repoRouter.ts      # Multi-repo routing
├── middleware/
│   ├── rateLimit.ts       # Rate limiting (uses KV)
│   ├── signature.ts       # HMAC auth
│   └── adminAuth.ts       # Admin authentication
└── utils/
    ├── cache.ts           # Cache management
    └── notifications.ts   # Telegram alerts (uses KV for throttling)
```

## Critical Files

- `src/routes/admin/api/upload.ts` - File upload with auto pathPrefix
- `src/services/database.ts` - All D1 operations
- `src/middleware/rateLimit.ts` - Only allowed KV writes for rate limiting
- `wrangler.toml` - Environment configs (never commit secrets)

## Testing

```bash
pnpm test        # Run tests
pnpm typecheck   # Type check
pnpm dev         # Local development
```

## Security Notes

- Never commit `wrangler.toml` with secrets
- GitHub token stored as Cloudflare secret
- Admin emails in environment variables
- Path prefix enforced at upload time

## Recent Changes

- **2024-06**: Migrated from KV dual-write to D1-only architecture, reduced KV writes by 99%
- **2024-06**: Fixed token pathPrefix auto-apply to upload directory
