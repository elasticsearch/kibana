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

export const SIGNIFICANT_EVENTS_DETECTION_WORKFLOW_ID = 'system-significant-events-detection';
export const SIGNIFICANT_EVENTS_DISCOVERY_WORKFLOW_ID = 'system-significant-events-discovery';
export const SIGNIFICANT_EVENTS_ORCHESTRATOR_WORKFLOW_ID = 'system-significant-events-orchestrator';
export const SIGNIFICANT_EVENTS_TRIAGE_WORKFLOW_ID = 'system-significant-events-triage';

// lifecycle: 'static' — instances are declared at startup; orphans are cleaned up on restart.
// versionStrategy: 'auto' — version bumps are handled automatically on install.
// enablement: 'enforced' — always enabled, cannot be disabled by the user.
const SIGNIFICANT_EVENTS_WORKFLOW_MANAGEMENT = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'enforced',
} as const;

export const SIGNIFICANT_EVENTS_DETECTION_WORKFLOW = {
  id: SIGNIFICANT_EVENTS_DETECTION_WORKFLOW_ID,
  pluginId: 'streams',
  version: 2,
  billable: false,
  yaml: DETECTION_YAML,
  management: SIGNIFICANT_EVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGNIFICANT_EVENTS_DISCOVERY_WORKFLOW = {
  id: SIGNIFICANT_EVENTS_DISCOVERY_WORKFLOW_ID,
  pluginId: 'streams',
  version: 4,
  billable: false,
  yaml: DISCOVERY_YAML,
  management: SIGNIFICANT_EVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGNIFICANT_EVENTS_ORCHESTRATOR_WORKFLOW = {
  id: SIGNIFICANT_EVENTS_ORCHESTRATOR_WORKFLOW_ID,
  pluginId: 'streams',
  version: 2,
  billable: false,
  yaml: ORCHESTRATOR_YAML,
  management: SIGNIFICANT_EVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const SIGNIFICANT_EVENTS_TRIAGE_WORKFLOW = {
  id: SIGNIFICANT_EVENTS_TRIAGE_WORKFLOW_ID,
  pluginId: 'streams',
  version: 5,
  billable: false,
  yaml: TRIAGE_YAML,
  management: SIGNIFICANT_EVENTS_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;
