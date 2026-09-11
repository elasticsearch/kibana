/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvalConnector } from '@kbn/evals';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  RULE_CREATION_WORKFLOW_ID,
  WORKFLOWS_API_VERSION,
  DRAFT_STEP_ID,
  REVIEW_STEP_ID,
} from './constants';

// The model connector (used by the workflow's ai.agent step) is not checked here — if it is
// misconfigured the workflow execution will fail loudly on its own. Only the judge connector
// can fail silently: a missing judge causes LLM evaluators to return N/A with no obvious error.
export const ensureJudgeConnectorAccessible = async ({
  fetch,
  connector,
  log,
}: {
  fetch: HttpHandler;
  connector: EvalConnector;
  log: ToolingLog;
}): Promise<void> => {
  log.info(`Verifying AI connector: ${connector.name} (${connector.id})`);
  try {
    await fetch(`/api/actions/connector/${encodeURIComponent(connector.id)}`, { method: 'GET' });
    log.info('AI connector is accessible — proceeding with eval run');
  } catch (err) {
    throw new Error(
      `AI connector "${connector.name}" (${connector.id}) is not accessible. ` +
        `Ensure it is configured and enabled in Stack Management > Connectors ` +
        `before running this eval suite. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

/**
 * The step names the client and evaluators address. The managed workflow's yaml is the source of
 * truth — this pins the contract the suite depends on so renaming a step in the yaml fails setup
 * here instead of surfacing as opaque timeouts in every downstream lookup.
 */
/**
 * Prompt clauses the scored evaluators depend on. Kept as loose patterns: this asserts the
 * behaviour contract is present, not the exact wording (the wording itself is pinned by
 * workflow_contract.test.ts against the checked-in definition).
 */
export const REQUIRED_STEP_IDS = [DRAFT_STEP_ID, REVIEW_STEP_ID] as const;

/**
 * Parses the installed workflow's step names out of its yaml without a yaml dependency:
 * every `  - name: <id>` under the `steps:` key is a step declaration. Any non-indented
 * line moves the cursor to that top-level key, so `- name:` items under `outputs:` or
 * `triggers:` are never collected.
 */
const parseStepNames = (yaml: string): string[] => {
  const names: string[] = [];
  let inSteps = false;
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inSteps = /^steps:/.test(line);
    } else {
      const match = /^ {2}- name: (.+)$/.exec(line);
      if (inSteps && match) {
        names.push(match[1].trim());
      }
    }
  }
  return names;
};

/**
 * Asserts the managed rule-creation workflow the alertzero plugin installs at start is present, and
 * returns its yaml.
 *
 * This deliberately does NOT create the workflow. The eval must measure the artifact production
 * ships — if the suite carried its own copy of the yaml, or created one on the fly, it would score
 * green against a document that no user ever runs while the real workflow regressed unobserved.
 * A missing workflow is an environment failure and should fail loudly here rather than surface as
 * mystery zeroes across every evaluator.
 */
export const assertWorkflowInstalled = async ({
  fetch,
  log,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
}): Promise<{ yaml: string }> => {
  log.info(`Checking managed workflow: ${RULE_CREATION_WORKFLOW_ID}`);
  let workflow: { yaml: string };
  try {
    workflow = await fetch<{ yaml: string }>(
      `/api/workflows/workflow/${RULE_CREATION_WORKFLOW_ID}`,
      {
        method: 'GET',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      }
    );
    log.info('Managed workflow is installed — proceeding with eval run');
  } catch (err) {
    throw new Error(
      `Managed workflow "${RULE_CREATION_WORKFLOW_ID}" is not installed. It is installed at ` +
        `plugin start by the alertzero plugin (installStatic / ALERTZERO_WATCH_WORKFLOW_IDS), so this ` +
        `usually means the alertzero plugin is disabled or the Workflows feature is unavailable. ` +
        `This suite does not create the workflow itself: it must measure the workflow that ships. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // The installed document must still expose the step ids the client and evaluators
  // address by name. A rename in the managed yaml previously surfaced downstream as an
  // opaque "step not found in waiting state" poll timeout, not a setup failure.
  const stepNames = parseStepNames(workflow.yaml);
  const missing = REQUIRED_STEP_IDS.filter((id) => !stepNames.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `Managed workflow "${RULE_CREATION_WORKFLOW_ID}" no longer declares step(s) ` +
        `${missing.join(', ')} (found: ${stepNames.join(', ')}). The eval client and evaluators ` +
        `address steps by id — update DRAFT_STEP_ID / REVIEW_STEP_ID in src/constants.ts when ` +
        `the managed yaml renames them.`
    );
  }

  return workflow;
};
