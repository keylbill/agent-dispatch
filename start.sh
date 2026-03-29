#!/usr/bin/env bash
set -euo pipefail

NGROK_DOMAIN="postbursal-dedicatory-dyan.ngrok-free.dev"
BRIDGE_PORT="${PORT:-3001}"

cleanup() {
    echo "Shutting down..."
    kill "$NGROK_PID" 2>/dev/null || true
    kill "$BRIDGE_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

if ! command -v ngrok &>/dev/null; then
    echo "Error: ngrok not installed"
    exit 1
fi

if ! command -v bun &>/dev/null; then
    echo "Error: bun not installed"
    exit 1
fi

echo "Starting ngrok tunnel ($NGROK_DOMAIN -> localhost:$BRIDGE_PORT)..."
ngrok http --url="$NGROK_DOMAIN" "$BRIDGE_PORT" --log=stdout &>/tmp/ngrok-dispatch.log &
NGROK_PID=$!
sleep 2

if ! kill -0 "$NGROK_PID" 2>/dev/null; then
    echo "Error: ngrok failed to start. Check /tmp/ngrok-dispatch.log"
    exit 1
fi

echo "Starting bridge on port $BRIDGE_PORT..."
bun run src/index.ts &
BRIDGE_PID=$!
sleep 2

if ! kill -0 "$BRIDGE_PID" 2>/dev/null; then
    echo "Error: bridge failed to start. Check console output."
    kill "$NGROK_PID" 2>/dev/null
    exit 1
fi

echo ""
echo "=== agent-dispatch running ==="
echo "  Bridge:  http://localhost:$BRIDGE_PORT"
echo "  Public:  https://$NGROK_DOMAIN"
echo "  Agents:  @Sisyphus, @Prometheus"
echo ""
echo "  Make sure 'opencode serve' is running in your project directory."
echo "  Press Ctrl+C to stop."
echo ""

wait
