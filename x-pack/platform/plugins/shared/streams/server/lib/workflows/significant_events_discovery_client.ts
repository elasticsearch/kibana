/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { SIGEVENTS_ORCHESTRATOR_WORKFLOW_ID } from '@kbn/workflows/managed';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import { isTerminalStatus } from '@kbn/workflows';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { type SignificantEventsWorkflowStatusResult } from '@kbn/streams-schema';
import { WorkflowExecutionService } from './workflow_execution_service';

export interface SignificantEventsDiscoveryRunParams {
  request: KibanaRequest;
  spaceId: string;
}

/**
 * Status result for the significant events discovery workflow.
 * Currently has no workflow-specific completion data (T defaults to {}).
 * Extend the generic when the discovery pipeline produces structured output.
 */
export class SignificantEventsDiscoveryClient {
  private readonly workflowExecutionService: WorkflowExecutionService;

  constructor({ managementApi }: { managementApi: WorkflowsServerPluginSetup['management'] }) {
    this.workflowExecutionService = new WorkflowExecutionService({
      managementApi,
      workflowId: SIGEVENTS_ORCHESTRATOR_WORKFLOW_ID,
      workflowSpaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
  }

  async run({ request, spaceId }: SignificantEventsDiscoveryRunParams): Promise<{
    executionId: string;
    isNew: boolean;
  }> {
    const lastExecution = await this.workflowExecutionService.getLastExecution(spaceId);
    if (lastExecution && !isTerminalStatus(lastExecution.status)) {
      return { executionId: lastExecution.id, isNew: false };
    }

    const executionId = await this.workflowExecutionService.execute({
      executionSpaceId: spaceId,
      request,
    });
    return { executionId, isNew: true };
  }

  async cancel({
    request,
    spaceId,
  }: {
    request: KibanaRequest;
    spaceId: string;
  }): Promise<string | null> {
    return this.workflowExecutionService.cancelLatest({ spaceId, request });
  }

  async getStatus({
    spaceId,
  }: {
    spaceId: string;
  }): Promise<SignificantEventsWorkflowStatusResult> {
    return this.workflowExecutionService.getStatus({ spaceId });
  }
}
