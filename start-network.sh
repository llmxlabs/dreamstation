#!/usr/bin/env bash
set -e

PORT=${PORT:-3001}

# Resolve the best LAN IP address (non-loopback, non-docker)
get_lan_ip() {
  # Try hostname -I first (Linux)
  if command -v hostname &>/dev/null; then
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -n "$ip" && "$ip" != "127."* ]]; then
      echo "$ip"
      return
    fi
  fi
  # Fallback: ip route
  if command -v ip &>/dev/null; then
    ip route get 1.1.1.1 2>/dev/null | awk '/src/{print $7}' | head -1
    return
  fi
  # macOS fallback
  if command -v ipconfig &>/dev/null; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
    return
  fi
  echo "localhost"
}

LAN_IP=$(get_lan_ip)

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        DreamStation Frame — LAN Mode      ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Dashboard : http://${LAN_IP}:${PORT}"
echo "  Pair page : http://${LAN_IP}:${PORT}/pair"
echo "  Player    : http://${LAN_IP}:${PORT}/player/<display-id>"
echo ""
echo "  Any device on this network can open these URLs."
echo "  Press Ctrl+C to stop."
echo ""

# Bind explicitly; Next CLI does not use HOSTNAME as a binding option.
exec npm run dev -- --hostname 0.0.0.0 --port "$PORT"
