#!/usr/bin/env bash

SCRIPTS_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPTS_COMMON_DIR}/vault_fns.sh"

is_pr() {
  [[ "${GITHUB_PR_NUMBER-}" ]] && return
  false
}

is_pr_with_label() {
  match="$1"

  IFS=',' read -ra labels <<< "${GITHUB_PR_LABELS:-}"

  for label in "${labels[@]:-}"
  do
    if [ "$label" == "$match" ]; then
      return
    fi
  done

  false
}

is_auto_commit_disabled() {
  is_pr_with_label "ci:no-auto-commit"
}

should_enable_fips() {
  case "${TEST_ENABLE_FIPS_VERSION:-}" in
    140-2|140-3)
      return 0
      ;;
  esac

  is_pr_with_label "ci:enable-fips-140-2-agent" || is_pr_with_label "ci:enable-fips-140-3-agent"
}

# Buildkite checkouts push with the Buildkite GitHub App credential, which has limited scopes. It cannot push to workflows for example.
# Use an isolated git config so gh can provide GITHUB_TOKEN credentials for this push without changing global auth.
push_as_github_token() {
  local required_env_var

  for required_env_var in GITHUB_TOKEN GITHUB_PR_OWNER GITHUB_PR_REPO GITHUB_PR_BRANCH; do
    if [[ -z "${!required_env_var:-}" ]]; then
      echo "Missing required environment variable for GITHUB_TOKEN push: $required_env_var" >&2
      exit 1
    fi
  done

  (
    git_config_global="$(mktemp)"
    trap 'rm -f "$git_config_global"' EXIT


    GH_TOKEN="$GITHUB_TOKEN" GIT_CONFIG_GLOBAL="$git_config_global" gh auth setup-git --hostname github.com --force
    GH_TOKEN="$GITHUB_TOKEN" GIT_CONFIG_GLOBAL="$git_config_global" git push \
      "https://github.com/${GITHUB_PR_OWNER}/${GITHUB_PR_REPO}.git" \
      "HEAD:${GITHUB_PR_BRANCH}"
  )
}

check_for_changed_files() {
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  C_RESET='\033[0m' # Reset color

  SHOULD_AUTO_COMMIT_CHANGES="${2:-}"
  CUSTOM_FIX_MESSAGE="${3:-Changes from $1}"
  FORCE_GITHUB_TOKEN_PUSH_ARG="${4:-}"
  GIT_CHANGES="$(git status --porcelain -- . ':!:config/node.options' ':!config/kibana.yml')"

  if [ "$GIT_CHANGES" ]; then
    if ! is_auto_commit_disabled && [[ "$SHOULD_AUTO_COMMIT_CHANGES" == "true" && "${BUILDKITE_PULL_REQUEST:-false}" != "false" ]]; then
      echo "'$1' caused changes to the following files:"
      echo "$GIT_CHANGES"
      echo ""

      git config --global user.name kibanamachine
      git config --global user.email '42973632+kibanamachine@users.noreply.github.com'
      gh pr checkout "${BUILDKITE_PULL_REQUEST}"
      git add -A -- . ':!config/node.options' ':!config/kibana.yml'
      git commit -m "$CUSTOM_FIX_MESSAGE"

      # If COLLECT_COMMITS_MARKER_FILE is set, we're in batch mode (e.g., called from quick checks runner)
      # Just record the commit for later batch push
      # Otherwise, commit and push immediately (standalone usage)
      if [[ -n "${COLLECT_COMMITS_MARKER_FILE:-}" ]]; then
        echo "Auto-committing these changes (will push after all checks complete)."
        echo "$CUSTOM_FIX_MESSAGE" >> "$COLLECT_COMMITS_MARKER_FILE"
      else
        echo "Auto-committing and pushing these changes."
        if [[ "${FORCE_GITHUB_TOKEN_PUSH:-}" == "true" || "$FORCE_GITHUB_TOKEN_PUSH_ARG" == "true" ]]; then
          push_as_github_token
        else
          git push
        fi
      fi
      exit 1
    else
      echo -e "\n${RED}ERROR: '$1' caused changes to the following files:${C_RESET}\n"
      echo -e "$GIT_CHANGES\n"
      if [ "$CUSTOM_FIX_MESSAGE" ]; then
        echo "$CUSTOM_FIX_MESSAGE"
      else
        echo -e "\n${YELLOW}TO FIX: Run '$1' locally, commit the changes and push to your branch${C_RESET}\n"
      fi
      exit 1
    fi
  fi
}

