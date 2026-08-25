# Deployment Fixes for Render

This document summarizes the fixes applied to resolve the deployment issues on Render.

## Issues Fixed

### 1. Express Rate-Limit Trust Proxy Warning

**Error:**
```
ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false (default). This could indicate a misconfiguration which would prevent express-rate-limit from accurately identifying users.
```

**Fix Applied:** Added `app.set('trust proxy', 1)` in `backend/src/index.ts`

**File Modified:** `backend/src/index.ts`
```typescript
const app: Express = express();

// Trust proxy for Render (and other reverse proxies) - needed for express-rate-limit to work correctly
app.set('trust proxy', 1);

const httpServer = createServer(app);
```

**Why:** Render uses a reverse proxy that adds the `X-Forwarded-For` header. Express needs `trust proxy` enabled to correctly identify the client IP address for rate limiting.

---

### 2. Missing `timezone` Column in Users Table

**Error:**
```
❌ Query error (attempt 1/3): column "timezone" does not exist
   SQL: SELECT id, email, name, role, timezone, is_suspended, suspension_reason, two_factor_enabled FROM users WHERE email = $1
```

**Fix Applied:** Created a new migration `fix_missing_timezone_column.sql` to ensure the timezone column exists.

**File Created:** `backend/src/migrations/fix_missing_timezone_column.sql`
```sql
-- Fix missing timezone column in users table
-- This migration ensures the timezone column exists with a default value

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';
```

**Why:** The `add_timezone_support.sql` migration should have added this column, but it appears it wasn't applied on the production database. The new migration uses `IF NOT EXISTS` to safely add the column if missing.

---

## How These Fixes Work

### Trust Proxy Fix
When running behind a reverse proxy (like Render's load balancer), the actual client IP is forwarded via headers like `X-Forwarded-For`. Without `trust proxy`, Express ignores these headers and uses the proxy's IP instead, causing rate limiting to apply incorrectly (all users appear to come from the same IP).

### Timezone Column Fix
The login query in `auth.ts` selects the `timezone` column:
```typescript
const user = await queryOne(
  'SELECT id, email, name, role, timezone, is_suspended, suspension_reason, two_factor_enabled FROM users WHERE email = $1',
  [normalizedEmail]
);
```

If the column doesn't exist in the database, PostgreSQL throws a 42703 error (undefined_column).

---

## Deployment Checklist

After deploying these fixes to Render:

1. ✅ The migration `fix_missing_timezone_column.sql` will run automatically during build (part of `npm run migrate`)
2. ✅ The `trust proxy` setting will be active in production
3. ✅ Users should be able to log in without 500 errors
4. ✅ Rate limiting will work correctly per-user instead of per-proxy

---

## Verification

To verify the fixes work locally:

1. Run migrations:
   ```bash
   cd backend
   npm run migrate
   ```

2. Check the database schema:
   ```sql
   \d users
   ```
   Should show `timezone` column with default 'UTC'

3. Test login with test credentials (from seed):
   - Mentor: `john_mentor@example.com` / `password123`
   - Student: `bob_student@example.com` / `password123`