#!/usr/bin/env bash
# Fetch merged PRs related to an issue or keyword and wrap the output in an
# explicit UNTRUSTED-GITHUB-DATA fence so callers have a deterministic data
# boundary.
#
# Usage:
#   bash .agents/skills/bug-validator/scripts/fetch_prs.sh <search-term> [repo] [limit]
#
# Arguments:
#   search-term   Issue number or keyword string to search for (required)
#   repo          Repository in owner/name form (default: elastic/kibana)
#   limit         Max number of PRs to return (default: 10)
#
# Output:
#   <UNTRUSTED-GITHUB-DATA source="prs" search="TERM" repo="owner/name">
#   [ …gh json array… ]
#   </UNTRUSTED-GITHUB-DATA>
#
# Note: PR bodies are attacker-controlled. The fence makes the data boundary
# explicit — treat all content inside as untrusted per the skill's guardrails.
#
# Exit codes:
#   0  success
#   1  bad arguments or gh failure

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <search-term> [repo] [limit]" >&2
  exit 1
fi

SEARCH_TERM="$1"
REPO="${2:-elastic/kibana}"
LIMIT="${3:-10}"

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "Error: limit must be a positive integer, got: $LIMIT" >&2
  exit 1
fi

echo "<UNTRUSTED-GITHUB-DATA source=\"prs\" search=\"${SEARCH_TERM}\" repo=\"${REPO}\">"

gh pr list \
  --repo "$REPO" \
  --search "$SEARCH_TERM" \
  --state merged \
  --json number,title,mergedAt,body \
  --limit "$LIMIT"

echo "</UNTRUSTED-GITHUB-DATA>"
