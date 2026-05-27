# Ingestion Server — Recipe Seeding on a 24/7 Windows + Docker Box

*Design + setup guide. Produced via `/sc:design` 2026-05-27. Moves the Spoonacular fetch + Supabase
seeding cron off the MacBook onto an always-on Windows machine running Docker Desktop (WSL2).*

> **What changes:** only *where* the job runs. The fetch + ingest pipeline is unchanged
> (`recipes/random`, `includeNutrition`, idempotent upsert into the **same cloud Supabase**).
> **What's added:** containerization, an in-container scheduler, a Healthchecks.io heartbeat, and
> automated `git pull` updates.
> **Cutover rule:** exactly one machine may run this at a time (shared Spoonacular quota + single
> ledger). The Mac cron is retired at the end.

---

## 1. Architecture

```
Windows host ── Docker Desktop (WSL2 backend) ──────────────────────────────┐
                                                                            │
  git clone (host, in WSL2 fs)  ──bind-mount──►  container  "ingest"        │
  ./cookDaddy                                    (Linux, restart: always)   │
     .env  (secrets)                              ├─ node 20 + pnpm          │
                                                  ├─ PowerShell Core (pwsh)  │
                                                  ├─ curl, git               │
                                                  └─ supercronic ── crontab: │
                                                       0 * * * *  → tick     │
                                                       30 3 * * * → self-update
                                                                            │
   tick:  ping /start ─► pwsh test-spoon.ps1 (fetch) ─► pnpm ingest ─► cloud Supabase
          └─ ping (ok) or ping /fail   ───────────────────────────────────► Healthchecks.io
```

- **Runner:** one always-on Linux container; **supercronic** fires the tick hourly.
- **Pipeline (unchanged):** `test-spoon.ps1` pulls a batch from Spoonacular into `RecipeJson/*.json`,
  then `pnpm ingest` (`import-spoon.ts`) normalizes + idempotently upserts into cloud Supabase via the
  service-role key. Ledger `RecipeJson/.imported.json` skips already-processed files.
- **Code delivery:** the repo is a normal `git clone` on the host, **bind-mounted** into the container,
  so `git pull` updates the scripts live (no rebuild for code changes).
- **Yield/budget:** hourly × `number=3` (+ nutrition) ≈ ~7 pts/call → **~168 pts/day, ~72 recipes/day**,
  under the Spoonacular Starter 200 pts/day cap. (Spoonacular returns HTTP 402 if the cap is ever hit;
  the tick fails gracefully and retries next hour.)

### Cost model (for reference)
`recipes/random?number=N&includeNutrition=true` ≈ **1 (base) + N (recipes) + N (nutrition)** pts.
`number=3` → ~7 pts/call. 24 ticks/day → ~168 pts/day, ~72 recipes/day. Quota resets at **UTC midnight**;
the container runs in **UTC**, which aligns the daily window cleanly.

---

## 2. Prerequisites (Windows host)

1. **Docker Desktop** with the **WSL2 backend** enabled
   (Settings → General → "Use the WSL 2 based engine").
2. **Start Docker on login:** Settings → General → "Start Docker Desktop when you log in".
3. **Git** inside WSL2 (`sudo apt install git` in your WSL distro) — clone into the **WSL2 filesystem**
   (e.g. `~/code/cookDaddy`), **not** `/mnt/c/...`, for far better I/O and correct file permissions.
4. A **GitHub credential** for cloning/pulling (HTTPS PAT or SSH key) configured in WSL2.
5. The cloud Supabase **service-role key** and **Spoonacular API key** (same values the Mac used).
6. Your **Healthchecks.io** ping URL (already in your `.env` as `HEALTHCHECK_PING_URL`).

> **CRLF warning:** the shell scripts (`*.sh`) must use **LF** line endings. On Windows/WSL, ensure git
> does not rewrite them — this repo should carry a `.gitattributes` (see §4.6). If a script fails with
> `bad interpreter: /usr/bin/env bash^M`, it was checked out with CRLF.

