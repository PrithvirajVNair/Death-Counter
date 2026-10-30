# Souls Game Death Counter (SDC)

A Soulsborne-inspired death counter, boss tracker, and overlay system built for streamers using OBS Studio and Streamlabs.

---

## 1. System Architecture

- **Web Frontend**: React 19, Vite, React Router 7, Lucide Icons, and custom dark Souls-themed Vanilla CSS.
- **Authoritative Database**: Supabase PostgreSQL with strict Row-Level Security (RLS), atomic RPC mutation functions with row-level locks, operation idempotency, and monotonic revision numbering.
- **Authentication**: Supabase Auth (Email & Google OAuth) with isolated streamer credentials.
- **Realtime Synchronization**: Supabase Realtime channel subscriptions paired with tab-aware polling fallback and monotonic revision conflict resolution. Local browser tabs communicate via `BroadcastChannel`.
- **Serverless API**: Vercel Serverless Functions (`api/index.js`, `api/_db.js`) managing moderator token verification, SHA-256 hashed delegations, public state projection, and atomic action dispatch.

---

## 2. Security Architecture

### Row-Level Security (RLS) & Column-Level Shielding
- **Ownership Enforcement**: Streamer records in `public.streamer_states` enforce `auth.uid() = user_id` for both `USING` and `WITH CHECK` on `INSERT`, `UPDATE`, and `DELETE`.
- **Explicit Column-Level Least Privilege**: Broad table-level `SELECT` on `public.streamer_states` is revoked from `anon` and `public`. The `anon` role is granted access strictly to display columns (`streamer_key, deaths, session_deaths, all_time_deaths, boss_kills, settings, shortcuts, bosses, current_boss, revision, last_updated`). Private account fields (`email`, `user_id`, `id`, `created_at`) cannot be queried anonymously under any circumstances.
- **Remote Tokens Isolation**: The `public.streamer_remote_tokens` table is entirely inaccessible to anonymous callers (`REVOKE ALL FROM anon, public`).

### Cryptographic Keys & Transactional Token Delegation
- **Streamer Keys**: Generated using cryptographically secure PRNGs (`crypto.getRandomValues`).
- **Transactional Streamer Key Regeneration**: Handled exclusively via the authenticated PostgreSQL RPC `regenerate_streamer_key(p_new_key)`. The RPC validates caller identity (`auth.uid()`), acquires a `SELECT ... FOR UPDATE` row lock, enforces key uniqueness, transactionally updates `streamer_states` and associated `streamer_remote_tokens`, and increments `revision`. Supabase Auth metadata is reconciled only after database transaction success.
- **Header-Only Moderator Authentication**: Moderator credentials are accepted exclusively through the `X-Moderator-Token` HTTP header. Legacy query parameters (`?token=...`) and JSON body fields (`body.token`) are rejected across all API endpoints. Raw tokens are never logged.
- **Remote Moderator Tokens**: Stored as **SHA-256 hashes**. Raw tokens are never persisted in the database and are presented only once during creation. Tokens support time-based expiration (1 hr, 6 hr, 24 hr, 7 days, permanent) and immediate revocation.

### Atomic Mutations, Idempotency & Distributed Rate Limiting
- **Atomic Database RPC**: All counter modifications (`add`, `undo`, `addBossKill`, `undoBossKill`, `setDeath`, `resetSession`, `resetAll`) execute via the `mutate_counter` PostgreSQL function with `SELECT ... FOR UPDATE` row locks, preventing race conditions.
- **Operation Idempotency**: Each mutation requires an `operation_id` logged in `public.operation_idempotency`. Retrying the same operation ID returns the authoritative state without re-mutating counters.
- **Monotonic Revision Numbers**: Every mutation increments `revision BIGINT`. Stale or out-of-order network responses are rejected by clients.
- **Distributed Atomic Rate Limiter**: Uses atomic Upstash Redis Lua scripts (`EVAL`) for increment and TTL initialization. Blocked requests never extend lockout windows, and concurrent requests cannot corrupt window TTLs. When Redis is unavailable, an instance-local memory sliding window fallback activates (`distributed: false`).

---

## 3. Environment Variables

Create a `.env` file in the project root:

```env
# Frontend & Client (Publicly accessible in client bundle)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Serverless API (Server-side only — DO NOT prefix with VITE_)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Optional: Upstash Redis for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...
```

> **Security Note**: Never expose `SUPABASE_SERVICE_ROLE_KEY` or `UPSTASH_REDIS_REST_TOKEN` to the frontend or prefix them with `VITE_`.

---

## 4. Database Setup & Migrations

If setting up a fresh database, execute `supabase_schema.sql` in the Supabase SQL Editor.

