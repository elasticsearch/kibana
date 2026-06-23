/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import GAP_DETECTION_YAML from './gap_detection.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID = 'system-streams-memory-gap-detection';

export const STREAMS_MEMORY_GAP_DETECTION_WORKFLOW = {
  id: STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID,
  pluginId: 'streams',
  version: 1,
  yaml: GAP_DETECTION_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'restorable',
  },
} as const satisfies ManagedWorkflowDefinition;
