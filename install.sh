#!/usr/bin/env bash
# Build tubeReader, run it as an always-on systemd --user service, and expose
# it over HTTPS on the tailnet so it can be installed as a PWA on the phone.
# Idempotent — re-run after any code change to rebuild and restart.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="$(command -v node)"
PORT=3700
# 443, 8443 and 10000 are already taken on this box by other services.
HTTPS_PORT=10001
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/tubereader.service"

echo "→ app dir     : $APP_DIR"
echo "→ node        : $NODE_BIN"
echo "→ local port  : $PORT"
echo "→ https port  : $HTTPS_PORT"
echo

# The dev server and the built one share :3700, so the dev one has to go first.
# `next build` also writes to the same .next/ the dev server is reading.
if node "$APP_DIR/bin/tubereader.mjs" status | grep -q "is running"; then
  echo "→ stopping the dev server (it holds :$PORT and .next/)"
  node "$APP_DIR/bin/tubereader.mjs" stop
fi

[ -d "$APP_DIR/node_modules" ] || npm --prefix "$APP_DIR" ci

echo "→ building…"
npm --prefix "$APP_DIR" run build

mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<EOF
[Unit]
Description=tubeReader — transcript reader and summarizer
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/node_modules/next/dist/bin/next start --port $PORT --hostname 127.0.0.1
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production
# The pipeline shells out to yt-dlp (/usr/bin), and to gallery-dl and claude
# (~/.local/bin) — a login shell's PATH is not inherited here.
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
# yt-dlp's --cookies-from-browser needs the session bus to reach the keyring
# that decrypts Brave's cookie store.
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=%t/bus

[Install]
WantedBy=default.target
EOF
echo "→ wrote unit  : $UNIT"

# Keep the service up when no login session is active (e.g. after a reboot).
loginctl enable-linger "$USER" 2>/dev/null \
  || echo "  (could not enable linger; run: sudo loginctl enable-linger $USER)"

systemctl --user daemon-reload
systemctl --user enable tubereader.service >/dev/null
systemctl --user restart tubereader.service

# Bounded wait — a cold start has to open the SQLite database and run migrations.
ok=0
for _ in $(seq 1 40); do
  # -s not -sS: connection refused is the expected state while it boots.
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/videos"; then ok=1; break; fi
  sleep 0.5
done
if [ "$ok" = 1 ]; then
  echo "✓ http://127.0.0.1:$PORT responding"
else
  echo "✗ local health check failed after ~20s — logs:"
  journalctl --user -u tubereader --no-pager | tail -30 || true
  exit 1
fi

echo
echo "→ exposing over HTTPS via Tailscale Serve…"
if tailscale serve --bg --https=$HTTPS_PORT "http://127.0.0.1:$PORT" 2>/tmp/ts-serve-tubereader-err; then
  HOST="$(tailscale status --json | "$NODE_BIN" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')"
  URL="https://$HOST:$HTTPS_PORT/"
  echo "✓ serving at: $URL"
  echo
  echo "On your iPhone (same tailnet):"
  echo "  1. Open $URL in Safari."
  echo "  2. Share → Add to Home Screen."
else
  echo "✗ tailscale serve failed:"; cat /tmp/ts-serve-tubereader-err
  echo "  • Enable HTTPS certificates for the tailnet in the admin console, then re-run."
  echo "  • Or: sudo tailscale set --operator=$USER"
  exit 1
fi

echo
echo "Manage: systemctl --user {status,restart,stop} tubereader"
echo "Logs:   journalctl --user -u tubereader -f"
echo "Stop serving: tailscale serve --https=$HTTPS_PORT off"
