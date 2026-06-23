/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  STREAMS_MEMORY_SYNTHESIS_WORKFLOW_ID,
  STREAMS_MEMORY_CONSOLIDATION_WORKFLOW_ID,
  STREAMS_MEMORY_CONVERSATION_SCRAPER_WORKFLOW_ID,
  STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { PluginScopedManagedWorkflowsApi } from '@kbn/workflows/server/types';

const MEMORY_WORKFLOW_IDS = [
  STREAMS_MEMORY_SYNTHESIS_WORKFLOW_ID,
  STREAMS_MEMORY_CONSOLIDATION_WORKFLOW_ID,
  STREAMS_MEMORY_CONVERSATION_SCRAPER_WORKFLOW_ID,
  STREAMS_MEMORY_GAP_DETECTION_WORKFLOW_ID,
] as const;

export const installMemoryWorkflows = async ({
  client,
}: {
  client: PluginScopedManagedWorkflowsApi;
}): Promise<void> => {
  for (const id of MEMORY_WORKFLOW_IDS) {
    await client.install(id, { spaceId: DEFAULT_SPACE_ID });
  }
};
