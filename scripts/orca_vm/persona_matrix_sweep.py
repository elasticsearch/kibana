#!/usr/bin/env python3
"""
persona_matrix_sweep.py — Azure D8s_v5 sweep controller for the proprietary
model matrix (persona-matrix suite, 21 examples / 7 categories / 3 variants).

Design (validated 2026-08-19/20 across 15 models):
- 1 VM per model. `evals start` parallelizes internally; tokens dominate cost,
  so wider fanout only multiplies boot-failure surface.
- VM boot: image orca-eval-base-v5 (Node 24.19.0, Kibana, repo, deploy keys).
- Per-model run: /tmp/run_model.sh — minimal proven path:
    stop → clean ES data → `evals start --profile local` (owns scout+CCM+
    readiness) → export scores to golden (252-doc completeness gate).
- deploy() overlays two patched files onto the VM's Kibana checkout:
    1. evaluate_dataset.ts with the load_skill {"skill":"<id>"} SkillInvoked
       matcher (PR #286165, cherry-picked into the evals-ext-matrix worktree)
    2. evals_security_persona_matrix scout config with server.maxPayload=50MB
       (PR #286201) — judge /internal/inference/prompt payloads exceed the
       1.6MB default on long trajectories.
  Both run from source via the dev CLI, so no build step is needed on the VM.
- Judge: defaults to EVAL_CONNECTOR_ID=eis-anthropic-claude-4-6-sonnet for ALL
  models (comparability; self-judging bias exists in the docs matrix too).
  Export EVAL_CONNECTOR_ID to override it for judge-panel runs; it is forwarded
  to every VM. run_model.sh swaps to an alternate judge if the override would
  self-judge the candidate.

Usage:
  python3 persona_matrix_sweep.py --models all          # full re-sweep
  python3 persona_matrix_sweep.py --models "eis-a,eis-b"
  python3 persona_matrix_sweep.py --status
  python3 persona_matrix_sweep.py --teardown            # delete orca-sweep-* VMs
"""
import argparse
import hashlib
import inspect
import json
import sys
import os
import re
import shlex
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Mapping, Optional
from pathlib import Path

SSH_KEY = os.path.expanduser("~/.ssh/azure_eval_farm")
SSH_USER = "orcaeval"
IMAGE = json.load(open(Path(__file__).parent / ".azure-state.json"))["imageId"]
RG = os.environ.get("SWEEP_RESOURCE_GROUP", "orca-eval-farm")
# Thinking-model sweeps (selfhost-qwen38 etc.) accumulate huge trace state in
# the Kibana dev server; D8s_v5 OOM-killed Kibana mid-run on all 3 shards
# (converse ECONNREFUSED after ~14 examples, 2026-09-05). Use D16s_v5 for
# selfhost models.
VM_SIZE = os.environ.get("SWEEP_VM_SIZE", "Standard_D8s_v5")
# Region and quota family for the pre-launch quota gate. The farm's cores are
# capped per family per region; D-series v5 sizes bill against the "standard
# DSv5 family" bucket, which is what filled to 344/350 on 2026-09-06.
REGION = os.environ.get("SWEEP_REGION", "eastus2")
QUOTA_FAMILY = os.environ.get("SWEEP_QUOTA_FAMILY", "standardDSv5Family")

# ---------------------------------------------------------------------------
# Suite profiles.
#
# This sweeper began as persona-matrix-only and hardcoded that suite in ~35
# places. AD and automatic-migrations need the same VM fan-out but differ in
# suite id, source overlays, and completeness gate, so the per-suite facts live
# here instead of being threaded through every call site.
#
# `overlays` is a list of (local_path_relative_to_worktree, remote_path) pairs.
# The persona-matrix entries are the historical PATCHED_* constants; the other
# suites deliberately start EMPTY -- the base image carries their sources, and
# inventing overlays we have not proven necessary would ship untested patches
# to 27 VMs. Add one only when a canary run shows it is needed.
# ---------------------------------------------------------------------------
SUITE_PROFILES = {
    "security-persona-matrix": {
        "cli_suite": "security-persona-matrix",
        "gate_suite_id": "security-persona-matrix",
        "vm_prefix": "orca-sweep",
        # 21 prompts x 7 categories x 3 variants
        "n_examples": 21,
        "gate": "exact",
    },
    "attack-discovery-agent-builder": {
        "cli_suite": "attack-discovery-agent-builder",
        "gate_suite_id": "attack-discovery-agent-builder",
        "vm_prefix": "orca-ad",
        # 10 datasets x 1 example each, MEASURED from a completed dense canary
        # (orca-base-builder-v7, feat/ad-dense-seed-profile @ 5303a12a6, 2026-09-10,
        # "10 passed (21.2m)"): 130 score docs over 10 datasets x 13 evaluators.
        # The 10th is the dense-profile spec (dense_profile_live_retrieval.spec.ts),
        # which seeds 95 alerts and runs live-retrieval; its final answer confirms
        # ~100 alerts analysed (4 chains, 16 rules, 194K input tokens) --
        # magnitude-comparable to the reference artifact's 95. Source-counting
        # src/dataset.ts gives 5 and misses the scenario-registry specs entirely.
        # REQUIRES orca-eval-base-v7 (baked from ad-dense merged with this branch):
        # v5 has no dense spec, so a v5 VM would emit 117 and fail this gate.
        "n_examples": 10,
        # Uniform grid (every dataset runs all 13 evaluators), so the
        # examples x evaluators product is exact.
        "gate": "exact",
        # The AD suite does NOT read PERSONA_MATRIX_SHARD: every shard VM runs
        # the full 9-dataset grid. Measured 2026-09-08: all 24 units exported
        # exactly 117 docs under per-shard execution_ids, and the gate read
        # 117/39 FAIL on complete data. With honors_shard False each unit is
        # gated on the full grid -- and shards act as independent repetitions,
        # which is what judge-stability analysis wants anyway.
        "honors_shard": False,
    },
    "security-persona-matrix-attack-discovery": {
        "cli_suite": "security-persona-matrix-attack-discovery",
        "gate_suite_id": "security-persona-matrix-attack-discovery",
        "vm_prefix": "orca-pmad",
        # attack_discovery.spec.ts: ONE example (generate API over the real
        # 95-alert GCS corpus). MEASURED on the 2026-09-10 smoke
        # (exec 5bd8fa4a589f4cf4, EVAL_EXIT=0): 8 docs = 8 evaluators
        # (AttackDiscoveryBasic, AttackDiscoveryRubric, Criteria, Latency,
        # Tool Calls, Input/Output/Cached Tokens) x 1 example x 1 rep.
        # Snapshot restore races Kibana's boot-time alerting init (dual
        # write-index alias) — the restore.ts overlay below carries the fix.
        "n_examples": 1,
        "gate": "exact",
        "honors_shard": False,
    },
    "security-automatic-migrations": {
        "cli_suite": "security-automatic-migrations",
        "gate_suite_id": "security-automatic-migrations",
        "vm_prefix": "orca-mig",
        # Each dataset carries a DIFFERENT evaluator count (measured on the
        # 2026-09-02 canary: standard-dashboards 7, qradar 9, splunk-spl 8),
        # so examples x evaluators is structurally wrong for this suite.
        # Gate on a floor measured from that canary run (86 docs) instead.
        "n_examples": None,
        "gate": "floor",
        "min_docs": 80,
    },
}

# Selected by --suite; mutated once in main() before any VM work.
SUITE = "security-persona-matrix"


def suite_profile(suite: Optional[str] = None) -> dict:
    name = suite or SUITE
    if name not in SUITE_PROFILES:
        raise KeyError(f"unknown suite {name!r}; known: {sorted(SUITE_PROFILES)}")
    return SUITE_PROFILES[name]


# Per-model env for run_model.sh. Slow reasoning models blow the default 30-min
# cap. Measured on golden (15 GLM runs, 2026-08-11..30): mean 341s per example,
# max 1198s. 21 examples therefore need ~119 min, so the old 60-min cap could
# never finish -- GLM has never exceeded 10/21 in three weeks of attempts.
# 180 min leaves headroom above the measured worst case without hiding a hang:
# a genuinely wedged run still dies on the per-request KBN_EVALS_HTTP_TIMEOUT_MS.
MODEL_ENV = {
    "eis-zai-glm-5-2": "PERSONA_MATRIX_TIMEOUT_MINUTES=180 PERSONA_MATRIX_CONCURRENCY=3",
    # GLM-5.3-flash via OpenRouter is the same slow class: measured ~4.8
    # min/example on a healthy run. A 3-example shard therefore needs ~15 min
    # of model work, but a shard that draws several slow examples plus retries
    # blew the 30-min suite default (run 8, "Test timeout of 1800000ms
    # exceeded" at attempt 2/3). 120 min per shard leaves headroom without
    # hiding a wedge: per-request KBN_EVALS_HTTP_TIMEOUT_MS still bounds a hang.
    "openrouter-zai-glm-5-3-flash": "PERSONA_MATRIX_TIMEOUT_MINUTES=120",
    "openrouter-deepseek-v4-pro": "PERSONA_MATRIX_TIMEOUT_MINUTES=120",
    # selfhost-qwen38 (A100 SGLang, 2xTP1 cells) is the slowest class in the
    # sweep: 7-example shard timed out at 120 min on sweep-13 attempt 1
    # (2026-09-06). 300 min covers the observed ~4.5 min/example with
    # headroom for retries. The per-request AGENT_BUILDER_INFERENCE_TIMEOUT_MS
    # (600s via run_model.sh) bounds a single-turn hang.
    "selfhost-qwen38": "PERSONA_MATRIX_TIMEOUT_MINUTES=300",
}
# Vars forwarded to every VM. EVAL_CONNECTOR_ID must stay here: run_model.sh only
# honours an override it actually receives, and otherwise re-derives its Anthropic
# default — a judge-panel sweep would then grade with the incumbent judge and still
# pass its doc-count gate.
FORWARDED_ENV_VARS = ("EVAL_REPETITIONS", "PERSONA_MATRIX_TIMEOUT_MINUTES", "EVAL_CONNECTOR_ID",
                      "KBN_EVALS_HTTP_RETRIES", "EVAL_SUITE", "PERSONA_MATRIX_SHARD",
                      "TEST_RUN_ID")
# Prefer the durable copy in ~/.elastic: /tmp is cleared by macOS and by
# routine cleanup, and a missing file here fails per-VM inside scp (every
# deploy dies, observed 2026-09-03) rather than once, up front.
GOLDEN_ENV_LOCAL = next(
    (p for p in (os.path.expanduser("~/.elastic/golden-cluster-env.sh"),
                 "/tmp/golden-cluster-env.sh") if os.path.isfile(p)),
    os.path.expanduser("~/.elastic/golden-cluster-env.sh"),
)
SWEEP_DIR = Path.home() / "persona-sweep"
KIBANA_MAIN = Path.home() / "Projects" / "kibana"


def _golden_env_local():
    """Parse the golden cluster env file once for driver-side queries."""
    env = {}
    try:
        with open(GOLDEN_ENV_LOCAL) as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("export "):
                    line = line[len("export "):]
                if "=" in line and not line.startswith("#"):
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        return None, None
    return env.get("GOLDEN_ES_URL"), env.get("GOLDEN_ES_API_KEY")


def _golden_post(path: str, body: str):
    """POST a query to golden from the driver. None when unreachable."""
    url, key = _golden_env_local()
    if not url or not key:
        return None
    try:
        return json.loads(subprocess.run(
            ["curl", "-sS", "-m", "60", "-H", f"Authorization: ApiKey {key}",
             f"{url}/.evaluation-scores/{path}",
             "-H", "Content-Type: application/json", "-d", body],
            capture_output=True, text=True, timeout=90,
        ).stdout)
    except Exception:
        return None


def _golden_datasets_local(exec_id: str):
    """Dataset ids written under an execution id, queried FROM THE DRIVER.

    Same rationale as _golden_count_local: units are parked before the gate
    runs, so this must not go over ssh. Returns None when golden is
    unreachable so the caller can distinguish "cannot verify" from "wrong".
    """
    res = _golden_post("_search", json.dumps({
        "size": 0,
        "query": {"term": {"metadata.execution_id": exec_id}},
        "aggs": {"ds": {"terms": {"field": "example.dataset.id", "size": 50}}},
    }))
    if res is None:
        return None
    try:
        return {b["key"] for b in res["aggregations"]["ds"]["buckets"]}
    except Exception:
        return None


def _golden_count_local(exec_id: str, phrase: bool = False):
    """Count docs for an execution id by querying golden FROM THE DRIVER.

    The gate used to run this over ssh on the eval VM, but units are parked
    ("[park] ... deallocating") as soon as the eval exits and before the gate
    runs, so the ssh lands on a deallocated host and returns nothing. That is
    indistinguishable from "no docs written" and failed 18/18 complete units as
    `docs=0/98` while golden actually held all 294 docs per model.

    Golden is reachable from the driver, so ask it directly. Returns None when
    the driver cannot reach golden, letting the caller fall back to the VM.
    """
    url, key = _golden_env_local()
    if not url or not key:
        return None
    op = "match_phrase" if phrase else "term"
    body = json.dumps({"query": {op: {"metadata.execution_id": exec_id}}})
    try:
        out = subprocess.run(
            ["curl", "-sS", "-m", "60", "-H", f"Authorization: ApiKey {key}",
             f"{url}/.evaluation-scores/_count",
             "-H", "Content-Type: application/json", "-d", body],
            capture_output=True, text=True, timeout=90,
        ).stdout
        return int(json.loads(out)["count"])
    except Exception:
        return None


