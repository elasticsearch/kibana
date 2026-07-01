#!/usr/bin/env bash
# Verify that Kibana AI tools (rules, skills, CLAUDE.md) are present and readable.
# Usage: ./docs/ai-development/validate-ai-setup.sh [kibana_root]
# Default kibana_root is current directory.

set -e

KIBANA_ROOT="$(cd "${1:-.}" && pwd)"
FAIL=0

check_file() {
  if [[ -f "$1" ]]; then
    if [[ -r "$1" ]]; then
      echo "  OK $1"
    else
      echo "  FAIL (not readable) $1"
      FAIL=1
    fi
  else
    echo "  MISSING $1"
    FAIL=1
  fi
}

check_dir() {
  if [[ -d "$1" ]]; then
    if [[ -r "$1" ]]; then
      echo "  OK $1"
    else
      echo "  FAIL (not readable) $1"
      FAIL=1
    fi
  else
    echo "  MISSING $1"
    FAIL=1
  fi
}

echo "Validating AI setup in $KIBANA_ROOT"
echo ""

echo "Root context:"
check_file "$KIBANA_ROOT/CLAUDE.md"
echo ""

echo "Cursor rules:"
check_dir "$KIBANA_ROOT/.cursor/rules"
for f in "$KIBANA_ROOT/.cursor/rules"/*.mdc; do
  [[ -e "$f" ]] && check_file "$f"
done
echo ""

echo "Cursor skills:"
check_dir "$KIBANA_ROOT/.cursor/skills"
for d in "$KIBANA_ROOT/.cursor/skills"/*/; do
  [[ -d "$d" ]] && check_file "${d}SKILL.md"
done
echo ""

if [[ $FAIL -eq 0 ]]; then
  echo "Validation passed."
  exit 0
else
  echo "Validation failed (missing or unreadable files)."
  exit 1
fi
