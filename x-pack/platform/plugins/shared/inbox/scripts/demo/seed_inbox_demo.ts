/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Local-dev seeder. Imports the demo workflow YAMLs (one per input field
 * type from #16707, plus a multi-HITL chain and a short-timeout case)
 * into a running Kibana, then triggers a manual run for each so they
 * pause on `waitForInput` and surface in the Inbox.
 *
 * Usage:
 *   node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts
 *
 * Flags:
 *   --reset              Before seeding, hard-delete any existing
 *                        `inbox-demo-*` workflows (and their step-execution
 *                        docs) so re-runs stay idempotent instead of piling
 *                        up duplicate `inbox-demo-*-N` workflows. Safe to
 *                        combine with --respond.
 *   --respond            After seeding, auto-respond to a subset of the
 *                        pending rows so the inbox-history audit feed
 *                        has rows to render. Mixes approve/reject payloads,
 *                        rotates the response `channel` (so every per-channel
 *                        badge shows up), and rotates the *responder identity*
 *                        across a few demo users (so the history "Responder"
 *                        facet has more than one bucket). Two categories of
 *                        rows are intentionally left pending so the
 *                        "Awaiting response" surface isn't empty:
 *                          - the short-timeout workflow (its timeout fires and
 *                            produces an abnormal-settle history row), and
 *                          - a curated set of reasoning-bearing workflows, so
 *                            the soft-interface `reasoning` render is visible
 *                            on live pending rows in the Respond flyout.
 *
 * Env overrides (defaults match `yarn start --no-base-path`):
 *   KIBANA_URL=http://localhost:5601
 *   KIBANA_USERNAME=elastic
 *   KIBANA_PASSWORD=changeme
 *
 * Pre-reqs: Workflows + Inbox enabled in `kibana.dev.yml`:
 *   xpack.inbox.enabled: true
 *
 * The script is intentionally dependency-light — no SDK, just `fetch`.
 */

import { promises as fs } from 'fs';
import path from 'path';

interface SeedConfig {
  kibanaUrl: string;
  username: string;
  password: string;
  spaceId: string;
}

const CONFIG: SeedConfig = {
  kibanaUrl: process.env.KIBANA_URL ?? 'http://localhost:5601',
  username: process.env.KIBANA_USERNAME ?? 'elastic',
  password: process.env.KIBANA_PASSWORD ?? 'changeme',
  spaceId: process.env.KIBANA_SPACE_ID ?? 'default',
};

const ARGS = new Set(process.argv.slice(2));
const SHOULD_RESPOND = ARGS.has('--respond');
const SHOULD_RESET = ARGS.has('--reset');

// All demo workflow names share this prefix (see workflows/*.yml). Used by
// `--reset` to find and hard-delete prior demo runs so the seeder is
// re-runnable without piling up duplicate `inbox-demo-*-N` workflows.
const DEMO_WORKFLOW_NAME_PREFIX = 'inbox-demo';

const WORKFLOWS_DIR = path.resolve(__dirname, 'workflows');
// Workflows whose runs should *not* be auto-responded to in `--respond`
// mode because they drive a special history state. Currently only the
// short-timeout case, which relies on the workflow timeout firing to
// populate an abnormal-settle history row. Match by file basename (no
// extension) for stability.
const SKIP_RESPOND_FILES = new Set(['08_short_timeout']);
// Reasoning-bearing workflows we deliberately leave pending in `--respond`
// mode so the "Awaiting response" surface shows the soft-interface
// `reasoning` render on live pending rows (not just in processed history).
// The remaining reasoning workflows (02, 03, 05) still get responded to, so
// the history feed keeps a healthy mix of reasoning rows too.
const LEAVE_PENDING_FILES = new Set([
  '01_string_input',
  '04_enum_input',
  '06_required_with_defaults',
]);

const authHeader = (config: SeedConfig) =>
  `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;

const headers = (config: SeedConfig) => ({
  authorization: authHeader(config),
  'kbn-xsrf': 'inbox-seed',
  'content-type': 'application/json',
});

// The workflows management API is `access: 'public'` and versioned
// at `2023-10-31` (see workflows_management/.../route_constants.ts).
// Without the `elastic-api-version` header Kibana's versioned router
// returns 404 for public routes, which is what bites the seeder if
// it only sends auth + xsrf.
const workflowsHeaders = (config: SeedConfig) => ({
  ...headers(config),
  'elastic-api-version': '2023-10-31',
});

const inboxHeaders = (config: SeedConfig) => ({
  ...headers(config),
  // Internal API requires the elastic-api-version pin; aligned with
  // the inbox plugin's API_VERSIONS constant.
  'elastic-api-version': '1',
});

// Kibana's user-management route (`POST /internal/security/users/{username}`)
// is an unversioned internal route, so it doesn't take `elastic-api-version`
// but does expect the internal-origin marker. `kbn-xsrf` is already set by
// `headers()`.
const securityHeaders = (config: SeedConfig) => ({
  ...headers(config),
  'x-elastic-internal-origin': 'kibana',
});

const spacePrefix = (config: SeedConfig) =>
  config.spaceId === 'default' ? '' : `/s/${config.spaceId}`;

const log = (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[seed-inbox-demo] ${message}`);
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ImportedWorkflow {
  file: string;
  basename: string;
  workflowId: string;
}