# Patched sources overlaid onto each VM before the run.
PATCHED_EVALUATOR = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/evaluate_dataset.ts"
)
PATCHED_EVALUATOR_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-security-persona-matrix/src/evaluate_dataset.ts"
)
# Per-example failure isolation (PR #285833): without it one example's
# converse/judge 500 rejects Promise.all(runJobs) and aborts the whole
# experiment — three determinism runs died this way mid-suite. Overlay the
# patched executor client (+ its TaskRun.error type) so errored examples are
# recorded and the remaining measurements survive.
PATCHED_EXECUTOR_CLIENT = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/kibana_evals_executor/client.ts"
)
PATCHED_EXECUTOR_TYPES = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/types.ts"
)
EXECUTOR_CLIENT_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/"
    "kibana_evals_executor/client.ts"
)
EXECUTOR_TYPES_REMOTE = "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/types.ts"
# Transport retries. The base image predates the fix, so without this overlay a
# dropped connection still ends the whole suite: glm-5-2 lost 19 of 21 examples
# twice this way, the second time on a re-run that was supposed to carry the fix.
PATCHED_HTTP_HANDLER = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/utils/http_handler_from_kbn_client.ts"
)
HTTP_HANDLER_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/utils/"
    "http_handler_from_kbn_client.ts"
)
# Retry policy. The persona-matrix converse call goes through chat_client's
# withRetry (retry_utils), NOT the http handler above -- patching only the
# handler leaves the live path untouched and the run still dies on the first
# EIS 500. Deploy both or the fix is a no-op on the VM.
# chat_client itself must also ship: main's version has no withRetry wrapper
# (kbn-client retries=0 -> 'attempt=1/0' instant death) and no final-answer
# fallback for terse models. Without it the run is one transient away from
# a deterministic 14/42 shard failure.
PATCHED_CHAT_CLIENT = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/chat_client.ts"
)
CHAT_CLIENT_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-security-persona-matrix/src/chat_client.ts"
)
PATCHED_RETRY_UTILS = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/utils/retry_utils.ts"
)
# Trace-based evaluators. The VM checkout is main and predates the ES|QL index
# pattern fix, so its skill_invocation.ts interpolates an undefined constant and
# every SkillInvoked query hits `on indices [undefined]` -> security_exception.
# factory.ts owns TRACE_INDEX_PATTERN; skill_invocation.ts consumes it. Ship both
# or the consumer resolves the constant from the stale module.
PATCHED_TRACE_FACTORY = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/evaluators/trace_based/factory.ts"
)
TRACE_FACTORY_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/"
    "kbn-evals/src/evaluators/trace_based/factory.ts"
)
PATCHED_SKILL_INVOCATION = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/evaluators/trace_based/skill_invocation.ts"
)
SKILL_INVOCATION_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/"
    "kbn-evals/src/evaluators/trace_based/skill_invocation.ts"
)
# Every remaining trace_based evaluator. These build their own ES|QL and the
# VM's main checkout still hardcodes `FROM traces-*`, which resolves to zero
# authorized indices on the golden cluster and fails with
# `Unknown column [trace.id]` -- 51 errored docs per metric per model, read as
# "no tool calls" rather than a broken instrument. Ship the whole directory
# rather than naming files one at a time, so a new evaluator cannot be missed.
_TRACE_DIR_LOCAL = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/evaluators/trace_based"
)
_TRACE_DIR_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/"
    "kbn-evals/src/evaluators/trace_based"
)
TRACE_METRIC_FILES = ("latency.ts", "tokens.ts", "tool_calls.ts", "chat_calls.ts")
# The @kbn/evals barrel. evaluate_dataset.ts imports TRACE_INDEX_PATTERN from the
# package root, not from the module that defines it, so shipping factory.ts alone
# is not enough: the stale barrel has no such export and the import silently
# resolves to undefined at runtime (TS types come from the local checkout, so
# nothing fails until ES rejects `FROM undefined`).
PATCHED_EVALS_BARREL = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/index.ts"
)
EVALS_BARREL_REMOTE = "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/index.ts"
# The trace_based sub-barrel that the package root re-exports through.
PATCHED_TRACE_BARREL = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/evaluators/trace_based/index.ts"
)
TRACE_BARREL_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/"
    "kbn-evals/src/evaluators/trace_based/index.ts"
)
RETRY_UTILS_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/utils/retry_utils.ts"
)
# Dataset. The base image predates the entity_risk_score contract fix, so its
# pre-flight tool-availability check fails the whole suite before a single
# example runs (security.entity_risk_score is force-disabled under the skills
# flag this suite always enables).
PATCHED_DATASET = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/"
    "src/datasets/persona_matrix_prompts.ts"
)
DATASET_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-security-persona-matrix/src/datasets/persona_matrix_prompts.ts"
)
# evaluate_dataset.ts imports ./datasets/select_shard. The overlay copies an
# explicit file list, so a new module must be added here or the VM runs old
# code and dies at require time ("Cannot find module './datasets/select_shard'"
# -> "No tests found" -> 3 failed attempts, observed 2026-09-03).
PATCHED_SHARD = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/"
    "src/datasets/select_shard.ts"
)
SHARD_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-security-persona-matrix/src/datasets/select_shard.ts"
)
# AD golden-path replay join key (PR #285833): the frozen orca-eval-base
# image predates the fix that gives every golden-path scenario a
# `metadata.scenarioKey`. Without it the five golden-path slices record
# `example.id == "0"` and no join key, so their scores can never be
# replayed/rejudged -- exactly the defect this run exists to clear. The VM
# has no git checkout (it boots a baked image), so the fix can only reach it
# as an overlay.
PATCHED_AD_DATASET = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-attack-discovery-agent-builder/"
    "src/dataset.ts"
)
AD_DATASET_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-attack-discovery-agent-builder/src/dataset.ts"
)
PATCHED_SCOUT_CONFIG = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "src/platform/packages/shared/kbn-scout/src/servers/configs/config_sets/"
    "evals_security_persona_matrix/stateful/classic.stateful.config.ts"
)
# Detection-rule-edit skill (PR #285833): adds the final-answer contract to
# the skill checklist — 62% of detection-rule-edit runs in the 2026-08-21
# sweep ended on a tool call with no user-facing closing message. The base
# image predates the fix, so overlay it like the other patched sources.
PATCHED_RULE_SKILL = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/plugins/security_solution/server/agent_builder/"
    "skills/detection_rule_edit/index.ts"
)
PATCHED_RULE_SKILL_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/plugins/security_solution/server/"
    "agent_builder/skills/detection_rule_edit/index.ts"
)
# Scout readiness: PR #285302 makes SCOUT_READY_TIMEOUT_MS configurable; the
# orca-eval-base-v5 image predates it, so cold-boot rspack compile (303
# bundles) exceeds the hardcoded 180s and every VM fails before the eval
# starts. Overlay the patched eval_stack.ts so run_model.sh's 900s timeout
# actually applies. Sourced from THIS worktree (not scout-timeout-pr): it
# carries the timeout fix AND the agentBuilderTracingExporters pass-through
# (commit 13ad293e8f8a) — overlaying the older scout-timeout-pr copy silently
# dropped the golden trace exporter arg from the boot command (observed
# 2026-09-04: persona2 ran with no xpack.agentBuilder.tracing.exporters and
# golden received 0 spans despite the config/key being shipped).
PATCHED_EVAL_STACK = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/cli/eval_stack.ts"
)
# Playwright per-test timeout: the suite default is 30min, sized for a
# single-pass run. EVAL_REPETITIONS=3 runs die at the default (observed at
# example 7/21 after 30min); the overlaid config reads
# PERSONA_MATRIX_TIMEOUT_MINUTES so determinism runs can raise it.
PATCHED_PW_CONFIG = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/playwright.config.ts"
)
# Trace-evaluator retry budget (commit 1f4d2e2596dc): the 62s budget burned
# inside the OTel flush lag (~3-7 min), erroring Tool Calls/Tokens/Latency/
# SkillInvoked on every VM run. Overlaid like the other patched kbn-evals
# sources — the base image predates the fix.
PATCHED_TRACE_FACTORY = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/evaluators/trace_based/factory.ts"
)
TRACE_FACTORY_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/"
    "evaluators/trace_based/factory.ts"
)
# Golden trace export (regressed 2026-09-01): the base image's kbn-evals/scout
# sources predate agentBuilderTracingExporters support entirely (0 occurrences
# in profiles.ts / eval_stack.ts / classic.stateful.config.ts), so
# config.local.json's key is written but never read and Agent Builder spans
# only land on the VM's local Scout ES. Overlay all three files from this
# worktree so the golden OTLP exporter is appended during stack boot.
PATCHED_PROFILES = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/platform/packages/shared/kbn-evals/src/cli/profiles.ts"
)
PROFILES_REMOTE = (
    "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/cli/profiles.ts"
)
PATCHED_SCOUT_TRACING_CONFIG = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "src/platform/packages/shared/kbn-scout/src/servers/configs/"
    "config_sets/evals_tracing/stateful/classic.stateful.config.ts"
)
SCOUT_TRACING_CONFIG_REMOTE = (
    "Projects/kibana/src/platform/packages/shared/kbn-scout/src/servers/"
    "configs/config_sets/evals_tracing/stateful/classic.stateful.config.ts"
)
# Env seeds/tools seed/spec live in the matrix branch itself (merged as
# f85527ed "Unbreak failing columns", plus the tool-registration assert).
# Overlay from this worktree — the persona-matrix-env-truth worktree predates
# the assert and would silently drop it on the VM.
PATCHED_ENV_SEEDS = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/fixtures/env_seeds.ts"
)
PATCHED_TOOLS_SEED = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/fixtures/persona_matrix_tools_seed.ts"
)
PATCHED_SPEC = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/evals/persona_matrix.spec.ts"
)
# The spec imports the tool-registration assert added in f85527ed; the VM
# checkout predates it, so the module must ride along or the spec fails at
# require time ("Cannot find module '../src/fixtures/tool_registration_check'").
PATCHED_TOOL_CHECK = (
    KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/src/fixtures/tool_registration_check.ts"
)
FIXTURES_REMOTE_PREFIX = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-evals-suite-security-persona-matrix"
)
PATCHED_SCOUT_CONFIG_REMOTE = (
    "Projects/kibana/src/platform/packages/shared/kbn-scout/src/servers/configs/"
    "config_sets/evals_security_persona_matrix/stateful/classic.stateful.config.ts"
)

# Full sweep list: 15 re-runs (need correct SkillInvoked from the patched
# evaluator) + 5 frontier additions not in the published docs matrix.
# Skipped (deterministic, reproduced failures — re-running burns tokens for
# no new information):
#   eis-anthropic-claude-4-5-sonnet   — model emits load_skill({}) under full
#                                       agent context (3/3 repros; 4.6 passes)
#   eis-google-gemini-2-5-flash-lite  — "platform_core_load_skill called but
#                                       was not available" (2/2 repros)
MODELS = [
    # re-run with patched evaluator
    "eis-anthropic-claude-4-5-haiku",
    "eis-anthropic-claude-4-5-opus",
    "eis-anthropic-claude-4-6-sonnet",
    "eis-anthropic-claude-4-6-opus",
    "eis-anthropic-claude-4-7-opus",
    "eis-openai-gpt-5-2",
    "eis-openai-gpt-5-4",
    "eis-openai-gpt-5-4-mini",
    "eis-openai-gpt-5-4-nano",
    "eis-google-gemini-2-5-flash",
    "eis-google-gemini-2-5-pro",
    "eis-google-gemini-3-0-flash",
    "eis-google-gemini-3-1-flash-lite",
    "eis-google-gemini-3-1-pro",
    "eis-google-gemini-3-5-flash",
    # frontier additions (not in the published docs matrix)
    "eis-anthropic-claude-4-8-opus",
    "eis-anthropic-claude-5-sonnet",
    "eis-openai-gpt-5-5",
    "eis-zai-glm-5-2",
    # OpenRouter provider path: needs the on-VM SSE-normalizing proxy +
    # ES endpoint (run_model.sh openrouter- branch). GLM-5.3-flash is the
    # OSS-row candidate; 87.8 calls/example measured 2026-09-03 — pair it
    # with --shards 4, never single-stack.
    "openrouter-zai-glm-5-3-flash",
    # DeepSeek V4 Pro: OSS candidate #2 on the OpenRouter path. Canary
    # 2026-09-03: clean tool call, 1.7s round-trip (10x faster than GLM-5.3).
    # Same proxy + endpoint flow; --shards 4 to start.
    "openrouter-deepseek-v4-pro",
    # Self-hosted Qwen3.8-27B on the A100 (SGLang, 2×TP1 cells). Rides the
    # same on-VM proxy path with PROXY_UPSTREAM=public cell URL + bearer
    # from /tmp/selfhost.env (shipped by deploy()). Quality scorecard for
    # qwen38-local in OmniRoute combos; judge stays on EIS (different family).
    "selfhost-qwen38",
    # NOTE: gemini-3.7-flash exists only as an OpenRouter connector and needs
    # the proxy + ES JAR reasoning patch flow (kibana-evals skill
    # scripts/openrouter-proxy.py). It is NOT in the default sweep; run it as
    # a targeted follow-up.
]


# AD snapshot-restore fix: Kibana's boot-time alerting init recreates the
# Security alert index mid-restore, surfacing as either "open index ... already
# exists" or "alias [...] has more than one write index". The base image's
# restore.ts only retries the former. Sourced from THIS worktree (identical to
# fix/alerts-snapshot-restore-dual-write-retry 166f1a19aa28, off upstream/main).
# Without it the AD fan-out deterministically fails restore 3/3 attempts on a
# fresh-wipe VM (observed 2026-09-10 smoke v2); with it smoke v3 passed
# (EVAL_EXIT=0, exec 5bd8fa4a589f4cf4, 8/8 evaluators on golden).
PATCHED_RESTORE_TS = (
    KIBANA_MAIN.parent
    / "kibana.worktrees/evals-ext-matrix"
    / "x-pack/solutions/security/packages/kbn-security-evals-alerts-snapshot/src/restore.ts"
)
RESTORE_TS_REMOTE = (
    "Projects/kibana/x-pack/solutions/security/packages/"
    "kbn-security-evals-alerts-snapshot/src/restore.ts"
)
# GCS service-account JSON for the alerts snapshot
# (security-ai-datasets/attack-discovery/oh-my-malware-95-deduped). The scout
# evals_tracing config only registers the ES gcs client when GCS_CREDENTIALS
# is set — without it the AD spec skips restore and runs against a stale
# corpus. Durable copy in ~/.elastic; /tmp is wiped by macOS reboots.
GCS_CREDENTIALS_LOCAL = next(
    (p for p in (os.path.expanduser("~/.elastic/gcs-credentials.json"),
                 "/tmp/gcs_credentials.json") if os.path.isfile(p)),
    os.path.expanduser("~/.elastic/gcs-credentials.json"),
)

def is_sweep_resource(name: str) -> bool:
    """True when an Azure resource belongs to any suite's sweep VMs.

    Disk/NIC/public-IP/NSG names are all derived from the VM name, so every
    teardown pass must test the SAME set of prefixes. Hardcoding one prefix per
    pass is how a teardown reports success while another suite's disks keep
    billing.
    """
    return any(name.startswith(pf["vm_prefix"] + "-") for pf in SUITE_PROFILES.values())