# docker_run can be used in place of `docker run`
# it automatically passes along all of Buildkite's tracked environment variables, and mounts the buildkite-agent in the running container
docker_run() {
  args=()

  if [[ -n "${BUILDKITE_ENV_FILE:-}" ]] ; then
    # Read in the env file and convert to --env params for docker
    # This is because --env-file doesn't support newlines or quotes per https://docs.docker.com/compose/env-file/#syntax-rules
    while read -r var; do
      args+=( --env "${var%%=*}" )
    done < "$BUILDKITE_ENV_FILE"
  fi

  BUILDKITE_AGENT_BINARY_PATH=$(command -v buildkite-agent)
  args+=(
    "--env" "BUILDKITE_JOB_ID"
    "--env" "BUILDKITE_BUILD_ID"
    "--env" "BUILDKITE_AGENT_ACCESS_TOKEN"
    "--volume" "$BUILDKITE_AGENT_BINARY_PATH:/usr/bin/buildkite-agent"
  )

  docker run "${args[@]}" "$@"
}

is_test_execution_step() {
  buildkite-agent meta-data set "${BUILDKITE_JOB_ID}_is_test_execution_step" 'true'
}

retry() {
  local retries=$1; shift
  local delay=$1; shift
  local attempts=1

  until "$@"; do
    retry_exit_status=$?
    echo "Exited with $retry_exit_status" >&2
    if (( retries == "0" )); then
      return $retry_exit_status
    elif (( attempts == retries )); then
      echo "Failed $attempts retries" >&2
      return $retry_exit_status
    else
      echo "Retrying $((retries - attempts)) more times..." >&2
      attempts=$((attempts + 1))
      sleep "$delay"
    fi
  done
}

set_git_merge_base() {
  GITHUB_PR_MERGE_BASE="$(buildkite-agent meta-data get merge-base --default '')"

  if [[ ! "$GITHUB_PR_MERGE_BASE" ]]; then
    if git fetch origin "$GITHUB_PR_TARGET_BRANCH" 2>/dev/null; then
      GITHUB_PR_MERGE_BASE="$(git merge-base HEAD FETCH_HEAD 2>/dev/null || true)"
    fi

    if [[ ! "$GITHUB_PR_MERGE_BASE" ]]; then
      local compare_target="${GITHUB_PR_HEAD_SHA:-}"
      local github_token="${GITHUB_TOKEN:-${VAULT_GITHUB_TOKEN:-}}"
      local compare_ref

      if [[ ! "$compare_target" && "${GITHUB_PR_OWNER:-}" && "${GITHUB_PR_BRANCH:-}" ]]; then
        compare_target="${GITHUB_PR_OWNER}:${GITHUB_PR_BRANCH}"
      fi

      if [[ ! "$compare_target" ]]; then
        echo "Failed to resolve PR merge base: PR head ref is not available for gh api fallback" >&2
        return 1
      fi

      echo "Falling back to GitHub compare API for PR merge-base"
      compare_ref="$(
        jq -rn \
          --arg base "$GITHUB_PR_TARGET_BRANCH" \
          --arg head "$compare_target" \
          '$base + "..." + $head | @uri'
      )"

      GITHUB_PR_MERGE_BASE="$(
        curl -fsSL \
          -H 'Accept: application/vnd.github+json' \
          -H "Authorization: Bearer ${github_token}" \
          "https://api.github.com/repos/${GITHUB_PR_BASE_OWNER}/${GITHUB_PR_BASE_REPO}/compare/${compare_ref}" |
          jq -r '.merge_base_commit.sha // empty' || true
      )"
    fi

    if [[ ! "$GITHUB_PR_MERGE_BASE" ]]; then
      echo "Failed to resolve PR merge base" >&2
      return 1
    fi

    buildkite-agent meta-data set merge-base "$GITHUB_PR_MERGE_BASE"
  fi

  export GITHUB_PR_MERGE_BASE
}

# Download an artifact using the buildkite-agent, takes the same arguments as https://buildkite.com/docs/agent/v3/cli-artifact#downloading-artifacts-usage
# times-out after 60 seconds and retries up to 3 times
download_artifact() {
  retry 3 1 timeout 3m buildkite-agent artifact download "$@"
}

