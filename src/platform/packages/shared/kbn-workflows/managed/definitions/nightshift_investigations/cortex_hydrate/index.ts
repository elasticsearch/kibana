/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import CORTEX_HYDRATE_WORKFLOW_YAML from './cortex_hydrate_workflow.yaml';
import type { ManagedWorkflowDefinition } from '../../../types';

export const NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID = 'system-nightshift-cortex-hydrate';

/**
 * Pre-execution workflow that writes Cortex wiki pages into /workspace/cortex
 * before every investigator round.
 *
 * `enablement: 'enforced'` — a disabled workflow makes the beforeAgent hook
 * throw, which aborts the investigation.
 */
export const NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW = {
  id: NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID,
  pluginId: 'nightshiftInvestigations',
  version: 1,
  billable: false,
  yaml: CORTEX_HYDRATE_WORKFLOW_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;
