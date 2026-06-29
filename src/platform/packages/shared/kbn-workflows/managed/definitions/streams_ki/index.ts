/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import CONTINUOUS_ONBOARDING_YAML from './continuous_onboarding.yaml';
import FEATURES_IDENTIFICATION_YAML from './features_identification.yaml';
import ONBOARDING_YAML from './onboarding.yaml';
import QUERIES_GENERATION_YAML from './queries_generation.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const STREAMS_KI_FEATURES_IDENTIFICATION_WORKFLOW_ID =
  'system-streams-ki-features-identification';
export const STREAMS_KI_QUERIES_GENERATION_WORKFLOW_ID = 'system-streams-ki-queries-generation';
export const STREAMS_KI_ONBOARDING_WORKFLOW_ID = 'system-streams-ki-onboarding';
export const STREAMS_KI_CONTINUOUS_ONBOARDING_WORKFLOW_ID =
  'system-streams-ki-continuous-onboarding';

// lifecycle: 'static' — definition is fixed in code, not user-editable.
// versionStrategy: 'auto' — version bumps are handled automatically on install.
// enablement: 'enforced' — always enabled, cannot be disabled by the user.
const STREAMS_KI_WORKFLOW_MANAGEMENT = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'enforced',
} as const;

// The continuous onboarding workflow is installed disabled and toggled on/off
// by the user via the continuous KI extraction setting.
// enablement: 'restorable' — the user's enabled/disabled choice is preserved
// across upgrades instead of being reset from the YAML.
const STREAMS_KI_CONTINUOUS_ONBOARDING_MANAGEMENT = {
  lifecycle: 'static',
  versionStrategy: 'auto',
  enablement: 'restorable',
} as const;

export const STREAMS_KI_FEATURES_IDENTIFICATION_WORKFLOW = {
  id: STREAMS_KI_FEATURES_IDENTIFICATION_WORKFLOW_ID,
  pluginId: 'streams',
  version: 1,
  billable: false,
  yaml: FEATURES_IDENTIFICATION_YAML,
  management: STREAMS_KI_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const STREAMS_KI_QUERIES_GENERATION_WORKFLOW = {
  id: STREAMS_KI_QUERIES_GENERATION_WORKFLOW_ID,
  pluginId: 'streams',
  version: 1,
  billable: false,
  yaml: QUERIES_GENERATION_YAML,
  management: STREAMS_KI_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const STREAMS_KI_ONBOARDING_WORKFLOW = {
  id: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
  pluginId: 'streams',
  version: 3,
  billable: false,
  yaml: ONBOARDING_YAML,
  management: STREAMS_KI_WORKFLOW_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;

export const STREAMS_KI_CONTINUOUS_ONBOARDING_WORKFLOW = {
  id: STREAMS_KI_CONTINUOUS_ONBOARDING_WORKFLOW_ID,
  pluginId: 'streams',
  version: 1,
  billable: false,
  yaml: CONTINUOUS_ONBOARDING_YAML,
  management: STREAMS_KI_CONTINUOUS_ONBOARDING_MANAGEMENT,
} as const satisfies ManagedWorkflowDefinition;