def model_dir(model: str, suite: Optional[str] = None, shard: Optional[str] = None) -> Path:
    """Per-suite, per-model (per-shard) run directory.

    Namespaced by suite: the same model is swept for persona-matrix, AD and
    migrations, and a flat layout would let the second sweep overwrite the
    first one's run.log and status.json.

    Sharded runs get their own leaf for the same reason -- shard 2 would
    otherwise clobber shard 1's log and status. The "/" in a shard spec is
    replaced, not kept: a raw "2/4" would nest a directory (or escape the
    model dir) instead of naming one.
    """
    leaf = model if not shard else f"{model}-s{shard.replace('/', 'of')}"
    return SWEEP_DIR / (suite or SUITE) / leaf


def ssh(ip: str, cmd: str, timeout: int = 30) -> str:
    r = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR",
         "-o", f"ConnectTimeout={timeout}", "-i", SSH_KEY, f"{SSH_USER}@{ip}", cmd],
        capture_output=True, text=True, timeout=timeout + 15)
    return r.stdout.strip() + (("\n" + r.stderr.strip()) if r.stderr.strip() else "")


# ssh() returns 255 with empty output when the transport itself fails (host not
# accepting keys yet, connection reset mid-deploy). A caller that greps the
# result then cannot tell "the check ran and failed" from "the check never
# ran", and reports a content failure for a transport problem -- which is how
# a 2026-09-09 AD sweep skipped 6/6 units whose overlays were in fact correct
# (verified by hand on the same VMs minutes later).
def ssh_checked(ip: str, cmd: str, timeout: int = 30, attempts: int = 3) -> str:
    last = ""
    for attempt in range(attempts):
        r = subprocess.run(
            ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
             "-o", "LogLevel=ERROR",
             "-o", f"ConnectTimeout={timeout}", "-i", SSH_KEY, f"{SSH_USER}@{ip}", cmd],
            capture_output=True, text=True, timeout=timeout + 15)
        out = r.stdout.strip() + (("\n" + r.stderr.strip()) if r.stderr.strip() else "")
        # 255 is ssh's own transport failure; any other code is the remote
        # command's verdict and must be reported as-is.
        if r.returncode != 255:
            return out
        last = out
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(
        f"ssh transport to {ip} failed {attempts}x (last: {last!r}); "
        "refusing to report this as a content check result"
    )


def az(*args: str) -> str:
    """Run az with retry for transient 'content already consumed' errors."""
    r = subprocess.CompletedProcess([], 1, "", "")
    for attempt in range(3):
        r = subprocess.run(["az", *args], capture_output=True, text=True, timeout=300)
        if r.returncode == 0:
            return r.stdout.strip()
        if "already consumed" in r.stderr and attempt < 2:
            time.sleep(5)
            continue
        raise RuntimeError(f"az {' '.join(args)} failed: {r.stderr[:400]}")
    return r.stdout.strip()


def model_slug(model: str) -> str:
    """The human-readable model slug (used for Azure tags, never the VM name)."""
    return model.replace("eis-", "").replace(".", "-").replace("_", "-")


def vm_name(model: str, shard: Optional[str] = None) -> str:
    # Azure Linux VM names allow 64 chars. Do NOT truncate harder than that —
    # a [:24] truncation collided gemini-2-5-flash-lite onto gemini-2-5-flash's
    # VM (dirty ES → 409 dataset conflict).
    prefix = suite_profile()["vm_prefix"]
    # VM_NAME_SUFFIX isolates parallel sweeps of the same model (e.g. judge
    # A/B stability reruns). Without it two sweeps resolve the same VM names
    # and stomp each other's stacks.
    suffix_env = os.environ.get("VM_NAME_SUFFIX", "")
    if suffix_env:
        prefix = f"{prefix}-{suffix_env}"[:40]
    # JUDGE BLINDING: the VM name must NOT contain the model under test.
    # The sweep VM enrols into the eval cluster as a host entity, so a
    # model-derived hostname (orca-sweep-anthropic-claude-4-8-opus) was echoed
    # back inside agent answers on entity-analytics columns and read by the
    # LLM judges — the model identifying itself to its own grader. Hash instead;
    # the readable model lives in the `model` Azure tag (see provision()).
    digest = hashlib.sha1(model_slug(model).encode()).hexdigest()[:12]
    slug = f"m{digest}"
    # Shard suffix keeps each slice on its own box. Two eval stacks on one VM
    # OOM each other and corrupt local ES, so the suffix is load-bearing.
    # Truncate the MODEL slug, never the suffix: appending first and clamping
    # to 64 silently merges two shards onto one name (verified: a 64-char model
    # made s1of4 and s2of4 identical).
    if shard:
        suffix = f"-s{shard.replace('/', 'of')}"
        budget = 64 - len(prefix) - 1 - len(suffix)
        slug = f"{slug[:budget].rstrip('-')}{suffix}"
    return f"{prefix}-{slug}"[:64].rstrip("-")


