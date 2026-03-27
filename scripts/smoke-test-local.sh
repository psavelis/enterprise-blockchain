#!/usr/bin/env bash
# smoke-test-local.sh — Verify the local multi-platform stack is healthy.
# Usage: bash scripts/smoke-test-local.sh
# Requires: docker compose, curl, nc (netcat)
# Works on macOS (Docker Desktop) and Linux.

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
BESU_RPC_0="http://127.0.0.1:8545"
BESU_RPC_1="http://127.0.0.1:8546"
FABRIC_ORDERER_PORT=7050
FABRIC_PEER_ORG1_PORT=7051
FABRIC_PEER_ORG2_PORT=7052
CORDA_NOTARY_PORT=10006
CORDA_PARTYA_PORT=10007
CORDA_PARTYB_PORT=10008

TIMEOUT_SECONDS="${SMOKE_TIMEOUT:-120}"
POLL_INTERVAL=3

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass=0
fail=0

# ── Helpers ──────────────────────────────────────────────────────────

log_info()  { printf "${YELLOW}[INFO]${NC}  %s\n" "$*"; }
log_ok()    { printf "${GREEN}[PASS]${NC}  %s\n" "$*"; pass=$((pass + 1)); }
log_fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$*"; fail=$((fail + 1)); }

# wait_for_tcp HOST PORT LABEL — poll until a TCP port is accepting connections.
wait_for_tcp() {
  local host="$1" port="$2" label="$3"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  log_info "Waiting for ${label} at ${host}:${port} (timeout ${TIMEOUT_SECONDS}s) ..."
  while (( SECONDS < deadline )); do
    if nc -z "$host" "$port" 2>/dev/null; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
  done
  return 1
}

# json_rpc URL METHOD — send a JSON-RPC 2.0 request and return the full response body.
json_rpc() {
  local url="$1" method="$2"
  curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":[],\"id\":1}"
}

# ── Step 1: Wait for all services to be ready ────────────────────────
# Prefer Docker health status when available; fall back to TCP for
# services whose images lack a HEALTHCHECK instruction.

log_info "=== Step 1: Service readiness checks ==="

# Check Docker health status first for services with healthchecks.
# $1 = container name, $2 = label
wait_for_healthy() {
  local container="$1" label="$2"
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  log_info "Waiting for ${label} Docker health (timeout ${TIMEOUT_SECONDS}s) ..."
  while (( SECONDS < deadline )); do
    local status
    status="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)" || status=""
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
  done
  return 1
}

# Besu nodes have Docker healthchecks defined in docker-compose.yml
for pair in "besu-validator-0:Besu validator-0" "besu-validator-1:Besu validator-1"; do
  container="${pair%%:*}"
  label="${pair#*:}"
  if wait_for_healthy "$container" "$label"; then
    log_ok "${label} is healthy (Docker healthcheck)"
  else
    log_fail "${label} did not become healthy within ${TIMEOUT_SECONDS}s"
  fi
done

# Fabric and Corda images lack healthchecks — fall back to TCP.
for svc_label_port in \
  "Fabric orderer:127.0.0.1:${FABRIC_ORDERER_PORT}" \
  "Fabric peer-org1:127.0.0.1:${FABRIC_PEER_ORG1_PORT}" \
  "Fabric peer-org2:127.0.0.1:${FABRIC_PEER_ORG2_PORT}" \
  "Corda notary:127.0.0.1:${CORDA_NOTARY_PORT}" \
  "Corda partyA:127.0.0.1:${CORDA_PARTYA_PORT}" \
  "Corda partyB:127.0.0.1:${CORDA_PARTYB_PORT}"; do

  label="${svc_label_port%%:*}"
  hostport="${svc_label_port#*:}"
  host="${hostport%%:*}"
  port="${hostport##*:}"

  if wait_for_tcp "$host" "$port" "$label"; then
    log_ok "${label} is accepting connections on port ${port}"
  else
    log_fail "${label} did not become ready within ${TIMEOUT_SECONDS}s on port ${port}"
  fi
done

