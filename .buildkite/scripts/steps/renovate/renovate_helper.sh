#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh
.buildkite/scripts/bootstrap.sh

GH_AW_WORKFLOW_PATH=".github/workflows/validate-agentic-workflow-locks.yml"

has_gh_aw_version_change() {
  if [[ -z "${GITHUB_PR_MERGE_BASE:-}" ]]; then
    if [[ -z "${GITHUB_PR_TARGET_BRANCH:-}" ]]; then
      return 1
    fi

    set_git_merge_base
  fi

  [[ -n "$(git diff --name-only "${GITHUB_PR_MERGE_BASE}...HEAD" -- "$GH_AW_WORKFLOW_PATH")" ]]
}

regenerate_gh_aw_locks() {
  echo --- Regenerate gh-aw workflow locks

  local gh_aw_version
  gh_aw_version="$(awk '$1 == "GH_AW_VERSION:" { print $2; exit }' "$GH_AW_WORKFLOW_PATH")"

  if [[ ! "$gh_aw_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Unable to read a valid GH_AW_VERSION from $GH_AW_WORKFLOW_PATH: $gh_aw_version"
    exit 1
  fi

  gh extension install github/gh-aw --pin "$gh_aw_version" --force
  gh aw compile --purge --validate --no-check-update
  gh aw lint
}

echo --- Deduplicate yarn.lock
cmd="node scripts/yarn_deduplicate.js && yarn kbn bootstrap && node scripts/yarn_deduplicate.js"
eval "$cmd"

commit_message_parts=()
if [[ -n "$(git status --porcelain -- . ':!:config/node.options' ':!config/kibana.yml')" ]]; then
  commit_message_parts+=("yarn dedupe")
fi

if has_gh_aw_version_change; then
  regenerate_gh_aw_locks
  commit_message_parts+=("gh-aw compilation")
fi

commit_message="Changes from Renovate helper:"
if [[ ${#commit_message_parts[@]} -gt 0 ]]; then
  joined="$(printf '%s, ' "${commit_message_parts[@]}")"
  commit_message="$commit_message ${joined%, }"
fi

check_for_changed_files "Renovate helper auto-fixes" true "$commit_message" true

echo --- Additional helpers
# We only want the deploy label on the main branch instead of all branches in the Renovate group
if [ "$GITHUB_PR_BRANCH" = "renovate/main-chainguard" ] && ! is_pr_with_label "ci:cloud-deploy"; then
  echo "Adding deploy label to main chainguard PR"
  gh api "repos/elastic/kibana/issues/${GITHUB_PR_NUMBER}/labels" --method POST -f "labels[]=ci:cloud-deploy" >/dev/null

  # Sync GITHUB_PR_LABELS variable since we're passing it along to the PR pipeline
  if [ -n "${GITHUB_PR_LABELS:-}" ]; then
    export GITHUB_PR_LABELS="${GITHUB_PR_LABELS},ci:cloud-deploy"
  else
    export GITHUB_PR_LABELS="ci:cloud-deploy"
  fi
fi
