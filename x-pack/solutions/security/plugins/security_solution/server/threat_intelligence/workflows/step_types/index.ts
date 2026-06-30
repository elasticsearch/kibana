/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { PluginStartContract as ActionsPluginStartContract } from '@kbn/actions-plugin/server';
import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import { buildFetchSourceStepDefinition } from './fetch_source/fetch_source_step';

/**
 * Register threat-intelligence-owned workflow step types on the
 * `workflowsExtensions` setup contract.
 *
 * Today this lands the single `threat_intel.fetch_source` step that
 * collapses the per-adapter `switch` in `workflows/source_ingestion.yaml`
 * into a server-side dispatcher. Future threat-intelligence step types
 * (e.g. `threat_intel.compute_fingerprint` if we want to expose the
 * Liquid filter as a step, `threat_intel.fetch_taxii_paged` if TAXII
 * paging gets its own step rather than living inside the dispatcher)
 * can land here too.
 *
 * `getActionsStart` is optional and lazily resolves the actions plugin's
 * start contract. Adapters that route credentialed feeds through the
 * Connectors v2 framework (currently TAXII when a source has
 * `config.connector_id` set) call it on demand. Anonymous feeds ignore
 * it.
 *
 * Caller is expected to invoke this only when the optional
 * `workflowsExtensions` plugin is present and the
 * `threatIntelligenceSkillEnabled` experimental feature is on. The
 * function does not re-check the gate so the call site can colocate
 * the gate with `installBuiltinWorkflows` (which has the same
 * conditions).
 */
export const registerThreatIntelligenceWorkflowSteps = ({
  workflowsExtensions,
  logger,
  getActionsStart,
}: {
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup;
  logger: Logger;
  getActionsStart?: () => Promise<ActionsPluginStartContract | undefined>;
}): void => {
  workflowsExtensions.registerStepDefinition(
    buildFetchSourceStepDefinition({ logger, getActionsStart })
  );
};
