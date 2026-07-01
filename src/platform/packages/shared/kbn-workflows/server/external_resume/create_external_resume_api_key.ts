/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { WORKFLOW_EXTERNAL_RESUME_APPLICATION, WORKFLOW_EXTERNAL_RESUME_ROLE } from './constants';

export interface ExternalResumeApiKey {
  id: string;
  encoded: string;
  expiration?: number;
}

export async function createExternalResumeApiKey({
  esClient,
  executionId,
  stepId,
  workflowId,
  spaceId,
  expiration,
}: {
  esClient: ElasticsearchClient;
  executionId: string;
  stepId: string;
  workflowId: string;
  spaceId: string;
  expiration: string;
}): Promise<ExternalResumeApiKey> {
  return esClient.security.createApiKey({
    name: `workflow-external-resume-${executionId}-${stepId}`,
    expiration,
    role_descriptors: {
      [WORKFLOW_EXTERNAL_RESUME_ROLE]: {
        cluster: [],
        indices: [],
        applications: [],
        run_as: [],
      },
    },
    metadata: {
      application: WORKFLOW_EXTERNAL_RESUME_APPLICATION,
      workflow_execution_id: executionId,
      workflow_id: workflowId,
      workflow_space_id: spaceId,
      workflow_step_id: stepId,
    },
  });
}

export async function invalidateExternalResumeApiKey(
  esClient: ElasticsearchClient,
  apiKeyId: string
): Promise<void> {
  await esClient.security.invalidateApiKey({ ids: [apiKeyId] });
}
