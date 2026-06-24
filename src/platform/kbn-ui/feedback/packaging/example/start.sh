#!/bin/bash
set -e

# Get the directory where this script is located
EXAMPLE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Navigate to Kibana root (6 levels up from example dir)
KIBANA_ROOT="$( cd "$EXAMPLE_DIR/../../../../../.." && pwd )"

# Use webpack from Kibana's node_modules
"$KIBANA_ROOT/node_modules/.bin/webpack" serve --mode development
