#!/usr/bin/env bash
#
# Seed (or cleanup) PCI compliance eval data on a dev Elasticsearch cluster.
#
# Usage:
#   ./scripts/seed_dev_cluster.sh              # seed data
#   ./scripts/seed_dev_cluster.sh --cleanup    # delete indices
#
# Auth resolution (in priority order):
#   1. Environment variables already exported in the current shell:
#        ES_URL                       — full Elasticsearch URL (required)
#        ES_API_KEY                   — base64-encoded API key (preferred)
#        ES_USERNAME / ES_PASSWORD    — basic auth (fallback)
#   2. .env file at the kibana repo root (resolved via `git rev-parse --show-toplevel`).
#      Same variable names as above.
#
# This follows the kibana-wide convention documented in the `first-class-ux`
# and `security-first` rules: API key over basic auth, standard variable
# names, no per-package .env files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Resolve the kibana repo root robustly. Falls back to a fixed traversal if
# the script ever runs outside a git checkout (e.g. extracted tarball).
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../../.." && pwd)"
fi

ENV_FILE="${REPO_ROOT}/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

ES_URL="${ES_URL:?ES_URL not set. Export it or define it in ${ENV_FILE}.}"

# Build a single -H "Authorization: …" header so the rest of the script does
# not have to branch between auth modes. API key beats basic auth.
declare -a AUTH_HEADER
if [[ -n "${ES_API_KEY:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: ApiKey ${ES_API_KEY}")
  AUTH_LABEL="ApiKey"
elif [[ -n "${ES_USERNAME:-}" && -n "${ES_PASSWORD:-}" ]]; then
  basic_token=$(printf '%s' "${ES_USERNAME}:${ES_PASSWORD}" | base64 | tr -d '\n')
  AUTH_HEADER=(-H "Authorization: Basic ${basic_token}")
  AUTH_LABEL="Basic ${ES_USERNAME}"
else
  echo "ERROR: no auth available. Set ES_API_KEY (preferred) or ES_USERNAME + ES_PASSWORD." >&2
  exit 1
fi

INDICES=(
  "logs-pci-auth-eval"
  "logs-pci-network-eval"
  "logs-pci-vuln-eval"
  "logs-pci-endpoint-eval"
  "logs-pci-custom-eval"
)

minute_ago() {
  local offset_min=$1
  if date --version >/dev/null 2>&1; then
    date -u -d "-${offset_min} minutes" '+%Y-%m-%dT%H:%M:%SZ'
  else
    date -u -v-"${offset_min}"M '+%Y-%m-%dT%H:%M:%SZ'
  fi
}

cleanup() {
  echo "Deleting PCI eval data streams..."
  for idx in "${INDICES[@]}"; do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH_HEADER[@]}" -X DELETE "${ES_URL}/_data_stream/${idx}")
    if [[ "$code" == "404" ]]; then
      code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH_HEADER[@]}" -X DELETE "${ES_URL}/${idx}?ignore_unavailable=true")
    fi
    echo "  $idx → HTTP $code"
  done
  echo "Done."
}

