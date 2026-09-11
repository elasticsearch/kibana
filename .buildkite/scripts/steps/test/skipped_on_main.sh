# Sourced by ftr_configs.sh and the Scout runners — do not execute directly.
#
# Forgives test failures for tests that are skipped on the PR target branch but were not
# skipped at the PR merge base: had the PR been rebased, those tests would not have run.
# Applies to every PR build; disabled for flaky-test-runner builds.

SKIPPED_ON_MAIN_TARGET_SHA=""

skipped_on_main_applicable() {
  [[ -z "${KIBANA_FLAKY_TEST_RUNNER_CONFIG:-}" ]] \
    && [[ -n "${GITHUB_PR_TARGET_BRANCH:-}" ]] \
    && [[ -n "${GITHUB_PR_MERGE_BASE:-}" ]]
}

# Usage: skipped_on_main_skipped <context> <reason>
# Logs why a failure was not evaluated so the log distinguishes "did not run" from "ran and kept".
skipped_on_main_skipped() {
  echo "[skipped-on-main] not evaluating $1: $2 (target=${GITHUB_PR_TARGET_BRANCH:-unset} merge-base=${GITHUB_PR_MERGE_BASE:-unset})"
}

# Resolves the target branch tip once per step. Returns non-zero when it cannot be fetched,
# in which case failures are left untouched.
resolve_skipped_on_main_target() {
  if [[ -n "$SKIPPED_ON_MAIN_TARGET_SHA" ]]; then
    return 0
  fi
  if git fetch --quiet origin "$GITHUB_PR_TARGET_BRANCH" 2>/dev/null; then
    SKIPPED_ON_MAIN_TARGET_SHA="$(git rev-parse FETCH_HEAD)"
    return 0
  fi
  echo "[skipped-on-main] could not fetch origin/$GITHUB_PR_TARGET_BRANCH; leaving failures as-is"
  return 1
}

# Usage: forgive_skipped_on_main <context> <--junit-file path ...|--scout-failures path ...>
# Returns 0 when every failure in the given reports is skipped on the target branch but not at
# the merge base; the caller then treats the run as passed. Annotates the build with the
# forgiven tests.
forgive_skipped_on_main() {
  local context="$1"
  shift

  resolve_skipped_on_main_target || return 1

  echo "--- [skipped-on-main] evaluating failures in $context against $GITHUB_PR_TARGET_BRANCH"
  local evaluation
  if ! evaluation=$(node scripts/check_skipped_on_main \
    --main-ref "$SKIPPED_ON_MAIN_TARGET_SHA" \
    --base-ref "$GITHUB_PR_MERGE_BASE" \
    "$@"); then
    echo "[skipped-on-main] keeping failures for $context"
    return 1
  fi
  if ! echo "$evaluation" | jq -e . >/dev/null; then
    echo "[skipped-on-main] evaluator returned invalid JSON; keeping failures for $context"
    return 1
  fi

  local forgiven
  forgiven=$(echo "$evaluation" | jq -r '.knownSkipped[] | "- `\(.failure.file)` — \(.failure.fullTitle // "\(.failure.suite) \(.failure.title)")\(if .issue then " (\(.issue))" else "" end)"')

  echo "[skipped-on-main] all failures in $context are skipped on $GITHUB_PR_TARGET_BRANCH since the merge base — treating as passed"
  echo "$forgiven"

  # One build-wide annotation; each forgiven config appends a section. The context must stay
  # short (Buildkite rejects long contexts), so never derive it from paths.
  buildkite-agent annotate --style warning --context skipped-on-main --append <<EOF || echo "[skipped-on-main] failed to annotate build (non-fatal)"
**${context}** ([job](#${BUILDKITE_JOB_ID:-})) — failures ignored because these tests are skipped on \`${GITHUB_PR_TARGET_BRANCH}\` (\`${SKIPPED_ON_MAIN_TARGET_SHA:0:12}\`) but not at the PR merge base (\`${GITHUB_PR_MERGE_BASE:0:12}\`):

${forgiven}

EOF
  return 0
}
