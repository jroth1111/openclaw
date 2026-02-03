#!/usr/bin/env bash
set -e

# OpenClaw Coolify Bootstrap Script
# Handles token generation, config creation, and startup

OPENCLAW_STATE="/root/.openclaw"
CONFIG_FILE="$OPENCLAW_STATE/openclaw.json"
WORKSPACE_DIR="/root/openclaw-workspace"
TOKEN_FILE="$OPENCLAW_STATE/.gateway_token"

# Validate and fix bind value (must be: loopback, lan, tailnet, auto, or custom)
# Docker/Coolify deployments should use "lan" for all interfaces
case "${OPENCLAW_GATEWAY_BIND:-}" in
  loopback|lan|tailnet|auto|custom)
    # Valid value, keep it
    ;;
  0.0.0.0|*)
    # Invalid or empty, default to "lan"
    export OPENCLAW_GATEWAY_BIND="lan"
    ;;
esac

# Create directories
mkdir -p "$OPENCLAW_STATE" "$WORKSPACE_DIR"
chmod 700 "$OPENCLAW_STATE"

# Create openclaw symlink for CLI access
if [ ! -f /usr/local/bin/openclaw ]; then
  ln -sf /app/dist/index.js /usr/local/bin/openclaw
  chmod +x /usr/local/bin/openclaw
fi

# Create openclaw-approve helper
if [ ! -f /usr/local/bin/openclaw-approve ]; then
  cat > /usr/local/bin/openclaw-approve <<'HELPER'
#!/bin/bash
# Auto-approve all pending pairing requests
echo "Approving all pending device requests..."
openclaw devices list --json 2>/dev/null | node -e "
const data = require('fs').readFileSync(0, 'utf8');
const devices = JSON.parse(data || '[]');
const pending = devices.filter(d => d.status === 'pending');
if (pending.length === 0) {
  console.log('No pending requests.');
  process.exit(0);
}
pending.forEach(d => {
  console.log('Approving:', d.id);
  require('child_process').execSync('openclaw devices approve ' + d.id);
});
console.log('Approved', pending.length, 'device(s)');
" 2>/dev/null || echo "No pending devices or command failed"
HELPER
  chmod +x /usr/local/bin/openclaw-approve
fi

# ----------------------------
# Gateway Token Persistence
# ----------------------------
if [ -z "$OPENCLAW_GATEWAY_TOKEN" ]; then
  if [ -f "$TOKEN_FILE" ]; then
    OPENCLAW_GATEWAY_TOKEN=$(cat "$TOKEN_FILE")
    echo "[openclaw] Loaded existing gateway token"
  else
    OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n')
    echo "$OPENCLAW_GATEWAY_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "[openclaw] Generated new gateway token: $OPENCLAW_GATEWAY_TOKEN"
  fi
fi

export OPENCLAW_GATEWAY_TOKEN

# ----------------------------
# Generate/Fix Config with ZAI Provider
# ----------------------------
# Always regenerate config to ensure valid values
# (prevents issues with stale/invalid configs)
echo "[openclaw] Generating openclaw.json..."

# Use node to generate valid JSON (avoids shell heredoc quote issues)
node -e "
const fs = require('fs');
const config = {
  env: {
    ZAI_API_KEY: process.env.ZAI_API_KEY || ''
  },
  gateway: {
    mode: 'local',
    port: parseInt(process.env.OPENCLAW_GATEWAY_PORT) || 28471,
    bind: 'lan',
    auth: {
      mode: 'token',
      token: process.env.OPENCLAW_GATEWAY_TOKEN
    }
  },
  models: {
    providers: {
      zai: {
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        api: 'openai-completions',
        auth: 'api-key',
        authHeader: true,
        models: [{ id: 'glm-4.7', name: 'GLM-4.7' }]
      }
    }
  },
  agents: {
    defaults: {
      model: {
        primary: 'zai/glm-4.7'
      }
    }
  }
};
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
fs.chmodSync('$CONFIG_FILE', 0o600);
console.log('[openclaw] Config ready at $CONFIG_FILE');
"

# ----------------------------
# Banner & Access Info
# ----------------------------
echo ""
echo "=================================================================="
echo "🦞 OpenClaw Gateway is starting..."
echo "=================================================================="
echo ""
echo "🔑 Access Token: $OPENCLAW_GATEWAY_TOKEN"
echo ""
echo "🌍 Port: ${OPENCLAW_GATEWAY_PORT:-28471}"
echo "🔗 Bind: ${OPENCLAW_GATEWAY_BIND:-lan}"
echo ""
echo "=================================================================="

# ----------------------------
# Run OpenClaw Gateway
# ----------------------------
# Note: Using node directly since openclaw is built from source
# Config is generated above with correct bind/port values
exec node dist/index.js gateway