seed() {
  echo "Seeding PCI compliance eval data..."
  echo "  ES: $ES_URL"
  echo "  Auth: $AUTH_LABEL"
  echo ""

  # --- Auth index ---
  # Brute-force events: place well within the last hour (5–16 min ago) so a
  # "last hour" query always captures all 12, exceeding the >10 threshold.
  local auth_body=""
  for i in $(seq 0 11); do
    local ts
    ts=$(minute_ago $((5 + i)))
    auth_body+='{"create":{"_index":"logs-pci-auth-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"authentication","outcome":"failure","action":"user_login"},"user":{"name":"jdoe"},"source":{"ip":"192.168.1.100"}}
'
  done

  # Default/vendor account logins: keep well within the last hour (20–23 min ago).
  for pair in "20:admin:10.0.0.5" "21:root:10.0.0.6" "22:alice:10.0.0.7" "23:bob:10.0.0.8"; do
    IFS=: read -r offset user ip <<< "$pair"
    local ts
    ts=$(minute_ago "$offset")
    auth_body+='{"create":{"_index":"logs-pci-auth-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"authentication","outcome":"success","action":"user_login"},"user":{"name":"'"$user"'"},"source":{"ip":"'"$ip"'"}}
'
  done

  local ts
  ts=$(minute_ago 25)
  auth_body+='{"create":{"_index":"logs-pci-auth-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"iam","action":"password_change"},"user":{"name":"alice"},"source":{"ip":"10.0.0.7"}}
'
  ts=$(minute_ago 26)
  auth_body+='{"create":{"_index":"logs-pci-auth-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"iam","action":"mfa_enroll"},"user":{"name":"bob"},"source":{"ip":"10.0.0.8"}}
'

  echo "  Indexing auth events..."
  curl -s "${AUTH_HEADER[@]}" -X POST "${ES_URL}/_bulk?refresh=true" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary "$auth_body" | jq -r '"    errors: \(.errors), items: \(.items | length)"'

  # --- Network index ---
  local net_body=""
  local net_data=(
    "40:10.0.0.1:203.0.113.50:1.3:https"
    "39:10.0.0.2:203.0.113.51:1.0:https"
    "38:10.0.0.3:203.0.113.52:1.1:https"
    "37:10.0.0.4:198.51.100.10::http"
    "36:10.0.0.5:203.0.113.53:1.2:https"
    "35:10.0.0.6:203.0.113.54:1.3:https"
  )
  for entry in "${net_data[@]}"; do
    IFS=: read -r offset src dst tls_ver proto <<< "$entry"
    ts=$(minute_ago "$offset")
    if [[ -n "$tls_ver" ]]; then
      net_body+='{"create":{"_index":"logs-pci-network-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"network"},"source":{"ip":"'"$src"'"},"destination":{"ip":"'"$dst"'"},"tls":{"version":"'"$tls_ver"'"},"network":{"protocol":"'"$proto"'"}}
'
    else
      net_body+='{"create":{"_index":"logs-pci-network-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"network"},"source":{"ip":"'"$src"'"},"destination":{"ip":"'"$dst"'"},"network":{"protocol":"'"$proto"'"}}
'
    fi
  done

  echo "  Indexing network events..."
  curl -s "${AUTH_HEADER[@]}" -X POST "${ES_URL}/_bulk?refresh=true" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary "$net_body" | jq -r '"    errors: \(.errors), items: \(.items | length)"'

  # --- Vuln index ---
  local vuln_body=""
  ts=$(minute_ago 30)
  vuln_body+='{"create":{"_index":"logs-pci-vuln-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"vulnerability"},"vulnerability":{"id":"CVE-2024-5678","severity":"critical"},"host":{"name":"db-server-01"}}
'
  ts=$(minute_ago 29)
  vuln_body+='{"create":{"_index":"logs-pci-vuln-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"vulnerability"},"vulnerability":{"id":"CVE-2024-9999","severity":"high"},"host":{"name":"web-server-02"}}
'
  ts=$(minute_ago 28)
  vuln_body+='{"create":{"_index":"logs-pci-vuln-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"intrusion_detection","kind":"alert","action":"exploit_attempt"},"host":{"name":"web-server-02"}}
'
  ts=$(minute_ago 27)
  vuln_body+='{"create":{"_index":"logs-pci-vuln-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"intrusion_detection","kind":"alert","action":"port_scan"},"host":{"name":"web-server-03"}}
'

  echo "  Indexing vulnerability/IDS events..."
  curl -s "${AUTH_HEADER[@]}" -X POST "${ES_URL}/_bulk?refresh=true" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary "$vuln_body" | jq -r '"    errors: \(.errors), items: \(.items | length)"'

  # --- Endpoint index ---
  local ep_body=""
  ts=$(minute_ago 20)
  ep_body+='{"create":{"_index":"logs-pci-endpoint-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"malware","module":"endpoint","action":"malware_detected"},"host":{"name":"workstation-01"},"process":{"name":"suspicious.exe"}}
'
  ts=$(minute_ago 19)
  ep_body+='{"create":{"_index":"logs-pci-endpoint-eval"}}
{"@timestamp":"'"$ts"'","event":{"category":"process","module":"endpoint","action":"process_started"},"host":{"name":"workstation-02"},"process":{"name":"powershell.exe"}}
'

  echo "  Indexing endpoint events..."
  curl -s "${AUTH_HEADER[@]}" -X POST "${ES_URL}/_bulk?refresh=true" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary "$ep_body" | jq -r '"    errors: \(.errors), items: \(.items | length)"'

  # --- Custom legacy index ---
  local custom_body=""
  ts=$(minute_ago 25)
  custom_body+='{"create":{"_index":"logs-pci-custom-eval"}}
{"@timestamp":"'"$ts"'","username":"jsmith","src_ip":"172.16.0.1","auth_result":"pass","operation":"login","hostname":"app-01"}
'
  ts=$(minute_ago 24)
  custom_body+='{"create":{"_index":"logs-pci-custom-eval"}}
{"@timestamp":"'"$ts"'","username":"jdoe","src_ip":"172.16.0.2","auth_result":"fail","operation":"login","hostname":"app-01"}
'
  ts=$(minute_ago 23)
  custom_body+='{"create":{"_index":"logs-pci-custom-eval"}}
{"@timestamp":"'"$ts"'","hostname":"web-server-01","severity":"high","cve":"CVE-2024-1234","program":"nginx"}
'
  ts=$(minute_ago 22)
  custom_body+='{"create":{"_index":"logs-pci-custom-eval"}}
{"@timestamp":"'"$ts"'","username":"admin","src_ip":"172.16.0.3","auth_result":"pass","operation":"sudo","hostname":"db-01"}
'

  echo "  Indexing custom legacy events..."
  curl -s "${AUTH_HEADER[@]}" -X POST "${ES_URL}/_bulk?refresh=true" \
    -H 'Content-Type: application/x-ndjson' \
    --data-binary "$custom_body" | jq -r '"    errors: \(.errors), items: \(.items | length)"'

  echo ""
  echo "Done! Seeded all 5 PCI eval indices."
  echo ""
  echo "Indices:"
  for idx in "${INDICES[@]}"; do
    local count
    count=$(curl -s "${AUTH_HEADER[@]}" "${ES_URL}/${idx}/_count" | jq -r '.count // "N/A"')
    echo "  $idx → $count docs"
  done
}

case "${1:-}" in
  --cleanup|-c)
    cleanup
    ;;
  *)
    seed
    ;;
esac
