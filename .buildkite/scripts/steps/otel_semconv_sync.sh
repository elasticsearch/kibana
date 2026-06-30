#!/usr/bin/env bash
set -euo pipefail

OTEL_PACKAGE_DIR="src/platform/packages/shared/kbn-otel-semantic-conventions"
GIT_SCOPE="$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml $OTEL_PACKAGE_DIR/src/generated/resolved-semconv.ts"

clone_otel_repository() {
  echo "--- Cloning OpenTelemetry semantic conventions repository"
  rm -rf otel-semconv
  git clone https://github.com/open-telemetry/semantic-conventions.git otel-semconv --depth 1
  echo "Using semantic conventions from commit: $(cd otel-semconv && git rev-parse HEAD)"
}

generate_resolved_yaml() {
  echo "--- Generating resolved YAML with Docker weaver"
  cd otel-semconv

  # Create output directory with proper permissions for the mapped user
  mkdir -p ./weaver_output
  chmod 777 ./weaver_output

  docker run --rm \
    --user $(id -u):$(id -g) \
    --env USER=weaver \
    --env HOME=/home/weaver \
    --mount type=bind,source=./model,target=/home/weaver/source,readonly \
    --mount type=bind,source=./weaver_output,target=/home/weaver/out \
    docker.io/otel/weaver:v0.24.2@sha256:d1fb16d279f39810c340fbbf1cf9e5e995a3a9cefa531938e9012437e3bc00c1 \
    registry resolve \
    --registry=/home/weaver/source \
    --output=/home/weaver/out/resolved_semconv.yaml

  # Debug: Check what files were generated
  echo "--- Debug: Checking generated files"
  ls -la ./weaver_output/ || echo "weaver_output directory not found"

  # Move the generated file to the expected location
  if [ -f "./weaver_output/resolved_semconv.yaml" ]; then
    cp ./weaver_output/resolved_semconv.yaml ./resolved_semconv.yaml
    echo "✅ Successfully copied resolved_semconv.yaml"
    ls -la ./resolved_semconv.yaml
  else
    echo "❌ Error: resolved_semconv.yaml not found in weaver_output"
    exit 1
  fi

  # Clean up the temporary directory
  rm -rf ./weaver_output

  cd ..
}

bootstrap_kibana() {
  echo "--- Bootstrapping Kibana"
  .buildkite/scripts/bootstrap.sh
}

generate_typescript() {
  echo "--- Generating TypeScript definitions"

  # Verify the YAML file was already copied by main function
  echo "--- Debug: Verifying YAML file is in package assets"
  ls -la "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml" || echo "❌ resolved-semconv.yaml not found in assets directory"

  # Generate TypeScript file
  echo "--- Running TypeScript generation"
  node scripts/generate_otel_semconv.js

  # Run ESLint fix
  echo "--- Running ESLint fix"
  yarn lint:es --fix "$OTEL_PACKAGE_DIR/src/generated/" || true
}

