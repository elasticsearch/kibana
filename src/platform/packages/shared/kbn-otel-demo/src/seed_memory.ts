/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';

interface MemoryPage {
  name: string;
  title: string;
  content: string;
  categories: string[];
  tags: string[];
}

interface SeedMemoryOptions {
  kibanaUrl: string;
  username: string;
  password: string;
  version: string;
  log: ToolingLog;
}

const getOtelDemoMemoryPages = (version: string): MemoryPage[] => [
  {
    name: 'otel-demo-overview',
    title: 'OpenTelemetry Demo - Overview',
    categories: ['otel-demo'],
    tags: ['demo', 'otel-demo', 'minikube', 'kubernetes'],
    content: `# OpenTelemetry Demo

A reference microservices application (11 services in multiple languages) instrumented with OpenTelemetry. Used as a realistic demo environment for observability testing.

## Infrastructure

The demo runs on **minikube** in the Kubernetes namespace \`otel-demo\`. There is **no Infrastructure-as-Code** — all configuration is applied live to the running cluster directly via \`kubectl\`. Runtime changes (environment variables, scaling, restarts) are made with \`kubectl set env\`, \`kubectl rollout restart\`, or \`kubectl apply\`, not through version-controlled manifests.

Because changes are applied directly and not stored in git, diagnosing issues requires checking the live cluster state, not any manifest file.

Useful kubectl operations:

\`\`\`bash
# List all deployments
kubectl get deployments -n otel-demo

# Check a service's current environment variables
kubectl set env deployment/<service> --list -n otel-demo

# Restart a service
kubectl rollout restart deployment/<service> -n otel-demo

# Stream logs from a service
kubectl logs -n otel-demo deployment/<service> -f

# View recent events (useful after failures)
kubectl get events -n otel-demo --sort-by='.lastTimestamp'
\`\`\`

## Services

| Service | Language | Internal port |
|---------|----------|---------------|
| frontend | Go | 8080 |
| cart | C#/.NET | 7070 |
| checkout | Go | 5050 |
| currency | C++ | 7285 |
| recommendation | Python | 9001 |
| payment | JavaScript | 50051 |
| product-catalog | Go | 3550 |
| shipping | Rust | 50051 |
| ad | Java | 9555 |
| email | Ruby | 6060 |
| quote | PHP | 8090 |
| valkey | Redis-compatible cache | 6379 |
| flagd | Feature flag daemon | 8013 |
| load-generator | Python/Locust | 8089 |

## Feature Flags

The demo code contains error-injection feature flags controlled by \`flagd\` (e.g. \`productCatalogFailure\`, \`cartServiceFailure\`). **These are never enabled in this environment.** When investigating errors or anomalies, ignore any feature-flag-related code paths — they are not the cause. Focus on real runtime signals (logs, traces, live cluster state) rather than the flag-based fault-injection logic in the source.

## Source Code & Code Search

Repository: \`open-telemetry/opentelemetry-demo\` (tag \`v${version}\`). Each service lives under \`src/<service-name>/\` in the repository.

The source code is indexed in Semantic Code Search. Use the workflow tools below to investigate code — find log message origins, confirm exact error strings, understand service behaviour, and trace git history. All workflows accept \`repository: "open-telemetry/opentelemetry-demo"\`.

> **Note (interim):** These capabilities are normally loaded as Agent Builder skills (\`scs-code-history-files\`, \`scs-code-history-search\`). Until skill assignment is resolved, invoke the underlying workflows directly via \`execute_workflow\`.

### Code search workflows

| Workflow ID | What it does | Key inputs |
|-------------|-------------|------------|
| \`scs-semantic-search\` | Semantic search over source code — find log strings, error types, dependency calls | \`query\`, \`repository\` |
| \`scs-read-file-from-chunks\` | Read full file content by path | \`file_paths\`, \`repository\` |
| \`scs-symbol-analysis\` | Resolve a specific symbol (class, function, constant) to definitions and usages | \`symbol_name\`, \`repository\` |
| \`scs-list-repos\` | List indexed repositories | _(no inputs)_ |
| \`scs-discover-directories\` | Explore directory structure of the codebase | \`repository\` |
| \`scs-map-symbols\` | Count symbols per file in a directory | \`directory\`, \`repository\` |

### Git history workflows

| Workflow ID | What it does | Key inputs |
|-------------|-------------|------------|
| \`scs-get-file-history\` | List commits that touched a file (newest-first) | \`file_path\`, \`repository\` |
| \`scs-get-commit\` | Full commit details (message, author, diffs) | \`commit_hash\`, \`repository\` |
| \`scs-find-introducing-commit\` | Find commit that first introduced an exact phrase/symbol | \`symbol_pattern\`, \`repository\` |
| \`scs-get-file-authors\` | Contributor leaderboard for one or more files | \`file_paths\`, \`repository\` |
| \`scs-search-commit-messages\` | Semantic search over commit messages by intent | \`query\`, \`repository\` |
| \`scs-get-cochanges\` | Files that frequently change together (coupling analysis) | \`file_path\`, \`repository\` |

### Usage guidance

**Tool selection** (cheapest first):
1. Know a symbol name → \`scs-symbol-analysis\`
2. Conceptual question → \`scs-semantic-search\` → follow up with \`scs-read-file-from-chunks\` for full file
3. File timeline / git history → \`scs-get-file-history\` → \`scs-get-commit\`
4. Unknown structure → \`scs-discover-directories\` first

**Example — find what error strings cart service logs:**
\`\`\`
execute_workflow(workflowId="scs-semantic-search", inputs={"query": "error log messages cart service", "repository": "open-telemetry/opentelemetry-demo"})
\`\`\`

**Example — confirm when a behaviour was introduced:**
\`\`\`
execute_workflow(workflowId="scs-search-commit-messages", inputs={"query": "add redis connection retry", "repository": "open-telemetry/opentelemetry-demo"})
\`\`\`

Always use full 40-character commit hashes with \`scs-get-commit\`. The code may be a different version than what is running — treat it as a hint to refine queries, not as ground truth.
`,
  },
  {
    name: 'otel-demo-telemetry',
    title: 'OpenTelemetry Demo - Telemetry & Log Location',
    categories: ['otel-demo'],
    tags: ['demo', 'otel-demo', 'elasticsearch', 'logs', 'telemetry'],
    content: `# OTel Demo Telemetry

## Logs

All service logs are shipped by the EDOT Collector (Elastic Distribution of OpenTelemetry Collector) running in the \`otel-demo\` namespace and land in the **\`logs.otel\`** data stream in Elasticsearch.

Key fields:
- \`service.name\` — matches service names (\`cart\`, \`frontend\`, \`checkout\`, etc.)
- \`log.level\` / \`severity_text\` — log severity
- \`body\` — the log message
- \`@timestamp\` — event time
- \`trace_id\`, \`span_id\` — for correlation with traces

Example ES|QL queries:

\`\`\`esql
-- Recent errors from the cart service
FROM logs.otel
| WHERE service.name == "cart" AND log.level == "ERROR"
| SORT @timestamp DESC
| LIMIT 50

-- Error counts by service
FROM logs.otel
| WHERE log.level == "ERROR"
| STATS count = COUNT() BY service.name
| SORT count DESC
\`\`\`

## Traces

Distributed traces land in \`traces-apm.*\` indices (APM-compatible format via EDOT Collector).

## Metrics

Service metrics go to \`metrics-apm.*\` indices.

## Collector

The EDOT Collector runs as a pod in the \`otel-demo\` namespace and handles all telemetry routing. Its configuration is generated by the demo startup script and applied to the cluster via \`kubectl\`.
`,
  },
];