---

## 3. Required environment (`.env` on the host, never committed)

The bind-mounted repo's `.env` is read by both `test-spoon.ps1` (reads the file directly) and
`import-spoon.ts` (via `dotenv`). `docker-compose` also loads it into the container env so the heartbeat
shell can read `HEALTHCHECK_PING_URL`.

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
SPOONACULAR_API_KEY=<spoonacular key>
HEALTHCHECK_PING_URL=https://hc-ping.com/<your-uuid>
# optional
POSTHOG_KEY=<posthog server key>
```

`.env` is already gitignored. **Do not** bake these into the image or commit them.

---

## 4. Files to add to the repo

All new files live under `docker/` plus a one-line tweak to the existing fetch script. These are the
design artifacts; `/sc:implement` creates them in-repo.

### 4.1 `docker/Dockerfile`
```dockerfile
# Linux runner for the recipe-seeding pipeline. System deps only — the app code
# is bind-mounted at /app and pnpm install runs in the entrypoint.
FROM node:20-bookworm-slim

ENV TZ=UTC \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH

# git + curl + PowerShell prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gnupg apt-transport-https libicu72 \
    && rm -rf /var/lib/apt/lists/*

# PowerShell Core (Debian 12 / bookworm) — runs test-spoon.ps1 unchanged
RUN curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o /tmp/ms.deb \
    && dpkg -i /tmp/ms.deb && rm /tmp/ms.deb \
    && apt-get update && apt-get install -y --no-install-recommends powershell \
    && rm -rf /var/lib/apt/lists/*

# supercronic (in-container cron). amd64 = Windows/WSL2 default.
# Pin a version, and (recommended) set SUPERCRONIC_SHA1SUM to the checksum published
# on the release page to enable integrity verification — leave empty to skip the check.
#   https://github.com/aptible/supercronic/releases
ARG SUPERCRONIC_VERSION=v0.2.33
ARG SUPERCRONIC_SHA1SUM=
RUN curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
      -o /usr/local/bin/supercronic \
    && { [ -z "$SUPERCRONIC_SHA1SUM" ] || echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c -; } \
    && chmod +x /usr/local/bin/supercronic

RUN corepack enable

WORKDIR /app
ENTRYPOINT ["/app/docker/entrypoint.sh"]
```

### 4.2 `docker/entrypoint.sh`
```bash
#!/usr/bin/env bash
# Installs deps into the node_modules volume, then hands off to supercronic.
set -euo pipefail

cd /app
git config --global --add safe.directory /app || true

echo "[entrypoint] pnpm install…"
corepack enable
pnpm install --frozen-lockfile

echo "[entrypoint] starting supercronic (UTC)…"
exec supercronic -passthrough-logs /app/docker/crontab
```

### 4.3 `docker/crontab` (supercronic, UTC)
```
# Hourly recipe-seeding tick (~7 pts/call × 24 ≈ 168 pts/day, ~72 recipes/day)
0  * * * *   /app/docker/cron-step.sh
# Nightly self-update: git pull + reinstall if lockfile changed
30 3 * * *   /app/docker/auto-update.sh
```

### 4.4 `docker/cron-step.sh` (container tick + Healthchecks heartbeat)
```bash
#!/usr/bin/env bash
# Container ingestion tick: heartbeat-wrapped fetch + import. REPO_ROOT is the
# bind-mounted /app (the Mac scripts/ingestion/cron-step.sh hardcodes a $HOME
# path, so the container uses this wrapper instead — pipeline behavior is identical).
set -uo pipefail

REPO_ROOT=/app
PING="${HEALTHCHECK_PING_URL:-}"

hc() { [ -n "$PING" ] && curl -fsS -m 10 --retry 3 "${PING}${1}" >/dev/null 2>&1 || true; }

run() {
  echo "[cron-step] tick start (pid=$$)"
  if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -ExecutionPolicy Bypass \
      -File "$REPO_ROOT/scripts/ingestion/test-spoon.ps1" \
      || echo "[cron-step] spoon fetch failed; importing existing files only" >&2
  else
    echo "[cron-step] pwsh missing; importing existing files only" >&2
  fi
  cd "$REPO_ROOT" && pnpm ingest
  echo "[cron-step] tick end"
}

hc /start
# Timestamp every line (UTC) so `docker logs` mirrors the old spoonacular-cron.log cadence audit.
if run 2>&1 | awk '{ "date -u +%Y-%m-%dT%H:%M:%SZ" | getline t; close("date -u +%Y-%m-%dT%H:%M:%SZ"); print t" "$0; fflush() }'; then
  hc ""        # success ping
else
  hc /fail     # failure ping
fi
exit 0
```

### 4.5 `docker/auto-update.sh` (automated nightly update)
```bash
#!/usr/bin/env bash
# Pull latest main; reinstall deps only if the lockfile changed. Code changes
# take effect on the next tick (scripts are read fresh); a dependency change is
# picked up here without a full image rebuild.
set -uo pipefail
cd /app || exit 1
git config --global --add safe.directory /app || true

before=$(sha1sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)
git fetch --quiet origin main && git reset --hard --quiet origin/main
after=$(sha1sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)

if [ "$before" != "$after" ]; then
  echo "[auto-update] lockfile changed → pnpm install"
  corepack enable && pnpm install --frozen-lockfile
fi
echo "[auto-update] now at $(git rev-parse --short HEAD)"
```
> `git reset --hard origin/main` keeps the server a pristine mirror of `main` (it never commits locally).
> A Dockerfile/system-dep change still needs a manual `docker compose up -d --build` (rare).

### 4.6 `docker/compose.yaml`
```yaml
services:
  ingest:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    image: cookdaddy-ingest:local
    restart: always
    env_file: ../.env          # injects HEALTHCHECK_PING_URL etc. into the container env
    environment:
      TZ: UTC
    volumes:
      - ..:/app                            # host git clone (live code via git pull)
      - ingest_node_modules:/app/node_modules   # Linux-native deps (don't shadow with host)
      - ingest_recipejson:/app/RecipeJson       # persists fetched JSON + .imported.json ledger
    # tiny workload; cap resources so it can't balloon
    mem_limit: 1g
    cpus: 1.0

volumes:
  ingest_node_modules:
  ingest_recipejson:
```

### 4.7 `.gitattributes` (repo root — prevents CRLF breakage on Windows)
```
*.sh   text eol=lf
*.ps1  text eol=crlf
```

### 4.8 One-line pipeline tweak — `scripts/ingestion/test-spoon.ps1`
Change the batch size from 5 → 3 to land ~72 recipes/day under the hourly cadence:
```diff
- 'number=5' +
+ 'number=3' +
```
*(Optional budget guard: the script already logs `X-API-Quota-Left`; with 168/200 pts/day the margin is
comfortable and Spoonacular 402s gracefully at the cap, so no further change is required. If you later
want a hard pre-flight skip, persist the last `quota_left` to a state file and short-circuit when it's
below ~7.)*

> **`RecipeJson/` stays gitignored** — on the server it's a Docker volume of local artifacts; the
> container never commits or pushes JSON back (`auto-update.sh` only pulls).

---

## 5. Stand-up procedure (on the Windows box, inside WSL2)

```bash
# 1. Clone into the WSL2 filesystem (NOT /mnt/c)
cd ~/code && git clone https://github.com/fontezbrooks/cookDaddy.git
cd cookDaddy

# 2. Create .env with the 4 required vars (see §3). Never commit it.
cp .env.example .env && nano .env   # fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                                     # SPOONACULAR_API_KEY, HEALTHCHECK_PING_URL

# 3. Build + start (detached, restart:always)
docker compose -f docker/compose.yaml up -d --build

# 4. Watch the first install + tick
docker compose -f docker/compose.yaml logs -f ingest
```

To trigger a tick immediately (instead of waiting for the top of the hour):
```bash
docker compose -f docker/compose.yaml exec ingest /app/docker/cron-step.sh
```

---

## 6. Verification (before retiring the Mac)

1. **Manual tick succeeds:** the exec above logs `[spoon] wrote … quota_left=…` then an `[ingest]`
   summary ending without fatal errors.
2. **Rows land in cloud Supabase:** the recipe count rises (Supabase dashboard → Table editor →
   `recipes`, or `select count(*) from recipes;`).
3. **Heartbeat fires:** the Healthchecks.io check flips to **up** right after a successful tick
   (and to **down/late** if you stop the container).
4. **Survives a reboot:** restart Windows; confirm Docker Desktop auto-starts and the `ingest`
   container comes back `Up` (`docker ps`).
5. **Quota sane:** over a full UTC day, `quota_used` stays well under 200 (expect ~168).

---

## 7. Cutover — retire the Mac cron (do this only after §6 passes)

On the **MacBook**:
```bash
crontab -l                       # confirm the cron-step.sh line is present
crontab -l | grep -v 'cookDaddy/scripts/ingestion/cron-step.sh' | crontab -
crontab -l                       # confirm it's gone
```
Now exactly one runner (the server) consumes the Spoonacular quota and writes the ledger. Running both
would double API spend and risk quota exhaustion.

---

## 8. Operations

| Task | Command (in `~/code/cookDaddy`) |
|---|---|
| Tail logs | `docker compose -f docker/compose.yaml logs -f ingest` |
| Cadence/quota audit | `docker compose -f docker/compose.yaml logs ingest \| grep -E 'tick (start\|end)\|quota_'` |
| Run a tick now | `docker compose -f docker/compose.yaml exec ingest /app/docker/cron-step.sh` |
| Manual update | `git pull && docker compose -f docker/compose.yaml up -d --build` |
| Restart | `docker compose -f docker/compose.yaml restart ingest` |
| Stop | `docker compose -f docker/compose.yaml down` |
| Reset fetched-JSON volume | `docker compose -f docker/compose.yaml down && docker volume rm cookdaddy_ingest_recipejson` |

---

## 9. Troubleshooting

- **`bad interpreter: …^M`** → script checked out with CRLF. Ensure `.gitattributes` (§4.7), then
  `git rm --cached -r . && git reset --hard` in the clone, or `dos2unix docker/*.sh`.
- **`pwsh: not found`** → image didn't build the PowerShell layer; rebuild with `--no-cache`.
- **Spoonacular 402 / `quota_left=0`** → daily cap hit; the tick logs the failure and resumes after the
  UTC reset. If recurring, lower `number` or cadence.
- **No rows in Supabase** → check `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `.env`; the importer
  logs an env error if missing.
- **Heartbeat never pings** → confirm `HEALTHCHECK_PING_URL` is in `.env` and `env_file` resolves
  (`docker compose … exec ingest printenv HEALTHCHECK_PING_URL`).
- **Container can't `git pull`** → configure WSL2 git credentials (PAT/SSH); the bind-mounted `.git`
  uses the host's clone, so credentials live on the host.
- **Two runners by accident** → quota burns 2× and recipes thrash; verify the Mac crontab is empty (§7).

---

## 10. Security notes

- Secrets live only in the host `.env` (gitignored) — never in image layers, never committed.
- The service-role key bypasses RLS; keep the box and its `.env` access-controlled.
- The Healthchecks ping URL was shared in plaintext during planning — consider rotating the check's UUID.

---

## 11. Next step

`/sc:implement` to scaffold the `docker/` files + `.gitattributes` + the `test-spoon.ps1` `number` tweak
in the repo, then `/sc:git` to commit on a branch and PR. After merge, follow §5 → §6 → §7 on the
Windows box.