# ── Step 2: Besu — verify blocks are advancing ──────────────────────

log_info "=== Step 2: Besu block production ==="

check_besu_blocks() {
  local url="$1" label="$2"
  local resp block_hex block_dec resp2 block_hex2 block_dec2

  resp="$(json_rpc "$url" "eth_blockNumber" 2>/dev/null)" || {
    log_fail "${label}: eth_blockNumber RPC failed"
    return
  }

  block_hex="$(echo "$resp" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4)"
  if [[ -z "$block_hex" ]]; then
    log_fail "${label}: could not parse block number from response"
    return
  fi

  block_dec="$(printf "%d" "$block_hex" 2>/dev/null)" || block_dec=0

  # Wait briefly and check again to confirm blocks are advancing
  sleep 2
  resp2="$(json_rpc "$url" "eth_blockNumber" 2>/dev/null)" || {
    log_fail "${label}: second eth_blockNumber RPC failed"
    return
  }
  block_hex2="$(echo "$resp2" | grep -o '"result":"[^"]*"' | head -1 | cut -d'"' -f4)"
  block_dec2="$(printf "%d" "$block_hex2" 2>/dev/null)" || block_dec2=0

  if (( block_dec2 > block_dec )); then
    log_ok "${label}: blocks advancing (${block_dec} → ${block_dec2}) — miner is active"
  elif (( block_dec > 0 )); then
    log_ok "${label}: current block ${block_dec} (${block_hex}) — chain has blocks"
  else
    log_fail "${label}: block number is 0 — miner may not be producing blocks yet"
  fi
}

check_besu_blocks "$BESU_RPC_0" "besu-validator-0"
check_besu_blocks "$BESU_RPC_1" "besu-validator-1"

# ── Step 3: Fabric — verify peer connectivity ───────────────────────
# NOTE: To verify channel membership, run:
#   docker exec fabric-peer-org1 peer channel list
# This requires a fully configured Fabric network with channels created.

log_info "=== Step 3: Fabric peer connectivity ==="

for pair in \
  "fabric-orderer:127.0.0.1:${FABRIC_ORDERER_PORT}" \
  "fabric-peer-org1:127.0.0.1:${FABRIC_PEER_ORG1_PORT}" \
  "fabric-peer-org2:127.0.0.1:${FABRIC_PEER_ORG2_PORT}"; do

  label="${pair%%:*}"
  hostport="${pair#*:}"
  host="${hostport%%:*}"
  port="${hostport##*:}"

  if nc -z "$host" "$port" 2>/dev/null; then
    log_ok "${label}: gRPC port ${port} is reachable"
  else
    log_fail "${label}: gRPC port ${port} is NOT reachable"
  fi
done

# ── Step 4: Corda — verify node connectivity ────────────────────────
# NOTE: For application-layer health, hit the node-info endpoint:
#   curl -sf http://127.0.0.1:10007/api/status
# This requires a Corda node with the webserver module enabled.

log_info "=== Step 4: Corda node connectivity ==="

for pair in \
  "corda-notary:127.0.0.1:${CORDA_NOTARY_PORT}" \
  "corda-partya:127.0.0.1:${CORDA_PARTYA_PORT}" \
  "corda-partyb:127.0.0.1:${CORDA_PARTYB_PORT}"; do

  label="${pair%%:*}"
  hostport="${pair#*:}"
  host="${hostport%%:*}"
  port="${hostport##*:}"

  if nc -z "$host" "$port" 2>/dev/null; then
    log_ok "${label}: P2P port ${port} is reachable"
  else
    log_fail "${label}: P2P port ${port} is NOT reachable"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────

echo ""
log_info "=== Smoke test summary ==="
printf "${GREEN}Passed: %d${NC}  ${RED}Failed: %d${NC}\n" "$pass" "$fail"

if (( fail > 0 )); then
  echo ""
  log_fail "Some checks failed. Run 'docker compose ps' and 'docker compose logs <service>' for details."
  exit 1
fi

log_ok "All smoke tests passed — local stack is healthy."
exit 0