GCS_CI_ARTIFACT_REGIONS=("asia-south2" "europe-west2" "northamerica-northeast2" "southamerica-east1" "us-central1" "us-east1" "us-west1")
download_tmp_artifact() {
  local artifact_name="$1" dest_dir="$2" build_id="$3" fallback="${4:-true}"
  local region use_gcs=false

  for region in "${GCS_CI_ARTIFACT_REGIONS[@]}"; do
    if [[ "${BUILDKITE_AGENT_GCP_REGION:-}" == "$region" ]]; then
      use_gcs=true
      break
    fi
  done

  if [[ "$use_gcs" == "true" ]]; then
    "${SCRIPTS_COMMON_DIR}/activate_service_account.sh" "kibana-ci-artifacts-${BUILDKITE_AGENT_GCP_REGION}"
    if gcloud storage cp \
      "gs://kibana-ci-artifacts-${BUILDKITE_AGENT_GCP_REGION}/tmp/builds/${build_id}/${artifact_name}" \
      "${dest_dir}/${artifact_name}"; then
      return 0
    fi
    echo "GCS download failed for ${artifact_name} from kibana-ci-artifacts-${BUILDKITE_AGENT_GCP_REGION} (build ${build_id})."
  fi

  if [[ "$fallback" != "true" ]]; then
    return 1
  fi

  echo "Falling back to Buildkite artifact download for ${artifact_name} (build ${build_id})."
  download_artifact "$artifact_name" "$dest_dir" --build "$build_id"
}
upload_tmp_artifact() {
  local local_path="$1" artifact_name="$2" build_id="$3"

  "${SCRIPTS_COMMON_DIR}/activate_service_account.sh" "kibana-ci-artifacts-${GCS_CI_ARTIFACT_REGIONS[0]}"

  printf '%s\n' "${GCS_CI_ARTIFACT_REGIONS[@]}" | xargs -P 0 -I{} \
    env CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED=False gcloud storage cp \
      "$local_path" \
      "gs://kibana-ci-artifacts-{}/tmp/builds/${build_id}/${artifact_name}"
}

print_if_dry_run() {
  if [[ "${DRY_RUN:-}" =~ ^(1|true)$ ]]; then
    echo "DRY_RUN is enabled."
  fi
}

docker_with_retry () {
  cmd=$1
  shift
  args=("$@")
  attempt=0
  max_retries=5
  sleep_time=15

  while true
  do
    attempt=$((attempt+1))

    if [ $attempt -gt $max_retries ]
    then
      echo "Docker $cmd retries exceeded, aborting."
      exit 1
    fi

    if docker "$cmd" "${args[@]}"
    then
      echo "Docker $cmd successful."
      break
    else
      echo "Docker $cmd unsuccessful, attempt '$attempt'... Retrying in $sleep_time"
      sleep $sleep_time
    fi
  done
}

force_clean_ports() {
  set +e

  echo "LSOF: $(which lsof)"
  for port in "$@"; do
    echo "Force cleaning port: '$port'"

    PORT_PID=$(lsof -i ":$port" -t)
    if [[ "$PORT_PID" != "" ]]; then
      echo "Found process using port '$port': $PORT_PID - sending SIGTERM..."
      kill -15 "$PORT_PID" || true
      sleep 5

      PORT_PID=$(lsof -i ":$port" -t)
      if [[ "$PORT_PID" != "" ]]; then
        echo "Process $PORT_PID is still using port '$port', force killing..."
        kill -9 "$PORT_PID" || true
      fi
    else
      echo "No process found using port '$port', checking docker..."

      ENTRY_WITH_PORT=$(docker ps -a | grep -E ":$port->")
      if [[ -z "$ENTRY_WITH_PORT" ]]; then
        echo "No docker container found using port $port"
        continue
      else
        CONTAINER_ID=$(echo "$ENTRY_WITH_PORT" | awk '{print $1}')
        echo "Found docker container using port $port: $CONTAINER_ID"
        echo "Stopping and removing container $CONTAINER_ID"
        docker stop "$CONTAINER_ID" || true
        docker rm "$CONTAINER_ID" || true
        continue
      fi
    fi
  done

  set -e
}


clean_cached_images() {
  docker images -q | sort -u | xargs -r docker rmi -f || true
  docker image prune -af || true
}
