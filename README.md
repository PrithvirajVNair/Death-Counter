# Souls Game Death Counter (SDC)

A Soulsborne-inspired death counter, boss tracker, and overlay system built for streamers using OBS Studio and Streamlabs.

---

## 1. System Architecture

- **Web Frontend**: React 19, Vite, React Router 7, Lucide Icons, and custom dark Souls-themed Vanilla CSS.
- **Authoritative Database**: Supabase PostgreSQL with strict Row-Level Security (RLS), atomic RPC mutation functions with row-level locks, operation idempotency, and monotonic revision numbering.
- **Authentication**: Supabase Auth (Email & Google OAuth) with isolated streamer credentials.
- **Realtime Synchronization**: Supabase Realtime channel subscriptions paired with tab-aware polling fallback and monotonic revision conflict resolution. Local browser tabs communicate via `BroadcastChannel`.
- **Serverless API**: Vercel Serverless Functions (`api/index.js`, `api/_db.js`) managing moderator token verification, SHA-256 hashed delegations, public state projection, and atomic action dispatch.
- **Desktop Companion**: C# .NET Windows Forms application (`DeathCounterHotkeys.exe`) utilizing a Win32 user-mode low-level keyboard hook (`WH_KEYBOARD_LL`), per-action debounce, system tray controls, and an origin-validated local loopback HTTP server (`127.0.0.1:4455`).

---

## 2. Security Architecture

### Row-Level Security (RLS) & Isolation
- **Ownership Enforcement**: Streamer records in `public.streamer_states` enforce `auth.uid() = user_id` for both `USING` and `WITH CHECK` on `INSERT`, `UPDATE`, and `DELETE`.
- **Public Data Shielding**: Public OBS overlay clients (`anon` role) are strictly restricted via column-level privileges. Sensitive account fields (`email`, `user_id`) cannot be queried anonymously. The public overlay queries only display state (`streamer_key, deaths, session_deaths, all_time_deaths, boss_kills, settings, shortcuts, bosses, current_boss, revision, last_updated`).

### Cryptographic Keys & Token Delegation
- **Streamer Keys**: Generated using cryptographically secure pseudorandom number generators (`crypto.getRandomValues` in browser, `crypto.randomBytes` on server).
- **Remote Moderator Tokens**: Generated securely and stored in `public.remote_tokens` as **SHA-256 hashes**. Raw tokens are never stored in the database and are presented only once during link creation. Tokens support time-based expiration (1 hr, 6 hr, 24 hr, 7 days, permanent) and immediate revocation.
- **Zero-Trust Token Validation**: Remote actions are strictly validated against token expiration and permissions on the server. Supplying a streamer key alone does not grant moderator authorization.

### Atomic Mutations & Idempotency
- **Atomic Database RPC**: All counter modifications (`add`, `undo`, `addBossKill`, `undoBossKill`, `setDeath`, `resetSession`, `resetAll`) execute via the `mutate_counter` PostgreSQL function with `SELECT ... FOR UPDATE` row locks. This completely prevents lost updates from concurrent clicks or network retries.
- **Operation Idempotency**: Each mutation supports an `operation_id` logged in `public.operation_idempotency`. Retrying the same operation ID returns the authoritative state without re-executing the counter mutation.
- **Monotonic Revision Numbers**: Every mutation increments `revision BIGINT`. Stale or out-of-order network responses are rejected by clients.

### Desktop Companion Security
- **Local Loopback Only**: The local HTTP server binds strictly to `127.0.0.1:4455`.
- **Origin Validation**: Incoming HTTP requests validate the `Origin` header to prevent arbitrary malicious web origins from triggering hotkeys or actions.
- **Per-Action Debounce**: Replaced the global debounce with individual per-action debouncing (350ms) to ensure rapid consecutive combo inputs (e.g., F8 then F9) are not dropped while preventing key-repeat flooding.

---

## 3. Environment Variables

Create a `.env` file in the project root:

```env
# Frontend & Client (Publicly accessible in client bundle)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Serverless API (Server-side only — DO NOT prefix with VITE_)
# Optional if using direct Supabase client with anon key and RPC
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

> **Security Note**: Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend or prefix it with `VITE_`.

---

## 4. Database Setup & Migrations

If setting up a fresh database, execute `supabase_schema.sql` in the Supabase SQL Editor.

If upgrading an existing SDC database with historical data, run `supabase_migration_v2.sql` to non-destructively apply:
1. `revision BIGINT NOT NULL DEFAULT 0` column.
2. `token_hash VARCHAR(64)` column and index on `public.remote_tokens`.
3. `public.operation_idempotency` table with automatic TTL cleanup.
4. `public.mutate_counter` atomic RPC function.
5. Column-level `GRANT SELECT` privileges to `anon`.
6. Strict RLS policies on `streamer_states`, `remote_tokens`, and `operation_idempotency`.

---

## 5. Development & Building

### Prerequisites
- Node.js 18.0 or later
- npm 9.0 or later
- .NET Framework 4.7.2+ SDK (for compiling the Windows desktop companion)

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

## 6. Desktop Companion Compilation

The desktop hotkey companion (`DeathCounterHotkeys.exe`) runs as a lightweight Windows Forms application in the system tray.

### Compiling from Source
From the project root on a Windows system, run:
```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /win32icon:scripts\app.ico /out:scripts\DeathCounterHotkeys.exe /reference:System.Windows.Forms.dll,System.Drawing.dll,System.dll,System.Core.dll scripts\HotkeyListenerApp.cs
```
Copy the compiled binary to the `public/` directory for in-app download:
```powershell
Copy-Item scripts\DeathCounterHotkeys.exe public\DeathCounterHotkeys.exe
```

### Running the Companion
- Double click `scripts\DeathCounterHotkeys.exe` or execute `scripts\RunHotkeys.bat`.
- The companion minimizes to the Windows system tray and registers global keyboard shortcuts (Default: F8 = Add Death, F7 = Undo Death, F9 = Add Boss Kill, F10 = Undo Boss Kill).
- Hotkeys can be configured directly from the Controller Dashboard under the "Hotkeys" tab.

---

## 7. OBS Studio & Streamlabs Integration

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

## 8. Remote Moderator Delegations

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

## 9. Verification & Quality Checklist

- [x] Strict Row-Level Security (`auth.uid() = user_id`) enabled.
- [x] Column privilege isolation for anonymous OBS browser source clients.
- [x] Monotonic revision tracking and atomic PostgreSQL RPC mutations.
- [x] Operation idempotency with TTL deduplication.
- [x] Secure SHA-256 hashed remote moderator tokens.
- [x] Boss history and appearance customization preserved across all mutations.
- [x] Per-action debounce in desktop companion keyboard hook.
- [x] Local desktop HTTP listener protected with Origin validation.
- [x] 25/25 automated regression tests passing (`npm test`).
- [x] Clean production build with 0 ESLint errors.
