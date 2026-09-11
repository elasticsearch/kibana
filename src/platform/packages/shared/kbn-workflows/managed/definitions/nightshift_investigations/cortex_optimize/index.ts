/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import CORTEX_OPTIMIZE_WORKFLOW_YAML from './cortex_optimize_workflow.yaml';
import type { ManagedWorkflowDefinition } from '../../../types';

export const NIGHTSHIFT_CORTEX_OPTIMIZE_WORKFLOW_ID = 'system-nightshift-cortex-optimize';

/**
 * Post-round workflow that updates the Cortex wiki from a completed
 * investigation transcript.
 *
 * `enablement: 'enforced'` — post-round workflows log failures rather than
 * aborting the agent, but enablement must stay on so every investigation
 * writes durable knowledge back.
 */
export const NIGHTSHIFT_CORTEX_OPTIMIZE_WORKFLOW = {
  id: NIGHTSHIFT_CORTEX_OPTIMIZE_WORKFLOW_ID,
  pluginId: 'nightshiftInvestigations',
  version: 1,
  billable: false,
  yaml: CORTEX_OPTIMIZE_WORKFLOW_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;
