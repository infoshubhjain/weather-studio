#!/usr/bin/env bash
# Weather Studio — one command to get running.
#
#   ./start.sh          install if needed, then start the dev server
#   ./start.sh prod     production build + start
#   ./start.sh test     unit tests, then end-to-end smoke tests
#   ./start.sh check    doctor: versions, env, port, health
#
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"
PORT="${PORT:-3000}"

c()  { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
ok() { c '32' "  ✓ $1"; }
no() { c '31' "  ✗ $1"; }
hm() { c '33' "  ! $1"; }
hd() { printf '\n'; c '1;36' "$1"; }

# ── prerequisites ────────────────────────────────────────────────────────────
hd "Checking prerequisites"

if ! command -v node >/dev/null 2>&1; then
  no "Node.js not found. Install Node 20+ from https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  no "Node $(node -v) is too old — this project needs Node 20 or newer."
  exit 1
fi
ok "Node $(node -v)"
ok "npm v$(npm -v)"

# ── dependencies ─────────────────────────────────────────────────────────────
# Reinstall when node_modules is missing or older than the lockfile.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  hd "Installing dependencies"
  npm install
else
  ok "Dependencies already installed"
fi

# ── optional configuration ───────────────────────────────────────────────────
hd "Configuration"
if [ -f .env.local ]; then
  ok ".env.local found"
  # Report which optional integrations are on — never print the values.
  for k in AI_API_KEY YOUTUBE_API_KEY GOOGLE_MAPS_API_KEY TURSO_DATABASE_URL; do
    if grep -qE "^${k}=.+" .env.local 2>/dev/null; then ok "$k is set"; fi
  done
else
  hm "No .env.local — running fully keyless (this is fine)."
  hm "Optional upgrades are documented in .env.example"
fi

# ── port ─────────────────────────────────────────────────────────────────────
# Only the modes that actually bind $PORT care. `test` uses its own port and
# `check` is read-only, so neither should prompt.
free_port() {
  lsof -ti tcp:"$PORT" >/dev/null 2>&1 || return 0
  hm "Port $PORT is already in use."
  if [ -t 0 ]; then
    read -r -p "  Kill the process using it? [y/N] " reply
  else
    reply=n   # non-interactive (CI, piped): never kill someone else's process
  fi
  case "$reply" in
    [yY]*) lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true; ok "Port $PORT freed"; sleep 1 ;;
    *)     no "Set a different port:  PORT=3001 ./start.sh"; exit 1 ;;
  esac
}

# ── run ──────────────────────────────────────────────────────────────────────
case "$MODE" in
  dev)
    free_port
    hd "Starting dev server"
    c '1;32' "  → http://localhost:$PORT"
    c '0;90'  "    health check: http://localhost:$PORT/api/health"
    printf '\n'
    exec npx next dev -p "$PORT"
    ;;

  prod)
    free_port
    hd "Building for production"
    npx next build
    hd "Starting production server"
    c '1;32' "  → http://localhost:$PORT"
    printf '\n'
    exec npx next start -p "$PORT"
    ;;

  test)
    hd "Unit tests (offline)"
    npm test

    hd "Smoke tests (needs a running server)"
    # Boot a throwaway server on a spare port so this works from a cold clone.
    TEST_PORT=$((PORT + 900))
    npx next build >/dev/null
    npx next start -p "$TEST_PORT" >/tmp/weather-smoke.log 2>&1 &
    SERVER_PID=$!
    trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

    for _ in $(seq 1 45); do
      curl -sf "http://localhost:$TEST_PORT" >/dev/null 2>&1 && break
      sleep 1
    done

    BASE="http://localhost:$TEST_PORT" node scripts/smoke.mjs
    ;;

  check)
    hd "Doctor"
    ok "Node $(node -v), npm v$(npm -v)"
    [ -d node_modules ] && ok "node_modules present" || no "node_modules missing — run ./start.sh"
    [ -f .env.local ] && ok ".env.local present" || hm ".env.local absent (keyless mode)"
    if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
      ok "Server responding on :$PORT"
      curl -s "http://localhost:$PORT/api/health" |
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);
          console.log("    status:  ", h.status);
          console.log("    database:", h.database.backend, "|", h.database.records, "records");
          for (const d of h.dependencies) console.log("    " + (d.ok?"✓":"✗"), d.name, d.ms + "ms");
        })'
    else
      hm "No server on :$PORT — start one with ./start.sh"
    fi
    ;;

  *)
    no "Unknown mode '$MODE'. Use: dev | prod | test | check"
    exit 1
    ;;
esac
