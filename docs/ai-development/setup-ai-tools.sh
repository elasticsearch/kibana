#!/usr/bin/env bash
# Install Kibana AI tools (Cursor rules, skills, CLAUDE.md) into this repo.
# Usage: ./docs/ai-development/setup-ai-tools.sh [kibana_root]
# Default kibana_root is the repo root (parent of docs/). Run from Kibana repo root.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DELIVERABLES_DIR="$SCRIPT_DIR"
KIBANA_ROOT="${1:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

if [[ ! -f "$KIBANA_ROOT/package.json" ]]; then
  echo "Usage: $0 [kibana_root]"
  echo "Example: $0 ~/Projects/kibana"
  echo "Error: $KIBANA_ROOT does not look like a Kibana root (no package.json)."
  exit 1
fi

KIBANA_ROOT="$(cd "$KIBANA_ROOT" && pwd)"
echo "Installing AI tools from $DELIVERABLES_DIR into $KIBANA_ROOT"

# Create .cursor if missing
mkdir -p "$KIBANA_ROOT/.cursor"

# Copy rules (merge into existing .cursor/rules)
mkdir -p "$KIBANA_ROOT/.cursor/rules"
cp -R "$DELIVERABLES_DIR/rules/"* "$KIBANA_ROOT/.cursor/rules/"
echo "  - Installed rules into .cursor/rules/"

# Copy skills (merge into existing .cursor/skills)
mkdir -p "$KIBANA_ROOT/.cursor/skills"
cp -R "$DELIVERABLES_DIR/skills/"* "$KIBANA_ROOT/.cursor/skills/"
echo "  - Installed skills into .cursor/skills/"

# Copy CLAUDE.md to repo root
cp "$DELIVERABLES_DIR/CLAUDE.md" "$KIBANA_ROOT/CLAUDE.md"
echo "  - Installed CLAUDE.md at repo root"

echo "Done. Validate with: $DELIVERABLES_DIR/validate-ai-setup.sh $KIBANA_ROOT"