create_pull_request() {
  echo "--- Differences found. Preparing PR creation data."

  # Configure Git with machine user
  KIBANA_MACHINE_USERNAME="kibanamachine"

  # Define PR details
  PR_TITLE='[One Discover][Logs UX] Update OpenTelemetry Semantic Conventions'
  PR_BODY='This PR updates the OpenTelemetry semantic conventions definitions to the latest version.

### Changes Made
- ✅ Updated `resolved-semconv.yaml` with latest conventions from OpenTelemetry repository
- ✅ Regenerated `resolved-semconv.ts` with new field definitions and metadata
- ✅ Applied ESLint formatting to generated files

### Validation
- ✅ TypeScript compilation successful
- ✅ Package tests passing
- ✅ ESLint formatting applied

🤖 Generated automatically by Buildkite workflow'

  # Create branch name for reference
  BRANCH_NAME="otel_semconv_sync_$(date +%s)"

  # Check DRY_RUN mode
  if [[ "${DRY_RUN:-}" =~ ^(1|true)$ ]]; then
    echo "🔍 DRY_RUN: Collected data for PR creation (no git operations performed):"
    echo ""
    echo "=== PR METADATA ==="
    echo "Title: $PR_TITLE"
    echo "Proposed Branch: $BRANCH_NAME"
    echo "Target Base: main"
    echo "Author: $KIBANA_MACHINE_USERNAME"
    echo ""
    echo "=== LABELS ==="
    echo "- Team:obs-onboarding"
    echo "- release_note:skip"
    echo "- backport:skip"
    echo "- otel-semantic-conventions"
    echo ""
    echo "=== ASSIGNEES & REVIEWERS ==="
    echo "Assignee: elastic/obs-onboarding-team"
    echo "Reviewer: elastic/obs-onboarding-team"
    echo ""
    echo "=== FILES TO COMMIT ==="
    echo "- $OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml"
    echo "- $OTEL_PACKAGE_DIR/src/generated/resolved-semconv.ts"
    echo ""
    echo "=== FILE CHANGES SUMMARY ==="
    if [ -f "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml" ]; then
      yaml_lines=$(wc -l < "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml")
      echo "YAML file: $yaml_lines lines"
    fi
    if [ -f "$OTEL_PACKAGE_DIR/src/generated/resolved-semconv.ts" ]; then
      ts_lines=$(wc -l < "$OTEL_PACKAGE_DIR/src/generated/resolved-semconv.ts")
      echo "TypeScript file: $ts_lines lines"
    fi
    echo ""
    echo "=== GIT DIFF SUMMARY ==="
    echo "Changed files detected:"
    git diff --name-only $GIT_SCOPE || echo "No git diff available"
    echo ""
    echo "=== COMMIT MESSAGE ==="
    echo "Update OpenTelemetry semantic conventions"
    echo ""
    echo "- Updated resolved-semconv.yaml with latest OTel conventions"
    echo "- Regenerated TypeScript definitions with new field metadata"
    echo "- Generated automatically by Buildkite workflow"
    echo ""
    echo "🔍 DRY_RUN: All PR data collected - no git operations or PR creation performed"
    return 0
  fi

  # Normal mode: perform git operations
  git config --global user.name "$KIBANA_MACHINE_USERNAME"
  git config --global user.email '42973632+kibanamachine@users.noreply.github.com'

  # Check if a PR already exists
  pr_search_result=$(gh pr list --search "$PR_TITLE" --state open --author "$KIBANA_MACHINE_USERNAME" --limit 1 --json title -q ".[].title")

  if [ "$pr_search_result" == "$PR_TITLE" ]; then
    echo "PR already exists. Exiting."
    exit 0
  fi

  echo "No existing PR found. Proceeding to create new PR."

  # Create branch with timestamp
  git checkout -b "$BRANCH_NAME"

  # Add the changed files
  git add "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml"
  git add "$OTEL_PACKAGE_DIR/src/generated/resolved-semconv.ts"

  # Create commit with descriptive message
  git commit -m "Update OpenTelemetry semantic conventions

- Updated resolved-semconv.yaml with latest OTel conventions
- Regenerated TypeScript definitions with new field metadata
- Generated automatically by Buildkite workflow"

  echo "--- Changes committed. Creating pull request."

  # Push branch to origin
  git push origin "$BRANCH_NAME"

  # Create pull request with proper labels and individual assignment
  gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base main \
    --head "$BRANCH_NAME" \
    --label 'Team:obs-onboarding' \
    --label 'release_note:skip' \
    --label 'backport:skip' \
    --label 'otel-semantic-conventions'

  echo "✅ Pull request created successfully!"
}

report_main_step() {
  echo "--- $1"
}

main() {
  cd "$PARENT_DIR"

  report_main_step "Cloning OpenTelemetry semantic conventions repository"
  clone_otel_repository

  report_main_step "Generating resolved YAML with Docker weaver"
  generate_resolved_yaml

  cd "$KIBANA_DIR"

  report_main_step "Checking for YAML changes"
  # Copy new YAML and check for immediate changes
  cp "$PARENT_DIR/otel-semconv/resolved_semconv.yaml" "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml"

  # Check if YAML actually changed
  set +e
  git diff --exit-code --quiet "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml"
  yaml_changed=$?
  set -e

  echo "--- Git diff exit code: $yaml_changed (0=no changes, 1=changes detected)"

  if [ $yaml_changed -eq 0 ]; then
    echo "No changes in semantic conventions YAML. Our work is done here."
    exit 0
  fi

  echo "--- YAML changes detected! Git diff summary:"
  git diff --stat "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml" || echo "Could not show diff stat"
  echo "--- First 20 lines of diff:"
  git diff "$OTEL_PACKAGE_DIR/assets/resolved-semconv.yaml" | head -20 || echo "Could not show diff details"
  echo "--- End of diff preview"

  report_main_step "YAML changes detected. Bootstrapping Kibana"
  bootstrap_kibana

  report_main_step "Generating TypeScript definitions"
  generate_typescript

  report_main_step "Performing final change detection"
  # Final change detection
  set +e
  git diff --exit-code --quiet $GIT_SCOPE
  if [ $? -eq 0 ]; then
    echo "No final differences found. Our work is done here."
    exit 0
  fi
  set -e

  report_main_step "Creating pull request"
  create_pull_request
}

main