const INTERNAL_HEADERS = {
  'kbn-xsrf': 'true',
  'x-elastic-internal-origin': 'kibana',
};

async function getExistingId(
  kibanaUrl: string,
  name: string,
  authHeader: string
): Promise<string | undefined> {
  const response = await fetch(
    `${kibanaUrl}/internal/streams/memory/entries/by-name?name=${encodeURIComponent(name)}`,
    { headers: { ...INTERNAL_HEADERS, Authorization: authHeader } }
  );
  if (!response.ok) return undefined;
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function deletePage(kibanaUrl: string, id: string, authHeader: string): Promise<void> {
  const response = await fetch(`${kibanaUrl}/internal/streams/memory/entries/${id}`, {
    method: 'DELETE',
    headers: { ...INTERNAL_HEADERS, Authorization: authHeader },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete memory page "${id}": ${response.status} ${text}`);
  }
}

async function createPage(kibanaUrl: string, page: MemoryPage, authHeader: string): Promise<void> {
  const response = await fetch(`${kibanaUrl}/internal/streams/memory/entries`, {
    method: 'POST',
    headers: { ...INTERNAL_HEADERS, 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      name: page.name,
      title: page.title,
      content: page.content,
      categories: page.categories,
      tags: page.tags,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create memory page "${page.name}": ${response.status} ${text}`);
  }
}

async function listAllPages(
  kibanaUrl: string,
  authHeader: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch(`${kibanaUrl}/internal/streams/memory/search`, {
    method: 'POST',
    headers: { ...INTERNAL_HEADERS, 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ query: '', size: 50 }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list memory pages: ${response.status} ${text}`);
  }
  const body = (await response.json()) as { entries?: Array<{ id: string; name: string }> };
  return body.entries ?? [];
}

export async function seedMemory({
  kibanaUrl,
  username,
  password,
  version,
  log,
}: SeedMemoryOptions) {
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const pages = getOtelDemoMemoryPages(version);
  const ownedNames = new Set(pages.map((p) => p.name));

  log.info('Seeding significant event memory pages...');

  const existing = await listAllPages(kibanaUrl, authHeader);
  for (const entry of existing) {
    if (!ownedNames.has(entry.name)) {
      log.info(`  Deleting unrelated memory page "${entry.name}"`);
      await deletePage(kibanaUrl, entry.id, authHeader);
    }
  }

  for (const page of pages) {
    const existingId = await getExistingId(kibanaUrl, page.name, authHeader);
    if (existingId) {
      log.info(`  Deleting existing memory page "${page.name}" before re-seeding`);
      await deletePage(kibanaUrl, existingId, authHeader);
    }
    await createPage(kibanaUrl, page, authHeader);
    log.info(`  Created memory page "${page.name}"`);
  }

  log.info('Memory seeding complete.');
}