If upgrading an existing SDC database with historical data, run the sequential migrations:
1. `supabase_migration_v2.sql`: Applies monotonic revisions, token hashes, idempotency table, and `mutate_counter` RPC.
2. `supabase_migration_v3_cleanup.sql`: Purges legacy companion tokens from `streamer_remote_tokens`.
3. `supabase_migration_v4_production.sql`: Enforces column-level `GRANT SELECT` privileges on `streamer_states` and deploys `regenerate_streamer_key` RPC.

---

## 5. Development & Building

### Prerequisites
- Node.js 20.19.0 or later (required for Vite 8 and pure Node ZIP packaging)
- npm 9.0 or later

### Install Dependencies
```bash
npm install
```

### Run Web Application Locally
```bash
npm run dev
```

### Run Automated Tests
```bash
npm test
```
The test suite validates atomic counter arithmetic, boundary clamping, revision ordering, API authorization, payload limits, token hashing, and state preservation.

### Build Production Web Bundle
```bash
npm run build
```

---

## 6. OBS Studio & Streamlabs Integration

1. In OBS Studio, add a new **Browser Source**.
2. Set the URL to your unique overlay link (generated in the Controller Dashboard):
   ```
   https://your-domain.vercel.app/overlay?key=YOUR_STREAMER_KEY
   ```
3. Set the dimensions:
   - For Rune / Frame / Landscape presets: **800 x 300** (or **1920 x 1080** for canvas positioning).
   - For Vertical Rune preset: **300 x 800**.
4. Check **Shutdown source when not visible** and **Refresh browser when scene becomes active** (recommended).
5. The overlay renders with an automatic transparent background, smooth CSS animations, and instant updates via Supabase Realtime with fallback recovery polling.

---

## 7. Remote Moderator Delegations

1. Navigate to the Controller Dashboard and click **Share Remote**.
2. Select an expiration window:
   - 1 Hour
   - 6 Hours
   - 24 Hours
   - 7 Days
   - Permanent (Revocable at any time)
3. Click **Generate Link**. A cryptographically secure shareable link containing the raw token is created, and its SHA-256 hash is committed to Supabase.
4. Moderators can increment/decrement deaths and boss kills or set counts directly without having access to your account password or streamer key.
5. You can revoke any active moderator link at any time from the dashboard.

---

## 8. Security & Data Integrity Architecture

### Key Architectural Hardening:
1. **Dual Authorization Paths**:
   - **Streamer**: Requires valid Supabase Auth Bearer JWT verified server-side. Validates user identity and verifies ownership against `streamer_states.user_id`. Streamer keys alone are strictly rejected with `401 Unauthorized` for mutations.
   - **Moderator**: Requires a valid moderator token submitted via `X-Moderator-Token` header. Validated server-side via SHA-256 hash against `streamer_remote_tokens`. Enforces expiration, revocation, and fine-grained permissions.
   - **Public OBS**: Read-only projection strictly excluding sensitive account columns. Mutations are prohibited.
2. **Unsafe Fallback Elimination**:
   - Removed all fallback paths in `api/_db.js` that previously executed unprotected direct UPDATEs or fell back to local memory. PostgreSQL `mutate_counter` is the sole mutation authority in production.
3. **Public Token Access Completely Revoked**:
   - Database tables `streamer_remote_tokens` and `operation_idempotency` have all `anon` privileges revoked. Plaintext tokens are never stored; only SHA-256 hashes are persisted. Token hashes are never returned over client APIs.
4. **Transaction-Safe Idempotency**:
   - `operation_id` is mandatory for all mutations (8–128 alphanumeric chars). Evaluated atomically inside `mutate_counter` using row-level locks (`SELECT ... FOR UPDATE`). Cached results are returned on deduplication, and reusing an ID for a conflicting action is rejected with `409 Conflict`.
5. **No Executables or Native Binaries**:
   - The application runs 100% in modern web browsers and serverless edge functions. Zero native executables, background processes, or device hooks are required or distributed.

---

## 9. Verification & Quality Checklist

- [x] Strict Supabase Auth Bearer JWT verification on all streamer backend mutations.
- [x] Streamer key possession alone strictly rejected for counter mutations (`401 Unauthorized`).
- [x] Unsafe RPC fallback removed; database mutations strictly authoritative.
- [x] Anonymous access to `streamer_remote_tokens` and `operation_idempotency` completely revoked.
- [x] Moderator tokens stored only as SHA-256 hashes; hashes never returned to clients.
- [x] Row-level locking (`SELECT ... FOR UPDATE`) in `mutate_counter` guaranteeing concurrency idempotency.
- [x] Zero native executables or companion binaries in workspace and release packages.
- [x] Overlay polling pauses when tab/source is hidden (`document.hidden`), with request abort cancellation.
- [x] Automated security, atomic concurrency, and state preservation tests passing (`npm test`).
- [x] Clean production build with 0 compiler errors.
