/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import INFERENCE_PII_ANONYMIZATION_WORKFLOW_YAML from './inference_pii_anonymization_workflow.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const INFERENCE_PII_ANONYMIZATION_WORKFLOW_ID = 'system-inference_pii_anonymization';

export const INFERENCE_PII_ANONYMIZATION_WORKFLOW = {
  id: INFERENCE_PII_ANONYMIZATION_WORKFLOW_ID,
  pluginId: 'inferenceWorkflows',
  version: 1,
  billable: false,
  yaml: INFERENCE_PII_ANONYMIZATION_WORKFLOW_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'restorable',
  },
} as const satisfies ManagedWorkflowDefinition;