const importWorkflow = async (
  config: SeedConfig,
  name: string,
  yaml: string
): Promise<{ id: string }> => {
  const url = `${config.kibanaUrl}${spacePrefix(config)}/api/workflows/workflow`;
  const response = await fetch(url, {
    method: 'POST',
    headers: workflowsHeaders(config),
    body: JSON.stringify({ yaml }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to import workflow "${name}" (HTTP ${response.status}): ${text}`);
  }
  return (await response.json()) as { id: string };
};

const triggerWorkflow = async (config: SeedConfig, workflowId: string) => {
  const url = `${config.kibanaUrl}${spacePrefix(config)}/api/workflows/workflow/${workflowId}/run`;
  const response = await fetch(url, {
    method: 'POST',
    headers: workflowsHeaders(config),
    body: JSON.stringify({ inputs: {} }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to trigger workflow "${workflowId}" (HTTP ${response.status}): ${text}`
    );
  }
};

interface WorkflowListItem {
  id: string;
  name: string;
}

const listDemoWorkflowIds = async (config: SeedConfig): Promise<string[]> => {
  const url = `${config.kibanaUrl}${spacePrefix(config)}/api/workflows?query=${encodeURIComponent(
    DEMO_WORKFLOW_NAME_PREFIX
  )}&size=1000`;
  const response = await fetch(url, { headers: workflowsHeaders(config) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list workflows for reset (HTTP ${response.status}): ${text}`);
  }
  const body = (await response.json()) as { results?: WorkflowListItem[] };
  // The free-text `query` is best-effort; re-check the prefix client-side so
  // we never delete a non-demo workflow that happened to match.
  return (body.results ?? [])
    .filter((w) => typeof w.name === 'string' && w.name.startsWith(DEMO_WORKFLOW_NAME_PREFIX))
    .map((w) => w.id);
};

const cancelWorkflowExecutions = async (config: SeedConfig, workflowId: string): Promise<void> => {
  const url = `${config.kibanaUrl}${spacePrefix(
    config
  )}/api/workflows/workflow/${encodeURIComponent(workflowId)}/executions/cancel`;
  // Best-effort: a workflow with no active executions still returns ok; any
  // failure here just means the subsequent hard-delete may fall back to a
  // soft-delete, which is still enough to clean the inbox.
  await fetch(url, { method: 'POST', headers: workflowsHeaders(config) }).catch(() => undefined);
};

const bulkDeleteWorkflows = async (
  config: SeedConfig,
  ids: string[],
  force: boolean
): Promise<Response> => {
  const url = `${config.kibanaUrl}${spacePrefix(config)}/api/workflows?force=${force}`;
  return fetch(url, {
    method: 'DELETE',
    headers: workflowsHeaders(config),
    body: JSON.stringify({ ids }),
  });
};

const resetDemoWorkflows = async (config: SeedConfig) => {
  const ids = await listDemoWorkflowIds(config);
  if (ids.length === 0) {
    log('Reset: no existing demo workflows to delete.');
    return;
  }

  // Runs parked on `waitForInput` count as active executions, which the
  // engine refuses to force-delete (HTTP 409). Cancel them first, give Task
  // Manager a moment to settle the cancellation, then hard-delete — which
  // also purges the workflows' step-execution docs so the inbox starts clean.
  await Promise.all(ids.map((id) => cancelWorkflowExecutions(config, id)));
  await sleep(3000);

  let response = await bulkDeleteWorkflows(config, ids, true);
  if (response.status === 409) {
    // A cancellation may not have fully settled; one short retry usually clears it.
    await sleep(3000);
    response = await bulkDeleteWorkflows(config, ids, true);
  }

  if (response.ok) {
    log(`Reset: hard-deleted ${ids.length} existing demo workflow(s).`);
    return;
  }

  // Last resort: soft-delete. The inbox orphan-filter hides soft-deleted
  // workflows' rows, so the feed is clean even though the step-exec docs and
  // workflow names linger (re-imports then get an `-N` suffix).
  const hardText = await response.text();
  log(
    `Reset: hard-delete refused (HTTP ${response.status}); falling back to soft-delete. ${hardText}`,
    'warn'
  );
  const soft = await bulkDeleteWorkflows(config, ids, false);
  if (!soft.ok) {
    const softText = await soft.text();
    throw new Error(`Failed to delete demo workflows (HTTP ${soft.status}): ${softText}`);
  }
  log(`Reset: soft-deleted ${ids.length} existing demo workflow(s).`);
};

interface InboxAction {
  id: string;
  source_app: string;
  source_id: string;
  status: 'pending' | 'approved' | 'rejected';
  title: string;
  input_message?: string | null;
  input_schema?: {
    type?: string;
    properties?: Record<string, { type?: string; enum?: string[]; items?: { enum?: string[] } }>;
    required?: string[];
  } | null;
}

const listPendingActions = async (config: SeedConfig): Promise<InboxAction[]> => {
  const url = `${config.kibanaUrl}${spacePrefix(
    config
  )}/internal/inbox/actions?status=pending&per_page=100`;
  const response = await fetch(url, { headers: inboxHeaders(config) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list pending inbox actions (HTTP ${response.status}): ${text}`);
  }
  const body = (await response.json()) as { actions: InboxAction[] };
  return body.actions ?? [];
};

const respondToAction = async (
  config: SeedConfig,
  action: InboxAction,
  input: Record<string, unknown>,
  channel: string,
  // When provided, the response is submitted as this user (its basic-auth
  // credentials replace the configured admin's). The server derives
  // `respondedBy` from the authenticated principal, so this is what spreads
  // the inbox-history "Responder" facet across multiple buckets.
  responder?: DemoResponder
) => {
  const url = `${config.kibanaUrl}${spacePrefix(
    config
  )}/internal/inbox/actions/${encodeURIComponent(action.source_app)}/${encodeURIComponent(
    action.source_id
  )}/respond`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...inboxHeaders(config),
      ...(responder
        ? {
            authorization: `Basic ${Buffer.from(
              `${responder.username}:${responder.password}`
            ).toString('base64')}`,
          }
        : {}),
    },
    body: JSON.stringify({ input, channel }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to respond to action ${action.source_id} (HTTP ${response.status}): ${text}`
    );
  }
};

/**
 * Builds an auto-response payload that satisfies the action's input
 * schema. Branches on the canonical demo shapes (`approved`,
 * `severity`, `reason`, …) so the resulting history rows exercise both
 * approve and reject paths of `deriveHistoryStatus` and the channel
 * badge variants. Returns `null` when the action's schema is shaped in
 * a way the seeder doesn't know how to auto-fill — the caller logs and
 * skips, leaving the row pending.
 */
const buildResponseInput = (
  action: InboxAction,
  index: number
): { input: Record<string, unknown>; intent: 'approve' | 'reject' } | null => {
  // Alternate approve/reject so history shows both badges.
  const intent: 'approve' | 'reject' = index % 3 === 0 ? 'reject' : 'approve';
  const props = action.input_schema?.properties ?? {};
  const payload: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(props)) {
    if (prop?.type === 'boolean') {
      payload[key] = intent === 'approve';
      continue;
    }
    if (prop?.enum && prop.enum.length > 0) {
      // Pick the first option for approve, last for reject so audit
      // payloads visibly differ in the JSON code-block.
      payload[key] = intent === 'approve' ? prop.enum[0] : prop.enum[prop.enum.length - 1];
      continue;
    }
    if (prop?.type === 'array') {
      const items = prop.items?.enum ?? [];
      payload[key] = items.slice(0, intent === 'approve' ? 2 : 1);
      continue;
    }
    if (prop?.type === 'number' || prop?.type === 'integer') {
      payload[key] = intent === 'approve' ? 42 : 13;
      continue;
    }
    if (prop?.type === 'string') {
      payload[key] =
        intent === 'approve'
          ? 'Approved by inbox demo seeder.'
          : 'Rejected by inbox demo seeder — synthetic test data.';
      continue;
    }
    // Unknown prop shape — bail so we don't ship garbage payloads.
    return null;
  }

  // Provide an explicit reject signal alongside the schema fields when
  // none of the schema's own props naturally encode rejection. This
  // exercises the `deriveHistoryStatus` heuristic's fallback paths
  // (`{ action: 'reject' }`) on string-only schemas.
  if (intent === 'reject' && payload.approved === undefined) {
    payload.action = 'reject';
  }

  return { input: payload, intent };
};

// Rotate channels across responses so the inbox-history feed renders
// every per-channel badge variant. `inbox` is the default for the
// in-product UI so we de-emphasize it and lead with the more
// distinctive ones the audit feed would otherwise rarely surface in a
// vanilla local-dev environment. The channel field is a free-form
// slug — `example-mcp-app-security` mirrors the public reference MCP
// app's identifier so its history rows look the same in this demo as
// they will in real customer setups.
const CHANNELS = [
  'example-mcp-app-security',
  'agent_builder',
  'kibana_execution_view',
  'slack',
] as const;

interface DemoResponder {
  username: string;
  password: string;
  fullName?: string;
  /**
   * When true the seeder creates-or-updates the user (idempotent) before
   * responding. The configured admin (`elastic` by default) already exists,
   * so it's left `false`.
   */
  ensure: boolean;
}

/**
 * Demo responders the `--respond` pass rotates through so the inbox-history
 * "Responder" facet has more than one bucket. The configured admin always
 * participates; the extras are native users created on the fly with the
 * `superuser` role (they need to both respond *and* drive the workflow
 * resume). On deployments where native users can't be created (e.g.
 * serverless), `ensureResponder` fails softly and that responder is dropped
 * from the rotation — the seeder still responds as the configured admin.
 */
const buildDemoResponders = (config: SeedConfig): DemoResponder[] => [
  { username: config.username, password: config.password, ensure: false },
  {
    username: 'inbox_demo_sam',
    password: 'changeme',
    fullName: 'Sam Rivera (demo responder)',
    ensure: true,
  },
  {
    username: 'inbox_demo_alex',
    password: 'changeme',
    fullName: 'Alex Chen (demo responder)',
    ensure: true,
  },
];

/**
 * Create-or-update a demo responder via Kibana's user-management API. Returns
 * the responder when it's usable (already existed or was provisioned) and
 * `null` when provisioning failed so the caller can drop it from the rotation.
 */
const ensureResponder = async (
  config: SeedConfig,
  responder: DemoResponder
): Promise<DemoResponder | null> => {
  if (!responder.ensure) {
    return responder;
  }
  const url = `${config.kibanaUrl}${spacePrefix(
    config
  )}/internal/security/users/${encodeURIComponent(responder.username)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: securityHeaders(config),
      body: JSON.stringify({
        username: responder.username,
        password: responder.password,
        roles: ['superuser'],
        full_name: responder.fullName ?? responder.username,
        enabled: true,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      log(
        `Could not provision responder "${responder.username}" (HTTP ${response.status}); dropping from rotation. ${text}`,
        'warn'
      );
      return null;
    }
    log(`Ensured demo responder "${responder.username}".`);
    return responder;
  } catch (err) {
    log(
      `Could not provision responder "${responder.username}": ${String(
        err
      )}; dropping from rotation.`,
      'warn'
    );
    return null;
  }
};

const respondToPendingActions = async (config: SeedConfig, imported: ImportedWorkflow[]) => {
  // Workflow execution (and the corresponding `WAITING_FOR_INPUT` step
  // doc) is queued via Task Manager, so a freshly-triggered run
  // doesn't appear in the inbox immediately. A short wait here is far
  // simpler than polling the listing endpoint.
  log('Waiting 3s for triggered runs to reach WAITING_FOR_INPUT…');
  await sleep(3000);

  const pending = await listPendingActions(config);
  if (pending.length === 0) {
    log('No pending inbox actions to respond to.', 'warn');
    return;
  }

  // Provision the demo responders up front; keep only the ones we can act as.
  const responders = (
    await Promise.all(buildDemoResponders(config).map((r) => ensureResponder(config, r)))
  ).filter((r): r is DemoResponder => r !== null);
  log(`Responder rotation: ${responders.map((r) => r.username).join(', ')}`);

  // Workflows whose pending rows we leave untouched: the timeout case (drives
  // an abnormal-settle history row) and the curated reasoning set (keeps the
  // "Awaiting response" surface populated with visible reasoning).
  const skipForTimeoutIds = new Set(
    imported.filter((w) => SKIP_RESPOND_FILES.has(w.basename)).map((w) => w.workflowId)
  );
  const leavePendingIds = new Set(
    imported.filter((w) => LEAVE_PENDING_FILES.has(w.basename)).map((w) => w.workflowId)
  );
  // `source_id` shape: `${workflowId}:${runId}:${stepExecId}`. A cheap prefix
  // check is enough — the inbox common type guarantees this for the workflows
  // provider (see `buildWorkflowSourceId`).
  const matchesWorkflow = (action: InboxAction, ids: Set<string>) =>
    Array.from(ids).some((wfId) => action.source_id.startsWith(`${wfId}:`));

  let responded = 0;
  let skipped = 0;
  // Dedicated counter (incremented only on an actual response) so the
  // approve/reject intent, channel, and responder spread evenly across the
  // rows we *do* answer — independent of how many we skip.
  let dispatched = 0;
  for (const action of pending) {
    if (matchesWorkflow(action, skipForTimeoutIds)) {
      log(`Skipping ${action.source_id} (reserved for timeout-driven abnormal settle)`);
      skipped++;
      continue;
    }
    if (matchesWorkflow(action, leavePendingIds)) {
      log(`Leaving ${action.source_id} pending (reasoning demo for "Awaiting response")`);
      skipped++;
      continue;
    }

    const built = buildResponseInput(action, dispatched);
    if (!built) {
      log(`Skipping ${action.source_id} — schema not auto-fillable`, 'warn');
      skipped++;
      continue;
    }

    const channel = CHANNELS[dispatched % CHANNELS.length];
    const responder = responders[dispatched % responders.length];
    try {
      await respondToAction(config, action, built.input, channel, responder);
      log(`Responded ${built.intent} as ${responder.username} via ${channel}: ${action.source_id}`);
      responded++;
      dispatched++;
    } catch (err) {
      log(`Failed to respond to ${action.source_id}: ${String(err)}`, 'error');
    }
  }

  log(`Respond pass complete: ${responded} responded, ${skipped} skipped.`);
  if (skipForTimeoutIds.size > 0) {
    log(
      `Wait ~45s for the short-timeout workflow to fire its timeout, then refresh the inbox to see the abnormal-settle history row.`
    );
  }
};

const seed = async () => {
  if (SHOULD_RESET) {
    try {
      await resetDemoWorkflows(CONFIG);
    } catch (err) {
      log(`Reset pass failed (continuing with seed): ${String(err)}`, 'warn');
    }
  }

  log(`Reading demo workflows from ${WORKFLOWS_DIR}`);
  const files = (await fs.readdir(WORKFLOWS_DIR)).filter((file) => file.endsWith('.yml')).sort();

  if (files.length === 0) {
    log('No workflow YAMLs found, nothing to seed', 'warn');
    return;
  }

  const imported: ImportedWorkflow[] = [];
  for (const file of files) {
    const yaml = await fs.readFile(path.join(WORKFLOWS_DIR, file), 'utf8');
    try {
      const { id } = await importWorkflow(CONFIG, file, yaml);
      log(`Imported ${file} -> workflow ${id}`);
      await triggerWorkflow(CONFIG, id);
      log(`Triggered run for workflow ${id}`);
      imported.push({ file, basename: path.basename(file, path.extname(file)), workflowId: id });
    } catch (err) {
      log(String(err), 'error');
    }
  }

  if (SHOULD_RESPOND && imported.length > 0) {
    try {
      await respondToPendingActions(CONFIG, imported);
    } catch (err) {
      log(`Auto-respond pass failed: ${String(err)}`, 'error');
    }
  }

  log(
    `Done. Open ${CONFIG.kibanaUrl}${spacePrefix(CONFIG)}/app/inbox to see the seeded inbox items.`
  );
};

seed().catch((err) => {
  log(String(err), 'error');
  process.exitCode = 1;
});