def use_spot(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether to attempt a Spot create. Default OFF.

    Spot capacity for D8s_v5 in the farm region has been exhausted since
    2026-09-04; on 2026-09-06, 30 of 60 create attempts paid a failed Spot
    call plus retry backoff before falling back to Regular. Opt back in with
    SPOT_VM=1 once capacity returns.
    """
    env = os.environ if environ is None else environ
    return env.get("SPOT_VM", "0") == "1"


def park_on_done(environ: Optional[Mapping[str, str]] = None) -> bool:
    """Whether to deallocate a unit's VM once its golden gate is settled.

    Default ON: idle finished VMs held the cores that starved later units
    twice on 2026-09-06. PARK_ON_DONE=0 keeps VMs running for debugging.
    """
    env = os.environ if environ is None else environ
    return env.get("PARK_ON_DONE", "1") == "1"


def maybe_park_unit(model: str, shard: Optional[str] = None) -> bool:
    """Deallocate a finished unit's VM, freeing its cores. Returns True if parked.

    Deliberately bundles the PARK_ON_DONE check with the az call so the flag
    cannot drift away from the action it guards. Never raises: a failed park
    costs money, but must not fail an otherwise-good sweep.
    """
    if not park_on_done():
        return False
    try:
        az("vm", "deallocate", "-g", RG, "-n", vm_name(model, shard), "--no-wait")
        print(f"[park] {_label(model, shard)}: deallocating (cores freed)", flush=True)
        return True
    except Exception as exc:
        print(f"[park] {_label(model, shard)}: deallocate failed ({exc})", flush=True)
        return False


def cores_per_vm() -> int:
    """vCPU count for VM_SIZE, parsed from the size name (D8s_v5 -> 8)."""
    m = re.search(r"_[A-Z]+(\d+)", VM_SIZE)
    return int(m.group(1)) if m else 8


def quota_snapshot() -> tuple[int, int]:
    """Return (used, limit) regional vCPU cores for the VM family.

    Reads the live usage rather than trusting a VM count: deallocated VMs
    still exist but consume no cores, so counting `vm list` over-reports.
    """
    raw = json.loads(az("vm", "list-usage", "-l", REGION, "-o", "json"))
    family = QUOTA_FAMILY
    for entry in raw:
        if entry.get("name", {}).get("value") == family:
            return int(entry["currentValue"]), int(entry["limit"])
    raise RuntimeError(f"quota family {family} not found in {REGION}")


def quota_gate(units: int, used: int, limit: int, per_vm: int) -> tuple[bool, str]:
    """Decide whether `units` VMs fit in the remaining regional quota.

    Pure function so the sweep's failure mode is testable without Azure.
    Returns (ok, message). A sweep that does not fit must fail BEFORE
    provisioning: on 2026-09-06 a launch into 344/350 used cores burned
    ~10h, because `az vm create` reported QuotaExceeded as an unrelated
    CLI crash ("content for this response was already consumed") and the
    controller treated each failure as a per-VM skip rather than a stop.
    """
    need = units * per_vm
    free = limit - used
    if need <= free:
        return True, (
            f"quota ok: need {need} cores ({units}x{per_vm}), "
            f"free {free} of {limit}"
        )
    fits = free // per_vm if per_vm else 0
    return False, (
        f"QUOTA GATE: need {need} cores ({units}x{per_vm}) but only {free} "
        f"free of {limit} ({used} in use). At most {fits} unit(s) fit now. "
        f"Free cores first (--teardown-finished, or delete idle VMs), then "
        f"relaunch; do not launch into a full quota."
    )


def reusable_pool_vm(model: str, shard: Optional[str] = None) -> Optional[str]:
    """Return the name of an existing deallocated VM for this unit, if any.

    Warm-pool reuse: `az vm start` on a pre-baked deallocated VM is ~60-90s
    versus ~6-8min for create + cloud-init. Deallocated VMs hold no vCPU
    quota, so a parked pool costs disk only. WARM_POOL=0 disables.
    """
    if os.environ.get("WARM_POOL", "1") != "1":
        return None
    name = vm_name(model, shard)
    try:
        state = az("vm", "show", "-g", RG, "-n", name, "-d",
                   "--query", "powerState", "-o", "tsv").strip()
    except Exception:
        return None
    return name if state == "VM deallocated" else None


def provision(model: str, shard: Optional[str] = None) -> str:
    """Create a D8s_v5 VM; return its public IP.

    Reuses a parked (deallocated) VM of the same name when one exists,
    which skips image provisioning entirely.

    Priority: Regular by default. Spot capacity for D8s_v5 in the farm
    region has been exhausted since 2026-09-04 (surfacing as an az-cli
    crash that swallowed the error, costing 16/42 shards), and on
    2026-09-06 30 of 60 create attempts still paid a failed Spot call
    before falling back. SPOT_VM=1 opts back in; Spot failures continue
    to auto-fall back to Regular.
    """
    name = vm_name(model, shard)
    parked = reusable_pool_vm(model, shard)
    if parked:
        print(f"[provision] starting parked VM {parked}", flush=True)
        az("vm", "start", "-g", RG, "-n", parked)
        ip = json.loads(az("vm", "show", "-g", RG, "-n", parked, "-d",
                           "--query", "publicIps", "-o", "json"))
        if ip:
            return ip
        print(f"[provision] parked VM {parked} exposed no IP; creating fresh",
              flush=True)
    print(f"[provision] {name}", flush=True)
    spot = use_spot()

    def _create(priority: str) -> None:
        args = ["vm", "create", "-g", RG, "-n", name, "--image", IMAGE,
                "--size", VM_SIZE, "--admin-username", SSH_USER, "--ssh-key-values",
                os.path.expanduser("~/.ssh/azure_eval_farm.pub"),
                # The VM name is a blinding hash (see vm_name); keep the readable
                # model on a tag so teardown/debugging can still identify the box
                # without leaking the identity into cluster host entities.
                "--tags", f"model={model_slug(model)}",
                "--public-ip-sku", "Standard", "--os-disk-size-gb", "128", "--no-wait"]
        if priority == "Spot":
            args += ["--eviction-policy", "Deallocate", "--priority", "Spot"]
        az(*args)

    if spot:
        try:
            _create("Spot")
        except (SystemExit, RuntimeError) as e:
            print(f"[provision] spot create failed ({e}); retrying as Regular", flush=True)
            _create("Regular")
    else:
        _create("Regular")
    for _ in range(60):
        time.sleep(10)
        try:
            ip = json.loads(az("vm", "show", "-g", RG, "-n", name, "-d",
                               "--query", "publicIps", "-o", "json"))
            if ip:
                return ip
        except Exception:
            pass
    raise RuntimeError(f"no IP for {name}")


def wait_ssh(ip: str) -> bool:
    # A single successful `echo ok` is not readiness: cloud-init restarts sshd
    # after first accepting connections, so the very next scp/ssh can be reset
    # mid-deploy. Require consecutive successes so the deploy that follows runs
    # against a stably reachable host.
    streak = 0
    for _ in range(30):
        try:
            if "ok" in ssh(ip, "echo ok", timeout=10):
                streak += 1
                if streak >= 2:
                    return True
                time.sleep(3)
                continue
        except Exception:
            pass
        streak = 0
        time.sleep(10)
    return False


def scp(local: str, ip: str, remote: str) -> None:
    subprocess.run(
        ["scp", "-q", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR",
         "-i", SSH_KEY, local, f"{SSH_USER}@{ip}:{remote}"],
        check=True, timeout=120)


def deploy(ip: str) -> None:
    """Copy run assets + patched evaluator/scout config to the VM."""
    base = Path(__file__).parent
    ssh(ip, "mkdir -p ~/.elastic ~/persona-sweep")
    scp(GOLDEN_ENV_LOCAL, ip, "/tmp/golden-cluster-env.sh")
    scp(str(base / "run_model.sh"), ip, "/tmp/run_model.sh")
    scp(str(base / "export_scores.py"), ip, "/tmp/export_scores.py")
    # OpenRouter path (models named openrouter-*): on-VM SSE-normalizing proxy
    # + ES endpoint creator. Harmless for EIS models — run_model.sh only uses
    # them inside its openrouter- branch.
    scp(str(base / "openrouter_proxy.py"), ip, "/tmp/openrouter_proxy.py")
    scp(str(base / "create_openrouter_endpoint.py"), ip, "/tmp/create_openrouter_endpoint.py")
    # Self-hosted model env (selfhost-* models): upstream URL + bearer for the
    # on-VM proxy. Values come from local secrets; ship only when present so
    # EIS/OpenRouter-only runs need nothing extra.
    selfhost_env = base / ".selfhost.env"
    if selfhost_env.exists():
        scp(str(selfhost_env), ip, "/tmp/selfhost.env")
    # Omniroute judge route (.selfhost-judge.env): when EVAL_CONNECTOR_ID is a
    # selfhost-* judge (e.g. selfhost-omni-opus-5), run_model.sh synthesizes
    # its connector from these values (public omniroute URL + key). Ship only
    # when present so EIS-judge runs need nothing extra.
    judge_env = base / ".selfhost-judge.env"
    if judge_env.exists():
        scp(str(judge_env), ip, "/tmp/judge.env")
    # Matrix config carries the OpenRouter API model ids (matchIds) that the
    # connectors cache does NOT. The VM's Kibana checkout is main, not this
    # branch — it lacks the persona-matrix suite entirely, so ship the config.
    matrix_cfg = base.parent.parent / (
        "x-pack/solutions/security/packages/kbn-evals-suite-security-persona-matrix/"
        "persona_matrix.config.json")
    scp(str(matrix_cfg), ip, "/tmp/persona_matrix.config.json")
    # AD suite: GCS dataset credentials + the dual-write restore fix. Both are
    # no-ops for persona-matrix runs (restore.ts is only imported by suites
    # that restore snapshots; GCS creds are only read by the AD spec).
    if SUITE == "security-persona-matrix-attack-discovery":
        scp(GCS_CREDENTIALS_LOCAL, ip, "/tmp/gcs_credentials.json")
        scp(str(PATCHED_RESTORE_TS), ip, RESTORE_TS_REMOTE)
    scp(os.path.expanduser("~/.elastic/eis-connectors-cache.json"), ip,
        ".elastic/eis-connectors-cache.json")
    scp(os.path.expanduser("~/.elastic/eis-ccm-key.json"), ip,
        ".elastic/eis-ccm-key.json")
    # Overlay the patched SkillInvoked evaluator (PR #286165) and the 50MB
    # maxPayload scout config (PR #286201). The eval runs from TS source via
    # the dev CLI, so copying the files is sufficient — no build step.
    persona_only = SUITE == "security-persona-matrix"
    if persona_only:
        scp(str(PATCHED_EVALUATOR), ip, PATCHED_EVALUATOR_REMOTE)
        scp(str(PATCHED_SCOUT_CONFIG), ip, PATCHED_SCOUT_CONFIG_REMOTE)
    # Per-example failure isolation — see PATCHED_EXECUTOR_CLIENT.
    scp(str(PATCHED_EXECUTOR_CLIENT), ip, EXECUTOR_CLIENT_REMOTE)
    scp(str(PATCHED_EXECUTOR_TYPES), ip, EXECUTOR_TYPES_REMOTE)
    scp(str(PATCHED_HTTP_HANDLER), ip, HTTP_HANDLER_REMOTE)
    scp(str(PATCHED_RETRY_UTILS), ip, RETRY_UTILS_REMOTE)
    scp(str(PATCHED_TRACE_FACTORY), ip, TRACE_FACTORY_REMOTE)
    scp(str(PATCHED_SKILL_INVOCATION), ip, SKILL_INVOCATION_REMOTE)
    for _f in TRACE_METRIC_FILES:
        scp(str(_TRACE_DIR_LOCAL / _f), ip, f"{_TRACE_DIR_REMOTE}/{_f}")
    scp(str(PATCHED_TRACE_BARREL), ip, TRACE_BARREL_REMOTE)
    scp(str(PATCHED_EVALS_BARREL), ip, EVALS_BARREL_REMOTE)
    scp(str(PATCHED_CHAT_CLIENT), ip, CHAT_CLIENT_REMOTE)
    _gate = ssh(
        ip,
        f"grep -c withRetry ~/{CHAT_CLIENT_REMOTE}; "
        f"grep -c messageSource ~/{CHAT_CLIENT_REMOTE}",
    )
    try:
        _counts = [int(x) for x in _gate.split()]
    except ValueError:
        _counts = [0, 0]
    if len(_counts) != 2 or _counts[0] < 1 or _counts[1] < 1:
        raise RuntimeError(
            f"chat_client overlay did not land on {ip} (withRetry/messageSource "
            f"missing): {_gate!r} -- VM would run main's retries=0 converse path"
        )
    scp(str(PATCHED_TRACE_FACTORY), ip, TRACE_FACTORY_REMOTE)
    # Inference-endpoint timeout overlay: the executor's hard-coded 180s
    # requestTimeout kills thinking-model (selfhost-qwen38) turns; the
    # overlaid executor honors AGENT_BUILDER_INFERENCE_TIMEOUT_MS (600000
    # via run_model.sh).
    INFERENCE_EXECUTOR_REMOTE = (
        "Projects/kibana/x-pack/platform/plugins/shared/inference/server/"
        "chat_complete/utils/inference_endpoint_executor.ts"
    )
    INFERENCE_EXECUTOR_LOCAL = (
        KIBANA_MAIN.parent / "kibana.worktrees/evals-ext-matrix"
        / "x-pack/platform/plugins/shared/inference/server/chat_complete/"
        "utils/inference_endpoint_executor.ts"
    )
    scp(str(INFERENCE_EXECUTOR_LOCAL), ip, INFERENCE_EXECUTOR_REMOTE)
    scp(str(PATCHED_PROFILES), ip, PROFILES_REMOTE)
    scp(str(PATCHED_SCOUT_TRACING_CONFIG), ip, SCOUT_TRACING_CONFIG_REMOTE)
    if persona_only:
        # Every import evaluate_dataset.ts pulls from ./datasets must exist
        # locally before we ship it. A missing file used to surface only on
        # the VM as "No tests found" after three full stack boots.
        for _src in (PATCHED_DATASET, PATCHED_SHARD):
            if not Path(_src).is_file():
                raise FileNotFoundError(f"overlay source missing: {_src}")
        scp(str(PATCHED_DATASET), ip, DATASET_REMOTE)
        scp(str(PATCHED_SHARD), ip, SHARD_REMOTE)
    if SUITE == "attack-discovery-agent-builder":
        # See PATCHED_AD_DATASET: without this the run produces another
        # generation of unreplayable golden-path scores.
        if not Path(PATCHED_AD_DATASET).is_file():
            raise FileNotFoundError(f"overlay source missing: {PATCHED_AD_DATASET}")
        if "scenarioKey" not in Path(PATCHED_AD_DATASET).read_text():
            raise RuntimeError(
                f"{PATCHED_AD_DATASET} has no scenarioKey; overlaying it would "
                "produce unreplayable golden-path scores"
            )
        scp(str(PATCHED_AD_DATASET), ip, AD_DATASET_REMOTE)
        _ad_seen = ssh_checked(ip, f"grep -c scenarioKey ~/{AD_DATASET_REMOTE} || true").strip()
        if _ad_seen in ("", "0"):
            raise RuntimeError(
                f"AD dataset overlay did not land on {ip} (scenarioKey absent "
                f"from {AD_DATASET_REMOTE}); the run would emit golden-path "
                "scores that cannot be rejudged"
            )
    # Scout-readiness timeout overlay (PR #285302) — see PATCHED_EVAL_STACK.
    EVAL_STACK_REMOTE = (
        "Projects/kibana/x-pack/platform/packages/shared/kbn-evals/src/cli/eval_stack.ts"
    )
    scp(str(PATCHED_EVAL_STACK), ip, EVAL_STACK_REMOTE)
    # Playwright timeout overlay: default 30min dies mid-run at 3 repetitions
    # (21 examples × 3 reps ≈ 90min; observed death at example 7/21).
    PW_CONFIG_REMOTE = (
        "Projects/kibana/x-pack/solutions/security/packages/"
        "kbn-evals-suite-security-persona-matrix/playwright.config.ts"
    )
    if persona_only:
        scp(str(PATCHED_PW_CONFIG), ip, PW_CONFIG_REMOTE)
        scp(str(PATCHED_RULE_SKILL), ip, PATCHED_RULE_SKILL_REMOTE)
    # Env-truth fixtures (PR #286421): seeds + idempotent tool reinstall + spec wiring.
    if persona_only:
        ssh(ip, f"mkdir -p ~/{FIXTURES_REMOTE_PREFIX}/src/fixtures ~/{FIXTURES_REMOTE_PREFIX}/evals")
        scp(str(PATCHED_ENV_SEEDS), ip, f"{FIXTURES_REMOTE_PREFIX}/src/fixtures/env_seeds.ts")
        scp(str(PATCHED_TOOLS_SEED), ip, f"{FIXTURES_REMOTE_PREFIX}/src/fixtures/persona_matrix_tools_seed.ts")
        scp(str(PATCHED_SPEC), ip, f"{FIXTURES_REMOTE_PREFIX}/evals/persona_matrix.spec.ts")
        scp(str(PATCHED_TOOL_CHECK), ip, f"{FIXTURES_REMOTE_PREFIX}/src/fixtures/tool_registration_check.ts")
        out = ssh(ip, f"grep -q seedPersonaMatrixEnvironment ~/{FIXTURES_REMOTE_PREFIX}/evals/persona_matrix.spec.ts && "
                      f"grep -q assertPersonaMatrixToolsRegistered ~/{FIXTURES_REMOTE_PREFIX}/src/fixtures/tool_registration_check.ts && "
                      f"echo ENVSEEDS_OK")
        if "ENVSEEDS_OK" not in out:
            raise RuntimeError(f"env-truth overlay verification failed on {ip}: {out}")
    infra_checks = [
        f"grep -q SCOUT_READY_TIMEOUT_MS ~/{EVAL_STACK_REMOTE}",
        f"grep -q erroredRuns ~/{EXECUTOR_CLIENT_REMOTE}",
        f"grep -q getStatusCode ~/{RETRY_UTILS_REMOTE}",
        f"grep -q 'retries: 8' ~/{TRACE_FACTORY_REMOTE}",
        "grep -q AGENT_BUILDER_INFERENCE_TIMEOUT_MS ~/Projects/kibana/x-pack/platform/plugins/shared/inference/server/chat_complete/utils/inference_endpoint_executor.ts",
        f"grep -q agentBuilderTracingExporters ~/{PROFILES_REMOTE}",
        f"grep -q agentBuilderTracingExporters ~/{SCOUT_TRACING_CONFIG_REMOTE}",
        # Agent Builder strips gen_ai.tool.call.arguments/.result from every tool
        # span unless this uiSetting is on (default false, for privacy). Without
        # it SkillInvoked matches nothing and scores 0 for EVERY model -- which
        # reads as models not invoking skills rather than a missing attribute.
        # Observed 2026-09-04..06: 8,339 load_skill spans on sweep VMs with 0
        # arguments, vs 3,953/3,953 populated on Buildkite CI.
        f"grep -q 'agentBuilder:tracing:includeToolDetails=true' ~/{SCOUT_TRACING_CONFIG_REMOTE}",
        # The stale main checkout resolves TRACE_INDEX_PATTERN to undefined, so
        # every SkillInvoked ES|QL query runs `FROM undefined` and dies with a
        # security_exception on `indices [undefined]` — which reads as a missing
        # privilege, not stale code. Assert the constant is exported AND that the
        # consumer interpolates it (a literal `FROM traces-*` is the old form).
        f"grep -q \"export const TRACE_INDEX_PATTERN = 'traces-\\*,.ds-traces-\\*'\" ~/{TRACE_FACTORY_REMOTE}",
        f"grep -q 'FROM ${{TRACE_INDEX_PATTERN}}' ~/{SKILL_INVOCATION_REMOTE}",
        # The barrel is the binding the suite actually imports: without this the
        # constant is undefined at runtime even when factory.ts is correct.
        f"grep -q TRACE_INDEX_PATTERN ~/{EVALS_BARREL_REMOTE}",
        f"grep -q TRACE_INDEX_PATTERN ~/{TRACE_BARREL_REMOTE}",
        # Every metric evaluator must interpolate the constant. The stale main
        # form is a literal `FROM traces-*`, which resolves to zero authorized
        # indices on golden and errors with `Unknown column [trace.id]`.
        *[
            f"! grep -q 'FROM traces-\\*' ~/{_TRACE_DIR_REMOTE}/{_f}"
            for _f in TRACE_METRIC_FILES
        ],
    ]
    persona_checks = [
        f"grep -q skillPredicate ~/{PATCHED_EVALUATOR_REMOTE}",
        f"grep -q MAX_PAYLOAD_BYTES ~/{PATCHED_SCOUT_CONFIG_REMOTE}",
        f"grep -q FinalAnswerPresent ~/{PATCHED_EVALUATOR_REMOTE}",
        # Without this forward every stored answer looks like a real closing
        # turn, even when it is the fallback to an interior reasoning step:
        # 0 of 2422 Sep-4+ detection-rule-edit docs carried the tag (2026-09-07).
        f"grep -q 'messageSource: response.messageSource' ~/{PATCHED_EVALUATOR_REMOTE}",
        f"grep -q 'NEVER finish the turn' ~/{PATCHED_RULE_SKILL_REMOTE}",
    ]
    checks = infra_checks + (persona_checks if persona_only else [])
    out = ssh_checked(ip, " && ".join(checks) + " && echo OVERLAY_OK")
    if "OVERLAY_OK" not in out:
        # A bare `&&` chain reports nothing about WHICH clause failed, so the
        # error used to read "verification failed on <ip>: " with an empty
        # tail -- indistinguishable from a transport problem. Re-run the
        # clauses individually to name the actual offender.
        failed = []
        for _c in checks:
            try:
                if "CLAUSE_OK" not in ssh_checked(ip, _c + " && echo CLAUSE_OK"):
                    failed.append(_c)
            except RuntimeError as exc:  # transport died mid-diagnosis
                failed.append(f"{_c} (transport: {exc})")
        raise RuntimeError(
            f"patched overlay verification failed on {ip}: "
            f"{len(failed)}/{len(checks)} clause(s) failed: {failed or out!r}"
        )
    print(f"[deploy] assets + patched evaluator/config on {ip}", flush=True)


def build_env_prefix(model: str, environ: Optional[Mapping[str, str]] = None) -> str:
    """Shell prefix exporting every forwarded var for one model's remote run.

    Forward every per-model var (plus any process-env override) rather than a
    hardcoded pair: a var added to MODEL_ENV but missing from this list is a
    silent no-op that looks like a tuning fix and changes nothing. EVAL_CONNECTOR_ID
    belongs here so judge-panel runs actually reach the VM — without it run_model.sh
    silently re-derives its own Anthropic default and the sweep answers the wrong
    question while passing every gate.
    """
    environ = os.environ if environ is None else environ
    model_env = dict([kv.split("=", 1) for kv in MODEL_ENV.get(model, "").split()]) if MODEL_ENV.get(model) else {}
    prefix = ""
    for key in sorted({*model_env, *FORWARDED_ENV_VARS}):
        value = environ.get(key, model_env.get(key, ""))
        if value:
            prefix += f"export {key}={shlex.quote(value)} && "
    return prefix


def check_expected_datasets(seen: set, expected: set) -> Optional[str]:
    """Reject a run whose docs landed under datasets the sweep did not ask for.

    A doc-count gate cannot catch running the WRONG SUITE. Measured 2026-09-09:
    `--suite security-automatic-migrations` passed 8/8 units at docs=86/80 while
    writing every doc under standard-dashboards / qradar / splunk-spl -- none of
    which are the board's migrations columns (those come from the separate
    `agent-builder` suite). The floor gate was structurally blind to it: 86 >= 80
    holds no matter which datasets produced the 86.

    Returns None when the run is acceptable, else a human-readable reason.
    """
    if not expected:
        return None  # no declared identity -> nothing to assert against
    if not seen:
        return "no dataset ids observed in golden"
    unexpected = seen - expected
    missing = expected - seen
    parts = []
    if unexpected:
        parts.append("unexpected datasets " + ",".join(sorted(unexpected)))
    if missing:
        parts.append("missing datasets " + ",".join(sorted(missing)))
    return "; ".join(parts) or None


def self_test() -> int:
    """Offline checks for the pure helpers, run via `--self-test` in the verify
    manifest. Covers the two defects that made a judge-panel sweep lie: a dropped
    EVAL_CONNECTOR_ID (graded with the incumbent judge, still passed its gate) and
    a dead Scout stack reported as `list index out of range`.
    """
    failures = []

    def check(name, got, want):
        if got != want:
            failures.append(f"{name}: expected {want!r}, got {got!r}")

    # A doc-count gate cannot catch a wrong-suite run: the mig2 sweep passed
    # 8/8 at docs=86/80 while writing three datasets the board never plots.
    _MIG = {"05fd1e03-0e35-5abf-bfc6-c07118da0b28", "07a6c75d-7b4b-5150-ab32-7b66a93ac910"}
    check("wrong-suite datasets rejected",
          bool(check_expected_datasets({"4de2d8a5-x", "03855b50-y"}, _MIG)), True)
    # Isolate the unexpected-only path: a superset covers every expected dataset
    # (so `missing` is empty) and must STILL fail on the extra one. Without this
    # case, deleting the unexpected-check entirely still passed the suite --
    # the wrong-suite test above was passing via `missing`, not `unexpected`.
    check("extra dataset alone fails",
          "unexpected datasets" in (check_expected_datasets(_MIG | {"da87a6b7-z"}, _MIG) or ""),
          True)
    check("exact dataset match accepted",
          check_expected_datasets(set(_MIG), _MIG), None)
    check("partial coverage reported",
          "missing datasets" in (check_expected_datasets({"05fd1e03-0e35-5abf-bfc6-c07118da0b28"}, _MIG) or ""),
          True)
    check("empty golden rejected", check_expected_datasets(set(), _MIG),
          "no dataset ids observed in golden")
    # No declared identity must stay permissive: suites predating the gate
    # (persona, AD) have no expected-set and must not start failing.
    check("undeclared identity stays permissive",
          check_expected_datasets({"anything"}, set()), None)

    # ssh_checked must distinguish a transport failure from a content verdict.
    # Reporting exit-255-with-empty-output as "checks failed" skipped 6/6 units
    # of an AD sweep whose overlays were correct (2026-09-09).
    import unittest.mock as _mock

    def _fake_run(rc, out=""):
        return lambda *a, **k: subprocess.CompletedProcess([], rc, out, "")

    with _mock.patch.object(subprocess, "run", _fake_run(0, "OVERLAY_OK")):
        check("content pass returned", ssh_checked("1.2.3.4", "true"), "OVERLAY_OK")
    with _mock.patch.object(subprocess, "run", _fake_run(1, "")):
        check("content failure returned, not raised", ssh_checked("1.2.3.4", "false"), "")
    with _mock.patch.object(subprocess, "run", _fake_run(255, "")), \
            _mock.patch.object(time, "sleep", lambda *_: None):
        _raised = False
        try:
            ssh_checked("1.2.3.4", "true", attempts=2)
        except RuntimeError:
            _raised = True
        check("transport failure raises", _raised, True)

    # wait_ssh must not return on a single lucky echo: cloud-init bounces sshd.
    _seq = ["ok", "", "ok", "ok"]
    with _mock.patch.object(sys.modules[__name__], "ssh", lambda *a, **k: _seq.pop(0)), \
            _mock.patch.object(time, "sleep", lambda *_: None):
        check("wait_ssh needs a streak", wait_ssh("1.2.3.4"), True)
        check("wait_ssh consumed the flap", _seq, [])

    m = "eis-anthropic-claude-4-7-opus"
    env = {"EVAL_REPETITIONS": "3", "EVAL_CONNECTOR_ID": "eis-google-gemini-3-1-pro"}
    prefix = build_env_prefix(m, env)
    check("judge forwarded", "export EVAL_CONNECTOR_ID=eis-google-gemini-3-1-pro && " in prefix, True)
    check("reps forwarded", "export EVAL_REPETITIONS=3 && " in prefix, True)
    check("no empty exports", "= &&" in prefix, False)
    check("absent var omitted", "PERSONA_MATRIX_TIMEOUT_MINUTES" in build_env_prefix(m, {}), False)
    # Per-model defaults still apply, and the process env wins over them.
    glm = "eis-zai-glm-5-2"
    check("model default kept", "PERSONA_MATRIX_CONCURRENCY=3" in build_env_prefix(glm, {}), True)
    check(
        "env overrides model default",
        "export PERSONA_MATRIX_TIMEOUT_MINUTES=240 && " in build_env_prefix(
            glm, {"PERSONA_MATRIX_TIMEOUT_MINUTES": "240"}
        ),
        True,
    )
    # Shell-quoting: a value with a space must not split into two words.
    check("value quoted", "'a b'" in build_env_prefix(m, {"EVAL_CONNECTOR_ID": "a b"}), True)

    # --- quota gate -------------------------------------------------------
    # The 2026-09-06 incident in one assertion: 23 units x 8 cores against
    # 344/350 used must REFUSE, not launch and fail per-VM hours later.
    ok_full, msg_full = quota_gate(23, 344, 350, 8)
    check("gate refuses full quota", ok_full, False)
    check("gate names the shortfall", "184 cores" in msg_full, True)
    check("gate reports what fits", "At most 0 unit(s)" in msg_full, True)
    # Exactly-fits must pass: an off-by-one here would block valid sweeps.
    check("gate allows exact fit", quota_gate(2, 334, 350, 8)[0], True)
    check("gate allows headroom", quota_gate(23, 64, 350, 8)[0], True)
    # One core short must refuse.
    check("gate refuses one short", quota_gate(2, 335, 350, 8)[0], False)
    check("gate zero units ok", quota_gate(0, 350, 350, 8)[0], True)

    saved_size = globals()["VM_SIZE"]
    try:
        globals()["VM_SIZE"] = "Standard_D8s_v5"
        check("cores from size", cores_per_vm(), 8)
        globals()["VM_SIZE"] = "Standard_D16s_v5"
        check("cores from larger size", cores_per_vm(), 16)
    finally:
        globals()["VM_SIZE"] = saved_size

    # --- spot / park defaults ---------------------------------------------
    # Spot must default OFF: capacity has been exhausted since 2026-09-04 and
    # every attempt costs a failed create plus backoff before falling back.
    check("spot off by default", use_spot({}), False)
    check("spot opt-in honoured", use_spot({"SPOT_VM": "1"}), True)
    # Parking must default ON: idle finished VMs caused both quota exhaustions.
    check("park on by default", park_on_done({}), True)
    check("park opt-out honoured", park_on_done({"PARK_ON_DONE": "0"}), False)

    # --- spot / park wiring (az verbs, not just flags) ---------------------
    # Stub az so the self-test asserts what would REALLY be sent to Azure.
    # Flag-only assertions let a correct default drift away from an unwired
    # call site; these bind the decision to the command.
    saved_az = globals()["az"]
    calls: list = []
    try:
        globals()["az"] = lambda *a: calls.append(a) or "[]"

        calls.clear()
        os.environ["PARK_ON_DONE"] = "1"
        parked = maybe_park_unit("eis-openai-gpt-5-4")
        check("park issues deallocate", parked, True)
        check("park verb is deallocate", calls and calls[0][:2] == ("vm", "deallocate"), True)
        check("park does not delete", any(c[1] == "delete" for c in calls), False)

        calls.clear()
        os.environ["PARK_ON_DONE"] = "0"
        check("park opt-out issues nothing", maybe_park_unit("eis-openai-gpt-5-4"), False)
        check("park opt-out silent", len(calls), 0)
        os.environ.pop("PARK_ON_DONE", None)

        # provision(): Spot must not be attempted unless opted in. Asserting on
        # the create args catches an unwired flag that a default check misses.
        saved_pool = os.environ.get("WARM_POOL")
        os.environ["WARM_POOL"] = "0"  # skip the parked-VM lookup
        try:
            def _fake_az(*a):
                calls.append(a)
                # vm show -d --query publicIps: return an IP to end provision()
                return '"10.0.0.1"' if a[:2] == ("vm", "show") else "[]"

            globals()["az"] = _fake_az
            calls.clear()
            os.environ.pop("SPOT_VM", None)
            provision("eis-openai-gpt-5-4")
            creates = [c for c in calls if c[:2] == ("vm", "create")]
            check("one create by default", len(creates), 1)
            check("no spot priority by default", any("Spot" in c for c in creates), False)

            calls.clear()
            os.environ["SPOT_VM"] = "1"
            provision("eis-openai-gpt-5-4")
            creates = [c for c in calls if c[:2] == ("vm", "create")]
            check("spot opt-in sends Spot", any("Spot" in c for c in creates), True)
            os.environ.pop("SPOT_VM", None)
        finally:
            if saved_pool is None:
                os.environ.pop("WARM_POOL", None)
            else:
                os.environ["WARM_POOL"] = saved_pool
    finally:
        globals()["az"] = saved_az

    # --- warm pool --------------------------------------------------------
    # WARM_POOL=0 must short-circuit before any az call, so a sweep can always
    # force fresh VMs when a parked box is suspect.
    saved_warm = os.environ.get("WARM_POOL")
    try:
        os.environ["WARM_POOL"] = "0"
        check("warm pool opt-out", reusable_pool_vm("eis-openai-gpt-5-4"), None)
    finally:
        if saved_warm is None:
            os.environ.pop("WARM_POOL", None)
        else:
            os.environ["WARM_POOL"] = saved_warm

    # --- suite port -------------------------------------------------------
    # Every check below pins a defect that would otherwise cost real VM time or
    # silently grade the wrong suite.
    global SUITE
    saved = SUITE
    try:
        # VM names must not collide across suites: same model, two sweeps.
        SUITE = "security-persona-matrix"
        persona_vm = vm_name("eis-openai-gpt-5-4")
        SUITE = "attack-discovery-agent-builder"
        ad_vm = vm_name("eis-openai-gpt-5-4")
        check("vm names differ per suite", persona_vm != ad_vm, True)
        check("ad vm prefix", ad_vm.startswith("orca-ad-"), True)
        check("vm name length", len(ad_vm) <= 64, True)

        # Teardown must claim every suite's resources, or they keep billing.
        check("teardown claims persona", is_sweep_resource(persona_vm + "_OsDisk"), True)
        check("teardown claims ad", is_sweep_resource(ad_vm + "_OsDisk"), True)
        SUITE = "security-automatic-migrations"
        check("teardown claims migrations",
              is_sweep_resource(vm_name("eis-openai-gpt-5-4") + "-nic"), True)
        check("teardown ignores foreign", is_sweep_resource("unrelated-vm_OsDisk"), False)

        # Run dirs are namespaced, so a second suite cannot clobber the first.
        SUITE = "security-persona-matrix"
        d1 = model_dir("eis-openai-gpt-5-4")
        SUITE = "attack-discovery-agent-builder"
        d2 = model_dir("eis-openai-gpt-5-4")
        check("model dirs differ per suite", d1 != d2, True)

        # EVAL_SUITE must reach the VM: without it run_model.sh falls back to
        # persona-matrix and grades the wrong suite while its gate still passes.
        check("EVAL_SUITE forwarded", "EVAL_SUITE" in FORWARDED_ENV_VARS, True)
        prefix = build_env_prefix("eis-openai-gpt-5-4", {"EVAL_SUITE": "attack-discovery-agent-builder"})
        check("EVAL_SUITE exported",
              "export EVAL_SUITE=attack-discovery-agent-builder && " in prefix, True)

        # Doc-count gate: expected docs are per-suite, counted from the datasets.
        check("persona n_examples", SUITE_PROFILES["security-persona-matrix"]["n_examples"], 21)
        check("ad n_examples", SUITE_PROFILES["attack-discovery-agent-builder"]["n_examples"], 10)
        # AD ignores PERSONA_MATRIX_SHARD (measured 2026-09-08: 24/24 units
        # exported the full 117-doc grid under per-shard execution_ids), so
        # its gate must not slice the expectation by shard.
        check("ad gate not shard-sliced",
              SUITE_PROFILES["attack-discovery-agent-builder"].get("honors_shard", True), False)
        check("persona gate still shard-sliced",
              SUITE_PROFILES["security-persona-matrix"].get("honors_shard", True), True)
        # Migrations has no uniform grid -- per-dataset evaluator counts are
        # 7 (standard-dashboards) / 9 (qradar) / 8 (splunk-spl), measured on the
        # 2026-09-02 canary -- so examples x evaluators is structurally wrong.
        # It gates on a floor measured from that run (86 docs) instead.
        check("migrations gate is floor",
              SUITE_PROFILES["security-automatic-migrations"]["gate"], "floor")
        check("migrations floor set",
              SUITE_PROFILES["security-automatic-migrations"]["min_docs"] > 0, True)

        # Sharding: PERSONA_MATRIX_SHARD must reach the VM, or run_model.sh runs
        # all 21 examples on every shard and the sweep still reports complete.
        # Assert on build_env_prefix output, not list membership: membership
        # passes even if the builder never consults FORWARDED_ENV_VARS.
        check("shard var forwarded to VM",
              "export PERSONA_MATRIX_SHARD=2/4 && " in
              build_env_prefix("m", {"PERSONA_MATRIX_SHARD": "2/4"}), True)
        # Shard sizes must match the suite's stride assignment and sum to the
        # whole dataset -- an off-by-one here FAILs a good run or passes a short one.
        shard_sizes = [len(range(i, 21, 4)) for i in range(4)]
        check("shard sizes stride 21/4", shard_sizes, [6, 5, 5, 5])
        check("shard sizes sum to dataset", sum(shard_sizes), 21)
        check("shard sizes balanced", max(shard_sizes) - min(shard_sizes) <= 1, True)

        # Shard fanout: each (model, shard) needs its OWN VM name and run dir.
        # A shared name would put two eval stacks on one box (they OOM each
        # other and corrupt local ES) or overwrite the sibling's run.log.
        check("shard vm names differ",
              vm_name("eis-openai-gpt-5-4", "1/4") != vm_name("eis-openai-gpt-5-4", "2/4"), True)

        # JUDGE BLINDING — the VM name enrols as a host entity in the eval
        # cluster, so a model-derived name lets the model identify itself to
        # its own LLM judge. Measured: 14 agent answers echoed
        # `orca-sweep-anthropic-claude-4-8-opus` back into judged text.
        for _m in ["eis-anthropic-claude-4-8-opus", "anthropic-claude-4.8-opus",
                   "eis-openai-gpt-5-4", "z-ai/glm-5.3-flash", "google-gemini-3-1-pro"]:
            _n = vm_name(_m).lower()
            for _token in ["anthropic", "claude", "openai", "gpt", "gemini",
                           "google", "glm", "qwen", "kimi", "opus", "sonnet", "haiku"]:
                check(f"vm name blinds {_token!r} for {_m}", _token in _n, False)
        check("blinded name is still deterministic",
              vm_name("eis-openai-gpt-5-4"), vm_name("eis-openai-gpt-5-4"))
        check("distinct models get distinct blinded names",
              vm_name("eis-openai-gpt-5-4") != vm_name("eis-openai-gpt-5-5"), True)
        check("eis- prefix does not fork the blinded name",
              vm_name("eis-openai-gpt-5-4"), vm_name("openai-gpt-5-4"))
        check("blinded sharded names stay distinct",
              vm_name("eis-openai-gpt-5-4", "1/4") != vm_name("eis-openai-gpt-5-4", "2/4"), True)
        check("unsharded vm name unchanged",
              vm_name("eis-openai-gpt-5-4"), vm_name("eis-openai-gpt-5-4", None))
        check("shard vm name within azure 64-char limit",
              len(vm_name("openrouter-qwen-qwen3-8-27b-longer-name-here", "10/16")) <= 64, True)
        # A model slug long enough to fill the 64-char budget must still yield
        # distinct per-shard names -- appending the suffix before clamping made
        # s1of4 and s2of4 identical and put two stacks on one VM.
        _long = "openrouter-some-really-long-vendor-name-with-many-segments-here-x"
        check("long model name still shards distinctly",
              vm_name(_long, "1/4") != vm_name(_long, "2/4"), True)
        check("long sharded name still within limit", len(vm_name(_long, "1/4")) <= 64, True)
        check("shard run dirs differ",
              model_dir("m", shard="1/4") != model_dir("m", shard="2/4"), True)
        check("unsharded run dir unchanged", model_dir("m"), model_dir("m", shard=None))
        # "/" in a shard spec must not create a nested path or escape the dir.
        check("shard dir has no slash from spec",
              "/" not in model_dir("m", shard="2/4").name, True)

        # --shards fanout: unit expansion decides how many VMs boot.
        def _units(models, shards):
            if shards == 1:
                return [(m, None) for m in models]
            return [(m, f"{i}/{shards}") for m in models for i in range(1, shards + 1)]

        check("shards=1 keeps one unit per model", _units(["a", "b"], 1),
              [("a", None), ("b", None)])
        check("shards=1 leaves shard None (back-compat vm names)",
              vm_name("a", _units(["a"], 1)[0][1]), vm_name("a"))
        check("shards=4 expands to 4 VMs per model", len(_units(["a", "b"], 4)), 8)
        check("every expanded unit is unique", len(set(_units(["a", "b"], 4))), 8)
        check("expanded shards cover 1..N", sorted(str(s) for _, s in _units(["a"], 3)),
              ["1/3", "2/3", "3/3"])
        # Slices must partition the dataset exactly: a stride that dropped or
        # double-counted an example silently changes what the matrix measures.
        _n = SUITE_PROFILES["security-persona-matrix"]["n_examples"]
        _covered = sorted(i for idx in range(1, 5) for i in range(idx - 1, _n, 4))
        check("4 shards partition all 21 examples exactly", _covered, list(range(_n)))

        # The 2026-09-03 smoke run died on every VM because evaluate_dataset.ts
        # imported ./datasets/select_shard and the overlay never shipped it.
        # Parse the real imports and require an overlay entry for each.
        _overlaid = {Path(p).name for p in (PATCHED_DATASET, PATCHED_SHARD)}
        _ed = Path(PATCHED_EVALUATOR)
        if _ed.is_file():
            _imports = set(re.findall(r"from '\./datasets/([a-z_]+)'", _ed.read_text()))
            _missing = {f"{i}.ts" for i in _imports} - _overlaid
            check("every ./datasets import is in the VM overlay", sorted(_missing), [])
            check("overlay actually parsed some imports", len(_imports) > 0, True)

        # Shards must not share a TEST_RUN_ID: execution_id derives from it,
        # and a shared id made shard 2/2 count shard 1/2's docs (154 vs a 140
        # gate) instead of only its own slice.
        check("shard run ids differ",
              shard_run_id("sweep-1", "1/2") != shard_run_id("sweep-1", "2/2"), True)
        check("shard run id keeps the sweep base",
              shard_run_id("sweep-1", "1/2").startswith("sweep-1"), True)
        check("unsharded run id untouched", shard_run_id("sweep-1", None), "sweep-1")
        check("shard run id has no slash",
              "/" not in shard_run_id("sweep-1", "2/4"), True)
        # Testing shard_run_id alone is a false green: deleting launch()'s
        # assignment left every check passing while both VMs shared an id.
        # Assert the wiring by reading launch()'s own source.
        _launch_src = inspect.getsource(launch)
        check("launch assigns a per-shard TEST_RUN_ID",
              'env["TEST_RUN_ID"] = shard_run_id(' in _launch_src, True)
        check("TEST_RUN_ID reaches the VM",
              "export TEST_RUN_ID=sweep-1-s1of2 && " in
              build_env_prefix("m", {"TEST_RUN_ID": shard_run_id("sweep-1", "1/2")}), True)
        # The gate's "latest execution for this model" lookup must be pinned to
        # the shard's own run id. Unpinned, it returned whichever shard wrote
        # last and both shards gated against one id (154 vs a 140 gate) --
        # every earlier check still passed while the sweep stayed broken.
        _gate_src = inspect.getsource(check_golden)
        check("gate builds the shard's own execution id",
              'shard_run_id(os.environ.get("TEST_RUN_ID", ""), shard)' in _gate_src, True)
        # The gate's own count query must not use .keyword either. The guard below
        # only covers the resume probe, so this trap shipped here undetected and
        # failed a complete 98-doc shard as docs=0/98.
        _gate_code = "\n".join(
            l for l in _gate_src.splitlines() if not l.lstrip().startswith("#")
        )
        check("gate count does not use the .keyword suffix",
              "metadata.execution_id.keyword" not in _gate_code, True)
        # The field has no usable partial matching: a .keyword prefix and a
        # match_phrase on the run id both returned 0 docs against golden while
        # the full id returned 154. Never reintroduce a partial match here.
        check("gate does not prefix-match execution_id",
              'prefix": {"metadata.execution_id' not in _gate_src, True)
        # The latest-execution lookup must match ANY spelling of the model id,
        # never the single stored_id string. The VM's local index holds the
        # display name ("anthropic-claude-4.5-haiku") while golden holds the
        # connector id ("eis-anthropic-claude-4-5-haiku"); a term on the local
        # display name matched only the stale reference artifact (117 docs) and
        # false-FAILed three dense canaries as docs=117/130 while golden held
        # 130 under the fresh exec.
        check("latest-execution lookup matches any model-id spelling",
              "_score_id_candidates(model)" in _gate_code and
              '{"term": {"task.model.id": stored_id}}' not in _gate_code, True)
        check("sharded gate skips the latest-execution lookup",
              "if exec_id is None:" in _gate_src, True)
        check("ad gate is exact",
              SUITE_PROFILES["attack-discovery-agent-builder"]["gate"], "exact")

        # --- resume probe (run 13 postmortem) -------------------------------
        # Three independent bugs made resume a silent no-op for runs 9-13; each
        # one alone re-ran all 21 examples on every retry while looking healthy.
        _rm = (Path(__file__).parent / "run_model.sh").read_text()

        # 1. Score docs live on GOLDEN. Local scout ES is wiped by the retry and
        #    is empty at exactly the moment resume reads it.
        _fn = _rm[_rm.index("scored_example_ids() {"):_rm.index("for attempt in 1 2 3; do")]
        # The SCORED-SET query must hit golden. A local-ES read is still
        # legitimate for deriving the run id (TEST_RUN_ID is absent from this
        # shell), so assert on the scoring query itself rather than banning
        # every localhost:9220 mention.
        _score_q = _fn.split("RUN_ID\" ] ||")[-1]
        check("resume probe scores against golden, not local scout ES",
              "localhost:9220" not in _score_q and "GOLDEN_ES_URL" in _score_q, True)

        # 2. metadata.execution_id is ALREADY keyword-mapped. Verified against
        #    golden: term on the bare field -> 98 docs; on .keyword -> 0.
        # Strip comments first: the function documents the .keyword trap in a
        # comment, and a naive substring check flags its own documentation.
        _fn_code = "\n".join(
            l for l in _fn.splitlines() if not l.lstrip().startswith("#")
        )
        check("resume probe does not use the .keyword suffix",
              "metadata.execution_id.keyword" not in _fn_code, True)

        # 3. Flush must PRECEDE the golden query, else it reads an empty index,
        #    returns "", and skips the flush that would have populated it.
        # .find() not .index(): a missing marker must FAIL the check, not raise
        # and abort the whole self-test before the remaining guards run.
        _flush_at = _rm.find("flushing partial scores")
        _query_at = _rm.find('DONE_IDS="$(scored_example_ids)"')
        check("resume flushes to golden before querying it",
              _flush_at >= 0 and _query_at >= 0 and _flush_at < _query_at, True)

        # Unknown suite must fail loudly rather than silently sweeping persona.
        try:
            suite_profile("no-such-suite")
            check("unknown suite rejected", False, True)
        except KeyError:
            pass
    finally:
        SUITE = saved

    # No persona-matrix identity may survive anywhere in the file: the gate
    # resolved "latest execution" by a hardcoded persona-matrix dataset UUID,
    # so on an AD/migrations run it counted the model's OLD persona-matrix
    # execution (294 docs) and compared it to the new suite's expectation.
    # The sweep read as FAIL while the real run was fine -- and would have
    # read as PASS if the numbers had happened to line up.
    src = Path(__file__).read_text()
    check("no hardcoded dataset uuid", ("f2db90e6-cb7f" + "-58f2-b862-1b69e47f6a77") in src, False)
    for suite_id in SUITE_PROFILES:
        check(f"gate scopes to {suite_id}", suite_profile(suite_id)["gate_suite_id"], suite_id)

    print(f"self-test: {len(failures)} failure(s)")
    for f in failures:
        print(f"  FAIL {f}")
    return 1 if failures else 0


def shard_run_id(base: str, shard: Optional[str]) -> str:
    """Per-shard TEST_RUN_ID.

    execution_id is derived from TEST_RUN_ID. Shards that share one id also
    share an execution_id, so each shard's golden gate counts every other
    shard's docs (shard 2/2 read 154 against a 140 gate). Suffixing keeps the
    slices independently countable while staying traceable to one sweep.
    """
    if not shard:
        return base
    return f"{base}-s{shard.replace('/', 'of')}"


def launch(ip: str, model: str, shard: Optional[str] = None) -> subprocess.Popen:
    log = model_dir(model, shard=shard) / "run.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["EVAL_SUITE"] = suite_profile()["cli_suite"]
    # Suite reads PERSONA_MATRIX_SHARD for its example stride; per-VM value.
    if shard:
        env["PERSONA_MATRIX_SHARD"] = shard
        # execution_id derives from TEST_RUN_ID. Left unset, every shard VM
        # computes the SAME id, so each shard's golden gate counts all the
        # other shards' docs too (observed: shard 2/2 read 154 docs against a
        # 140 gate because shard 1/2's 154 landed under one id). A per-shard
        # run id keeps the slices independently countable.
        base = env.get("TEST_RUN_ID") or f"sweep-{int(time.time())}"
        env["TEST_RUN_ID"] = shard_run_id(base, shard)
    # Detach on the VM: the eval runs 30-60+ min and holding one long SSH
    # stream is fragile — mid-run stream death (rc 255) previously killed the
    # controller's view while the eval kept running (observed 2026-09-03:
    # every shard FAILED with an unparseable scores response while node/evals
    # was alive on the VM). run_model.sh writes /tmp/unit.done + .rc when it
    # finishes; we poll those over short-lived SSH connections instead.
    run_cmd = (
        f"rm -f /tmp/unit.done /tmp/unit.rc; "
        f"{build_env_prefix(model, env)}nohup bash /tmp/run_model.sh {model} "
        f"> /tmp/unit-run.log 2>&1 < /dev/null & echo launched"
    )
    return subprocess.Popen(
        ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
         "-o", "LogLevel=ERROR",
         "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=60",
         "-i", SSH_KEY, f"{SSH_USER}@{ip}", run_cmd],
        stdout=open(log, "w"), stderr=subprocess.STDOUT)


def _score_id_candidates(canon: str) -> list:
    """Connector ids hyphenate versions (claude-4-5, glm-5-2). Score docs
    dot some (anthropic-claude-4.5-sonnet) and keep hyphens on others
    (zai-glm-5-2), so never assume one spelling -- try both.

    The EIS connector runs write task.model.id WITH the "eis-" prefix and
    hyphenated ("eis-anthropic-claude-4-5-haiku"), while the reference
    artifact the board recreates wrote it WITHOUT the prefix and dotted
    ("anthropic-claude-4.5-haiku"). task.model.id is keyword-mapped so a
    match_phrase is exact: dropping the prefix left only the stale reference
    exec (117 docs) in scope and gated the fresh 130-doc run against it
    (2026-09-10 dense canary FAIL 117/130). Emit every prefix x version."""
    bare = canon[4:] if canon.startswith("eis-") else canon
    dotted = re.sub(r"(?<=[0-9])-(?=[0-9])", ".", bare)
    core = [bare] if dotted == bare else [dotted, bare]
    out = []
    for c in core:
        out.append(c)
        out.append("eis-" + c)
    return out


def _resolve_from_golden(model: str, ip: str) -> dict:
    """Recover stored_id and evaluator count from golden.

    The VM-local index is empty when a run exports straight to golden, which
    is not proof the eval produced nothing. Connector ids hyphenate semantic
    versions while score docs dot them, so match a phrase instead of
    reconstructing the id.
    """
    canon = model
    # id spelling varies per vendor, so match any candidate
    body = {
        "size": 0,
        "query": {"bool": {"must": [
            {"bool": {"should": [
                {"match_phrase": {"task.model.id": c}}
                for c in _score_id_candidates(canon)
            ], "minimum_should_match": 1}},
            {"term": {"metadata.suite_id": suite_profile()["gate_suite_id"]}},
        ]}},
        "aggs": {
            "m": {"terms": {"field": "task.model.id", "size": 1}},
            "n": {"cardinality": {"field": "evaluator.name"}},
        },
    }
    fb_q = json.dumps(body)
    out = ssh(
        ip,
        f"source /tmp/golden-cluster-env.sh; printf '%s' '{fb_q}' > /tmp/q_fb.json; "
        f'curl -sS -H "Authorization: ApiKey $GOLDEN_ES_API_KEY" '
        f'"$GOLDEN_ES_URL/.evaluation-scores/_search" '
        f"-H 'Content-Type: application/json' --data @/tmp/q_fb.json",
    )
    try:
        res = json.loads(out.splitlines()[-1])
        buckets = res["aggregations"]["m"]["buckets"]
        if not buckets:
            return {"error": "no docs on golden for this model either"}
        return {
            "stored_id": buckets[0]["key"],
            "n_evaluators": int(res["aggregations"]["n"]["value"]),
        }
    except Exception as exc:
        return {"error": f"golden fallback failed: {exc}"}


def check_golden(model: str, ip: str, shard: Optional[str] = None) -> dict:
    """Completeness gate: docs on golden for this model's LATEST execution.

    Connector IDs use hyphens for semantic versions while score docs use dots,
    so resolve the stored ID from the VM's clean local score index instead of
    guessing with string replacement. The count is scoped to the newest
    `metadata.execution_id` for the model — a model-level count accumulates
    across executions and false-FAILs any model with recent history.

    Expected size is derived, not hardcoded: 21 examples x evaluator count x
    EVAL_REPETITIONS, with the evaluator count read from the local index so
    adding an evaluator (e.g. FinalAnswerPresent) doesn't silently skew the
    gate. (The local index holds evaluator docs only — task output rides on
    those docs' `task.output` — so there is no +1 task doc term.)
    """
    resolve_cmd = (
        "curl -sf -u elastic:changeme 'http://localhost:9220/.evaluation-scores/"
        "_search?size=1&_source=task.model.id' -H 'Content-Type: application/json' "
        "--data '{\"query\":{\"match_all\":{}}}'"
    )
    try:
        raw = ssh(ip, resolve_cmd).strip()
    except Exception as exc:
        return {"count": -1, "error": f"ssh failed while reading local scores index: {exc}"}
    if not raw:
        # curl -sf prints nothing when the endpoint refuses the connection, so an
        # empty body means the Scout stack is down (or never booted) rather than
        # an empty index. Say that, instead of an IndexError from splitlines()[-1]
        # surfacing as a misleading "cannot read local scores index".
        return {
            "count": -1,
            "error": (
                "no response from local scores index on "
                f"{ip}:9220 — Scout ES/Kibana is not reachable (check EVAL_EXIT "
                "and the stack boot log; the eval likely died before scoring)"
            ),
        }
    try:
        local = json.loads(raw.splitlines()[-1])
        hits = local["hits"]["hits"]
    except Exception as exc:
        return {"count": -1, "error": f"cannot parse local scores index response: {exc}"}
    if not hits:
        # A run that exports straight to golden leaves the VM-local index
        # empty. That is not proof the eval produced nothing, so resolve
        # the same two facts from golden and let the doc-count gate below
        # deliver the verdict.
        fallback = _resolve_from_golden(model, ip)
        if fallback.get("error"):
            return {"count": 0, "error": fallback["error"]}
        stored_id = fallback["stored_id"]
        n_evaluators = fallback["n_evaluators"]
    else:
        stored_id = hits[0]["_source"]["task"]["model"]["id"]
        n_evaluators = None

    if n_evaluators is None:
        eval_count_cmd = (
            "curl -sf -u elastic:changeme 'http://localhost:9220/.evaluation-scores/"
            "_search?size=0' -H 'Content-Type: application/json' --data "
            "'{\"aggs\":{\"n\":{\"cardinality\":{\"field\":\"evaluator.name\"}}}}'"
        )
        try:
            local2 = json.loads(ssh(ip, eval_count_cmd).splitlines()[-1])
            n_evaluators = int(local2["aggregations"]["n"]["value"])
        except Exception as exc:
            return {"count": -1, "error": f"cannot count local evaluators: {exc}"}

    # With sharding, several VMs run the SAME model against the same suite and
    # each writes its own execution_id. A "latest for this model" lookup then
    # returns whichever shard finished last, and every shard gates against that
    # one id -- shard 2/2 counted shard 1/2's 154 docs against its 140 gate.
    #
    # execution_id is "<run id>::<suite>::<model>" and the field does NOT
    # support partial matching: a prefix on .keyword and a match_phrase on the
    # run id both return 0 docs (verified against golden). Only the full id
    # matches, so build it rather than filtering the "latest" lookup.
    if shard:
        _run_id = shard_run_id(os.environ.get("TEST_RUN_ID", ""), shard)
        # Build the id from the connector id the caller passed (`model`), NOT
        # `stored_id`. The VM's local index holds the model's display name in
        # `task.model.id` ("anthropic-claude-4.5-haiku") while golden writes
        # docs under the connector id ("eis-anthropic-claude-4-5-haiku").
        # Gating on the display name returned 0/98 for 12/12 wave-2 batch B
        # units that had in fact written 98 docs each (verified: eis- form 98,
        # dotted form 0).
        exec_id = f"{_run_id}::{suite_profile()['gate_suite_id']}::{model}"
    else:
        exec_id = None
    _latest_must = [
        {
            "bool": {
                "should": [
                    {"term": {"task.model.id": c}} for c in _score_id_candidates(model)
                ],
                "minimum_should_match": 1,
            }
        },
        {"term": {"metadata.suite_id": suite_profile()["gate_suite_id"]}},
    ]
    latest_cmd_q = json.dumps({
        "size": 1,
        "_source": ["metadata.execution_id"],
        "sort": [{"@timestamp": {"order": "desc"}}],
        "query": {"bool": {"must": _latest_must}},
    })
    # NOTE: cmd is passed to ssh as a single argv (no local shell), so the
    # remote shell is the ONLY quoting layer — use plain double quotes.
    # Backslash-escaped \" lands as a literal quote, splits the header on its
    # space, and curl then treats "ApiKey" as a URL (2026-08-22 v3 gate
    # failure: "Could not resolve host: ApiKey").
    # A sharded run already knows its exact execution_id, so skip the lookup
    # entirely -- querying "latest for this model" would just re-introduce the
    # cross-shard collision this function exists to avoid.
    if exec_id is None:
        out = ssh(
            ip,
            f"source /tmp/golden-cluster-env.sh; printf '%s' '{latest_cmd_q}' > /tmp/q_latest.json; "
            f'curl -sS -H "Authorization: ApiKey $GOLDEN_ES_API_KEY" '
            f'"$GOLDEN_ES_URL/.evaluation-scores/_search" '
            f"-H 'Content-Type: application/json' --data @/tmp/q_latest.json",
        )
        try:
            hits = json.loads(out.splitlines()[-1])["hits"]["hits"]
            exec_id = hits[0]["_source"]["metadata"]["execution_id"]
        except Exception:
            return {"count": -1, "error": f"cannot resolve latest execution id: {out[:200]}"}

    # metadata.execution_id is keyword-mapped already: a .keyword subfield does
    # not exist and a term on it silently returns 0, which the gate cannot tell
    # apart from "no docs written" (2026-09-07: a complete 98-doc shard failed as
    # docs=0/98). Query the field directly.
    q = json.dumps({"query": {"term": {"metadata.execution_id": exec_id}}})
    # The exact gate's target must be known BEFORE counting so the flush poll
    # below can wait for it. Floor suites have no such product, so target=None.
    reps = int(os.environ.get("EVAL_REPETITIONS", "1") or "1")
    prof = suite_profile()
    _target = None
    if prof.get("gate") != "floor":
        _te = prof["n_examples"]
        if shard and prof.get("honors_shard", True):
            idx, total = (int(x) for x in shard.split("/"))
            _te = len(range(idx - 1, _te, total))
        _target = _te * n_evaluators * reps
    # Ask golden from the driver first: by the time the gate runs, this unit's
    # VM is already parked, so the ssh path below reaches a deallocated host.
    # Poll toward the target: score docs reach golden through the live OTel
    # batch exporter, and a full experiment's batch can sit in the queue with
    # retry backoff far longer than the documented 3-7 min trace lag.
    # Measured 2026-09-10 (three dense canary runs): the dense example's 13
    # docs carried @timestamp 03:34-03:35 (evaluator completion) but were NOT
    # indexed by 03:43 and WERE indexed by 03:55 -- a 10-20 min delivery lag.
    # "Count stopped growing" is also wrong: the batch lands as one burst
    # after several stable reads. Poll until the count reaches the target or
    # a 25-min window elapses (covers the observed lag with headroom; on a
    # genuine shortfall the sweep burns 25 idle minutes per unit, acceptable
    # because units gate in parallel).
    def _count_to_target():
        n = _golden_count_local(exec_id)
        if n is None:
            return None
        deadline = time.time() + 25 * 60
        while _target is not None and n < _target and time.time() < deadline:
            time.sleep(30)
            n = _golden_count_local(exec_id)
            if n is None:
                return None
        return n

    _local_n = _count_to_target()
    if _local_n is not None:
        result: dict = {"count": _local_n}
        if _local_n == 0:
            _phrase_n = _golden_count_local(exec_id, phrase=True)
            result = {"count": _phrase_n if _phrase_n is not None else 0}
    else:
        out = ssh(
            ip,
            f"source /tmp/golden-cluster-env.sh; printf '%s' '{q}' > /tmp/q.json; "
            f'curl -sS -H "Authorization: ApiKey $GOLDEN_ES_API_KEY" '
            f'"$GOLDEN_ES_URL/.evaluation-scores/_count" '
            f"-H 'Content-Type: application/json' --data @/tmp/q.json",
        )
        try:
            result = json.loads(out.splitlines()[-1])
        except Exception:
            return {"count": -1, "error": out[:200]}
    if result.get("count", 0) == 0 and _local_n is None:
        # mapping without a .keyword subfield — match_phrase works on text
        q = json.dumps({"query": {"match_phrase": {"metadata.execution_id": exec_id}}})
        out = ssh(
            ip,
            f"source /tmp/golden-cluster-env.sh; printf '%s' '{q}' > /tmp/q.json; "
            f'curl -sS -H "Authorization: ApiKey $GOLDEN_ES_API_KEY" '
            f'"$GOLDEN_ES_URL/.evaluation-scores/_count" '
            f"-H 'Content-Type: application/json' --data @/tmp/q.json",
        )
        try:
            result = json.loads(out.splitlines()[-1])
        except Exception:
            return {"count": -1, "error": out[:200]}
    # reps/prof were computed above (before counting) so the flush poll knew
    # the exact-gate target; reuse them here.
    if prof.get("gate") == "floor":
        # Suites whose datasets carry different evaluator counts (migrations:
        # 7 / 9 / 8) have no examples x evaluators product. Gate on a floor
        # measured from a canary run, and report it as such.
        result["expected"] = prof["min_docs"]
        result["gate"] = "floor"
    else:
        # A sharded run only produces its own slice, so the exact gate must
        # expect that slice -- not the whole dataset -- or every shard FAILs.
        # Shard sizes follow the suite's stride assignment (index k -> shard
        # k % total), so shard i holds ceil((n - (i-1)) / total) examples.
        # Only for suites that actually honor PERSONA_MATRIX_SHARD: AD ignores
        # it and runs the full grid on every VM, so slicing the expectation
        # there reads complete data as FAIL (117/39 on 2026-09-08).
        n_examples = prof["n_examples"]
        if shard and prof.get("honors_shard", True):
            idx, total = (int(x) for x in shard.split("/"))
            n_examples = len(range(idx - 1, n_examples, total))
            result["shard"] = shard
        result["expected"] = n_examples * n_evaluators * reps
        result["gate"] = "exact"
    result["execution_id"] = exec_id
    # Dataset-identity gate. A doc count cannot tell "ran the right suite" from
    # "ran a different suite that also writes ~86 docs" -- see
    # check_expected_datasets. Only enforced for suites that declare the
    # identity, so persona/AD keep their existing behaviour.
    _want = set(prof.get("expected_dataset_ids") or ())
    if _want and exec_id:
        _seen = _golden_datasets_local(exec_id)
        if _seen is None:
            return {**result, "count": -1,
                    "error": "cannot verify dataset identity (golden unreachable)"}
        _bad = check_expected_datasets(_seen, _want)
        if _bad:
            return {**result, "count": -1, "error": f"wrong suite: {_bad}"}
    return result


def status() -> None:
    root = SWEEP_DIR / SUITE
    for model in sorted(os.listdir(root)) if root.exists() else []:
        p = model_dir(model) / "status.json"
        if p.exists():
            s = json.load(open(p))
            print(f"  {model:45} {s.get('state', '?'):10} docs={s.get('docs', '?')}")


def prepare(model: str, shard: Optional[str] = None) -> tuple[str, str]:
    """Provision + deploy one model's VM. Returns (model, ip)."""
    ip = provision(model, shard)
    if not wait_ssh(ip):
        raise RuntimeError(f"ssh never ready: {model} @ {ip}")
    # A VM whose sshd accepts TCP before it accepts auth, or that hits a
    # transient scp reset, used to abort the ENTIRE sweep here (2026-08-22:
    # 17/19 deployed, one scp failure, zero launches). Retry once after a
    # short wait; a genuinely dead VM raises and is skipped by the caller.
    try:
        deploy(ip)
    except subprocess.CalledProcessError:
        time.sleep(30)
        deploy(ip)
    return model, ip


def _label(model: str, shard: Optional[str] = None) -> str:
    """Human label for one sweep unit; shard suffix only when sharding."""
    return f"{model} [shard {shard}]" if shard else model


def _model_state(model: str, shard: Optional[str] = None) -> str:
    """Read the state a model last wrote, so skips count as failures too."""
    try:
        with open(model_dir(model, shard=shard) / "status.json") as fh:
            return json.load(fh).get("state", "UNKNOWN")
    except Exception:
        return "UNKNOWN"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="all")
    # Provision/deploy fan-out. Each VM is 8 vCPUs against a 350 low-priority
    # vCPU regional quota (~43 concurrent), so the ceiling here is Azure API
    # politeness and local ssh/scp load, not quota.
    ap.add_argument("--provision-workers", type=int, default=5,
                    help="parallel VM provision+deploy workers. Raising this "
                         "trades wall-clock for boot races: at 8 on 2026-09-02, "
                         "5/15 VMs lost the CCM/.inference readiness race "
                         "(fetch failed -> enable_eis_ccm exit 1). run_model.sh "
                         "now retries that step 3x, but 5 is the tested default.")
    ap.add_argument("--shards", type=int, default=1,
                    help="split the dataset across N VMs per model. Each VM "
                         "runs a stride slice (PERSONA_MATRIX_SHARD=i/N). Use "
                         "for slow models: GLM-5.3 needs ~174min on one VM, "
                         "~45min at --shards 4. Frontier models need 1.")
    ap.add_argument("--only-shard", type=int, default=None,
                    help="backfill a single shard i of a --shards N sweep; "
                         "keeps VM names + example stride identical to the "
                         "original run so the golden gate merges cleanly")
    ap.add_argument("--suite", default="security-persona-matrix",
                    choices=sorted(SUITE_PROFILES),
                    help="eval suite to sweep; selects overlays, VM prefix and doc gate")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--teardown", action="store_true")
    ap.add_argument("--self-test", action="store_true",
                    help="offline checks for the pure helpers; no Azure or SSH")
    args = ap.parse_args()

    global SUITE
    SUITE = args.suite

    if args.self_test:
        return self_test()

    if args.status:
        status()
        return
    if args.teardown:
        for vm in json.loads(az("vm", "list", "-g", RG, "-o", "json")):
            if any(vm["name"].startswith(pf["vm_prefix"] + "-")
                   for pf in SUITE_PROFILES.values()):
                az("vm", "delete", "-g", RG, "-n", vm["name"], "--yes", "--no-wait")
                print(f"[teardown] deleting {vm['name']}")
        # `az vm delete` removes ONLY the VM. Its disk, NIC and public IP
        # survive and keep billing -- disks are the expensive ones, and NICs
        # pin their public IP so ordering matters (NIC first, then IP).
        # Observed 2026-09-02: a "successful" teardown left 3 disks, 5 NICs
        # and 5 public IPs behind, two of them from sweeps days earlier.
        # --no-wait above means VMs may still be detaching; poll until the
        # disks actually report Unattached rather than racing them.
        print("[teardown] waiting for disks to detach...")
        for _ in range(60):
            disks = json.loads(az("disk", "list", "-g", RG, "-o", "json"))
            sweep = [d for d in disks if is_sweep_resource(d["name"])]
            if not sweep or all(d.get("diskState") == "Unattached" for d in sweep):
                break
            time.sleep(5)

        for d in json.loads(az("disk", "list", "-g", RG, "-o", "json")):
            if is_sweep_resource(d["name"]) and d.get("diskState") == "Unattached":
                az("disk", "delete", "-g", RG, "-n", d["name"], "--yes", "--no-wait")
                print(f"[teardown] deleting disk {d['name']}")

        for n in json.loads(az("network", "nic", "list", "-g", RG, "-o", "json")):
            if is_sweep_resource(n["name"]) and not n.get("virtualMachine"):
                az("network", "nic", "delete", "-g", RG, "-n", n["name"])
                print(f"[teardown] deleting nic {n['name']}")

        for p in json.loads(az("network", "public-ip", "list", "-g", RG, "-o", "json")):
            if is_sweep_resource(p["name"]) and not p.get("ipConfiguration"):
                az("network", "public-ip", "delete", "-g", RG, "-n", p["name"])
                print(f"[teardown] deleting public-ip {p['name']}")

        # `az vm create` also auto-creates one NSG per VM. Nothing deleted these,
        # so they accumulated one-per-sweep (68 found on 2026-09-02, every one
        # detached). They cost nothing, but they bury real resources in the RG
        # and make "is this group clean?" unanswerable at a glance. Only ever
        # delete NSGs that belong to a sweep VM AND are attached to nothing --
        # the shared vnet and the orca-eval-base-* image must survive.
        for g in json.loads(az("network", "nsg", "list", "-g", RG, "-o", "json")):
            detached = not g.get("networkInterfaces") and not g.get("subnets")
            if is_sweep_resource(g["name"]) and detached:
                az("network", "nsg", "delete", "-g", RG, "-n", g["name"])
                print(f"[teardown] deleting nsg {g['name']}")

        left = {
            "vms": len(json.loads(az("vm", "list", "-g", RG, "-o", "json"))),
            "disks": len(json.loads(az("disk", "list", "-g", RG, "-o", "json"))),
            "nics": len(json.loads(az("network", "nic", "list", "-g", RG, "-o", "json"))),
            "pubips": len(json.loads(az("network", "public-ip", "list", "-g", RG, "-o", "json"))),
            "sweep_nsgs": len(
                [
                    g
                    for g in json.loads(az("network", "nsg", "list", "-g", RG, "-o", "json"))
                    if is_sweep_resource(g["name"])
                ]
            ),
        }
        print(f"[teardown] remaining: {left}")
        return

    models = MODELS if args.models == "all" else [m.strip() for m in args.models.split(",")]
    if args.shards < 1:
        print("--shards must be >= 1", flush=True)
        return 2
    # A "unit" is one VM's worth of work: (model, shard). shard is None at
    # --shards 1 so unsharded run dirs and VM names stay byte-identical to
    # every sweep before this flag existed.
    if args.shards == 1:
        units = [(m, None) for m in models]
    else:
        units = [(m, f"{i}/{args.shards}")
                 for m in models for i in range(1, args.shards + 1)]
    # --only-shard: backfill one failed shard of a larger sweep without
    # re-provisioning the passing shards. Must be used with --shards N so the
    # shard string (and thus VM name + example stride) matches the original.
    if args.only_shard is not None:
        if args.shards == 1:
            print("--only-shard requires --shards > 1", flush=True)
            return 2
        keep = f"{args.only_shard}/{args.shards}"
        units = [(m, s) for m, s in units if s == keep]
        if not units:
            print(f"--only-shard {keep}: no unit matched", flush=True)
            return 2
        print(f"only-shard backfill: {keep}", flush=True)
    print(f"sweep models ({len(models)}): {', '.join(models)}", flush=True)
    # Fail before provisioning: a missing local asset otherwise surfaces as an
    # scp error on every VM, after the whole farm is already booted and billing.
    # 2026-09-08: ~/.elastic/eis-ccm-key.json was rotated server-side and never
    # restored locally; the preflight missed it, so 24 VMs booted and every
    # unit died at deploy with a per-VM scp 255. deploy() unconditionally scp's
    # this file to every VM (run_model.sh exports it as KIBANA_EIS_CCM_API_KEY),
    # so it is load-bearing for EIS sweeps, not optional.
    _required = [GOLDEN_ENV_LOCAL,
                 os.path.expanduser("~/.elastic/eis-connectors-cache.json"),
                 os.path.expanduser("~/.elastic/eis-ccm-key.json")]
    _absent = [p for p in _required if not os.path.isfile(p)]
    if _absent:
        print(f"PREFLIGHT FAILED: missing local assets: {_absent}", flush=True)
        print("hint: restore the CCM key via vault (secret/kibana-issues/dev/"
              "inference/kibana-eis-ccm) then relaunch.", flush=True)
        return 2
    # Quota gate: refuse to launch a sweep that cannot fit in the region's
    # remaining cores. Launching into a full quota does not fail fast -- it
    # fails per-VM, hours in, with a misleading az-cli error (2026-09-06).
    # SKIP_QUOTA_GATE=1 bypasses for deliberate over-subscription.
    if os.environ.get("SKIP_QUOTA_GATE") != "1":
        try:
            used, limit = quota_snapshot()
        except Exception as exc:
            print(f"[quota] snapshot unavailable ({exc}); proceeding", flush=True)
        else:
            # Charge quota only for units that need a NEW VM. An existing VM
            # for this unit -- running or deallocated -- is ALREADY counted in
            # `used`, so billing it again double-counts and makes resuming onto
            # a warm pool impossible: on 2026-09-08 a resume of 24 existing VMs
            # was refused for "needing" 192 cores that those same VMs already
            # held. (In this subscription deallocated VMs keep consuming family
            # vCPU quota, so they cannot be assumed free.)
            existing = {
                v.get("name")
                for v in json.loads(az("vm", "list", "-g", RG, "-o", "json"))
            }
            new_units = [u for u in units if vm_name(u[0], u[1]) not in existing]
            reused = len(units) - len(new_units)
            if reused:
                print(
                    f"[quota] {reused} of {len(units)} unit(s) reuse an existing VM "
                    f"(already counted in quota); charging {len(new_units)} new VM(s)",
                    flush=True,
                )
            ok, msg = quota_gate(len(new_units), used, limit, cores_per_vm())
            print(f"[quota] {msg}", flush=True)
            if not ok:
                return 2
    if args.shards > 1:
        print(f"sharding: {args.shards} VMs/model -> {len(units)} VMs total", flush=True)
        # One base per sweep, suffixed per shard in launch(). Computing the
        # base inside launch() would stamp each shard with a different base
        # and leave the slices unrelatable after the fact.
        os.environ.setdefault(
            "TEST_RUN_ID", f"sweep-{int(time.time())}{('-' + os.environ['VM_NAME_SUFFIX']) if os.environ.get('VM_NAME_SUFFIX') else ''}"
        )
        print(f"run id base: {os.environ['TEST_RUN_ID']}", flush=True)

    # Provision + deploy in parallel (independent per VM); launches stay serial.
    ips: dict[tuple, str] = {}
    with ThreadPoolExecutor(max_workers=args.provision_workers) as pool:
        # as_completed + try/except so one dead VM (eviction, sshd race)
        # loses its cell instead of killing the whole sweep before launch.
        futures = {pool.submit(prepare, model, shard): (model, shard)
                   for model, shard in units}
        for fut in as_completed(futures):
            unit = futures[fut]
            model, shard = unit
            try:
                _, ip = fut.result()
            except Exception as exc:
                print(f"[skip] {_label(model, shard)}: prepare failed ({exc})", flush=True)
                model_dir(model, shard=shard).mkdir(parents=True, exist_ok=True)
                json.dump({"model": model, "shard": shard, "state": "FAIL",
                           "error": f"prepare: {exc}"},
                          open(model_dir(model, shard=shard) / "status.json", "w"))
                continue
            ips[unit] = ip
            model_dir(model, shard=shard).mkdir(parents=True, exist_ok=True)
            json.dump({"ip": ip, "model": model, "shard": shard, "state": "booting"},
                      open(model_dir(model, shard=shard) / "status.json", "w"))

    reused = {}
    for unit, ip in ips.items():
        if ip in reused:
            raise RuntimeError(
                f"VM collision: {_label(*unit)} and {_label(*reused[ip])} both "
                f"mapped to {ip}. Every unit must own its VM stack — two eval "
                "stacks on one box OOM each other, corrupt local ES, and wedge SSH."
            )
        reused[ip] = unit

    procs = []
    for model, shard in units:
        if (model, shard) not in ips:
            continue
        ip = ips[(model, shard)]
        procs.append((model, shard, ip, launch(ip, model, shard)))
        print(f"[launch] {_label(model, shard)} @ {ip}", flush=True)

    print("\nAll launches issued. Waiting for completion + golden gate.", flush=True)
    for model, shard, ip, p in procs:
        p.wait()  # returns when the quick "launch" ssh exits (immediately)
        # Poll the detached VM-side markers. Cap at 6h (slow reasoning models
        # at 240-min per-example timeouts can legitimately run for hours).
        deadline = time.time() + 6 * 3600
        rc = None
        while time.time() < deadline:
            probe = subprocess.run(
                ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                 "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15",
                 "-i", SSH_KEY, f"{SSH_USER}@{ip}",
                 "if [ -f /tmp/unit.done ]; then echo done $(cat /tmp/unit.rc 2>/dev/null); fi"],
                capture_output=True, text=True, timeout=60)
            out = probe.stdout.strip()
            if out.startswith("done"):
                parts = out.split()
                rc = int(parts[1]) if len(parts) > 1 and parts[1].lstrip("-").isdigit() else 1
                break
            time.sleep(60)
        if rc is None:
            rc = 1  # timed out or markers unreadable — never green by default
        result = check_golden(model, ip, shard)
        # Expected size is derived inside check_golden from the live evaluator
        # count on the VM (21 examples x (evaluators + 1 task doc) x reps).
        expected_docs = result.get("expected", -1)
        count = result.get("count", -1)
        # Never green on unresolved numbers: count == expected == -1 would
        # otherwise PASS a run that produced nothing (observed when the spec
        # overlay missed tool_registration_check.ts and every run died at
        # require time).
        gate_kind = result.get("gate", "exact")
        meets = (
            count >= expected_docs if gate_kind == "floor" else count == expected_docs
        )
        state = (
            "PASS"
            if rc == 0
            and not result.get("error")
            and isinstance(count, int)
            and count > 0
            and meets
            else "FAIL"
        )
        json.dump({"ip": ip, "model": model, "shard": shard, "state": state,
                   "docs": result.get("count", -1), "rc": rc,
                   "execution_id": result.get("execution_id"),
                   "error": result.get("error")},
                  open(model_dir(model, shard=shard) / "status.json", "w"), indent=2)
        print(f"[done] {_label(model, shard)}: {state} docs={result.get('count', -1)}/{expected_docs}"
              + (f" ({result['error']})" if result.get("error") else ""), flush=True)
        # Free the unit's cores as soon as its golden gate is settled, rather
        # than at end-of-sweep. Two quota exhaustions on 2026-09-06 were caused
        # by finished VMs idling at full cost while later units waited for
        # capacity. Deallocating (not deleting) also leaves a pre-baked box
        # that the next sweep starts in ~60-90s via the warm pool.
        maybe_park_unit(model, shard)


    # A sweep that skipped or failed every model must not look like a green
    # run to its caller: report the count so CI and shell wrappers can gate.
    # A sweep that skipped or failed any UNIT must not look green: with
    # sharding a model is only complete when every one of its shards passed,
    # so tally units. Tallying models here would let a dead shard — a missing
    # third of the dataset — report success.
    failed = [_label(m, s) for m, s in units if _model_state(m, s) != "PASS"]
    if failed:
        print(f"SWEEP FAILED: {len(failed)}/{len(units)} units did not pass: {failed}", flush=True)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
