#!/usr/bin/env bash
# retry_sweep.sh — relaunch run_model.sh on all provisioned sweep VMs (warm retry)
set -uo pipefail
KEY="$HOME/.ssh/azure_eval_farm"
SWEEP_DIR="$HOME/persona-sweep"

# Fire all relaunches in parallel; each logs to run2.log.
# Forward EVAL_REPETITIONS / PERSONA_MATRIX_TIMEOUT_MINUTES when set so
# determinism retries (e.g. 3 reps, 150min ceiling) keep their settings;
# run_model.sh defaults both when absent.
ENV_PREFIX=""
if [ -n "${EVAL_REPETITIONS:-}" ]; then
  ENV_PREFIX="export EVAL_REPETITIONS='${EVAL_REPETITIONS}' "
fi
if [ -n "${PERSONA_MATRIX_TIMEOUT_MINUTES:-}" ]; then
  ENV_PREFIX="${ENV_PREFIX}export PERSONA_MATRIX_TIMEOUT_MINUTES='${PERSONA_MATRIX_TIMEOUT_MINUTES}' "
fi
if [ -n "$ENV_PREFIX" ]; then
  ENV_PREFIX="${ENV_PREFIX}&& "
fi
while IFS=: read -u 3 -r model ip; do
  echo "[retry] $model @ $ip"
  ( ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      -o ServerAliveInterval=30 -o ServerAliveCountMax=120 \
      -i "$KEY" "orcaeval@$ip" "${ENV_PREFIX}bash /tmp/run_model.sh '$model'" \
      > "$SWEEP_DIR/$model/run2.log" 2>&1 ) &
done 3< <(python3 - <<'PY'
import json, sys
from pathlib import Path
seen = {}
rows = []
for d in sorted(Path.home().glob("persona-sweep/*")):
    s = d / "status.json"
    if not s.exists():
        continue
    meta = json.loads(s.read_text())
    ip, model = meta.get("ip"), meta.get("model")
    if not ip:
        continue
    # One model per VM stack. Two eval stacks on one box OOM each other,
    # corrupt local ES, and wedge SSH — skip the duplicate loudly.
    if ip in seen:
        print(f"SKIP {model}: {ip} already owned by {seen[ip]}", file=sys.stderr)
        continue
    seen[ip] = model
    rows.append(f"{model}:{ip}")
print("\n".join(rows))
PY
)
wait
echo "=== all retries finished; per-model tails ==="
for d in "$SWEEP_DIR"/*/; do
  m=$(basename "$d")
  grep -h "=== DONE:" "$d/run2.log" 2>/dev/null | sed "s/^/  $m /" || echo "  $m: no DONE line"
done
