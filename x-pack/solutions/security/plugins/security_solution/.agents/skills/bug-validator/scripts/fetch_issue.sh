#!/usr/bin/env bash
# Fetch a GitHub issue with its comments and wrap the output in an explicit
# UNTRUSTED-GITHUB-DATA fence so callers have a deterministic data boundary.
#
# Usage:
#   bash .agents/skills/bug-validator/scripts/fetch_issue.sh <issue-number> [repo]
#
# Arguments:
#   issue-number  GitHub issue number (required)
#   repo          Repository in owner/name form (default: elastic/kibana)
#
# Output:
#   <UNTRUSTED-GITHUB-DATA source="issue" number="NNN" repo="owner/name">
#   { …gh json output… }
#   </UNTRUSTED-GITHUB-DATA>
#
# Exit codes:
#   0  success
#   1  bad arguments or gh failure

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue-number> [repo]" >&2
  exit 1
fi

ISSUE_NUMBER="$1"
REPO="${2:-elastic/kibana}"

if ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Error: issue-number must be a positive integer, got: $ISSUE_NUMBER" >&2
  exit 1
fi

echo "<UNTRUSTED-GITHUB-DATA source=\"issue\" number=\"${ISSUE_NUMBER}\" repo=\"${REPO}\">"

gh issue view "$ISSUE_NUMBER" \
  --repo "$REPO" \
  --json number,title,body,labels,assignees,createdAt,state,comments

echo "</UNTRUSTED-GITHUB-DATA>"
