/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import DETECTION_YAML from './detection.yaml';
import DISCOVERY_YAML from './discovery.yaml';
import ORCHESTRATOR_YAML from './orchestrator.yaml';
import TRIAGE_YAML from './triage.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const SIGEVENTS_DETECTION_WORKFLOW_ID = 'system-significant-events-detection';
export const SIGEVENTS_DISCOVERY_WORKFLOW_ID = 'system-significant-events-discovery';
export const SIGEVENTS_ORCHESTRATOR_WORKFLOW_ID = 'system-significant-events-orchestrator';
export const SIGEVENTS_TRIAGE_WORKFLOW_ID = 'system-significant-events-triage';

// lifecycle: 'static' — instances are declared at startup; orphans are cleaned up on restart.
// versionStrategy: 'auto' — version bumps are handled automatically on install.
// enablement: 'enforced' — always enabled, cannot be disabled by the user.
const SIGEVENTS_WORKFLOW_MANAGEMENT = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'enforced',
} as const;

export const SIGEVENTS_DETECTION_WORKFLOW = {
  id: SIGEVENTS_DETECTION_WORKFLOW_ID,
  pluginId: 'streams',
  version: 2,
  yaml: DETECTION_YAML,
  management: SIGEVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGEVENTS_DISCOVERY_WORKFLOW = {
  id: SIGEVENTS_DISCOVERY_WORKFLOW_ID,
  pluginId: 'streams',
  version: 3,
  yaml: DISCOVERY_YAML,
  management: SIGEVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGEVENTS_ORCHESTRATOR_WORKFLOW = {
  id: SIGEVENTS_ORCHESTRATOR_WORKFLOW_ID,
  pluginId: 'streams',
  version: 1,
  yaml: ORCHESTRATOR_YAML,
  management: SIGEVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGEVENTS_TRIAGE_WORKFLOW = {
  id: SIGEVENTS_TRIAGE_WORKFLOW_ID,
  pluginId: 'streams',
  version: 3,
  yaml: TRIAGE_YAML,
  management: SIGEVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;
