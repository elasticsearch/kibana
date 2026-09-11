/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { UsageApiSetup, UsageRecord } from '@kbn/usage-api-plugin/server';
import { ConversationRoundStepType, ToolResultType } from '@kbn/agent-builder-common';
import { AGENT_EXECUTION_USAGE_TYPE, METERING_SOURCE_ID } from './constants';
import type { AgentExecutionUsage } from './types';

export const createMeteringService = ({
  logger,
  cloud,
  usageApi,
}: {
  logger: Logger;
  cloud: CloudSetup | undefined;
  usageApi: UsageApiSetup | undefined;
}): MeteringService => {
  return new MeteringServiceImpl({ cloud, usageApi, logger });
};

export interface MeteringService {
  reportExecution(execution: AgentExecutionUsage): Promise<void>;
}

class MeteringServiceImpl implements MeteringService {
  private readonly logger: Logger;
  private readonly cloud?: CloudSetup;
  private readonly usageApi?: UsageApiSetup;

  constructor({
    logger,
    cloud,
    usageApi,
  }: {
    logger: Logger;
    cloud: CloudSetup | undefined;
    usageApi: UsageApiSetup | undefined;
  }) {
    this.logger = logger;
    this.cloud = cloud;
    this.usageApi = usageApi;
  }

  public async reportExecution(execution: AgentExecutionUsage) {
    if (!this.cloud || !this.usageApi?.usageReporting) {
      this.logger.debug(
        `[reportExecution] Skipping reporting due to missing cloud or usage reporting dependencies.`
      );
      return;
    }

    const projectId = this.cloud.serverless.projectId;
    const projectOrDeploymentId = projectId ?? this.cloud.deploymentId;
    const instanceGroupType = projectId ? 'serverless_project' : 'stateful_deployment';

    if (!projectOrDeploymentId) {
      this.logger.debug(`[reportExecution] Skipping reporting due to project or deployment ID.`);
      return;
    }

    const {
      agentId,
      executionId,
      conversationId,
      modelProvider,
      roundId,
      roundCount,
      executionCount,
      usage,
      status,
      startedAt,
      timeToFirstToken,
      timeToLastToken,
      steps,
      messageLength,
      responseLength,
    } = execution;

    const toolCallSteps = steps.filter((step) => step.type === ConversationRoundStepType.toolCall);

    const toolCallErrors = toolCallSteps.filter(({ results }) => {
      return results.length > 0 && results.every((r) => r.type === ToolResultType.error);
    });

    const usageMeta: Record<string, string> = {
      time_to_first_token_ms: String(timeToFirstToken),
      time_to_last_token_ms: String(timeToLastToken),
      agent_id: agentId,
      conversation_id: conversationId ?? 'unknown',
      execution_id: executionId,
      round_id: roundId,
      round_number: String(roundCount),
      execution_count: String(executionCount),
      round_status: status,
      started_at: startedAt,
      llm_calls: String(usage.llm_calls),
      input_tokens: String(usage.input_tokens),
      cached_input_tokens: String(usage.cached_input_tokens ?? 0),
      output_tokens: String(usage.output_tokens),
      tool_calls: String(toolCallSteps.length),
      tool_call_errors: String(toolCallErrors.length),
      message_length: String(messageLength),
      response_length: String(responseLength),
      model: usage.model ?? 'unknown',
      model_provider: modelProvider,
    };

    // one unit per 50k input tokens used across the turn
    const usageQuantity = Math.max(1, Math.ceil(usage.input_tokens / 50_000));

    const source: UsageRecord['source'] = {
      id: METERING_SOURCE_ID,
      instance_group_id: projectOrDeploymentId,
      instance_group_type: instanceGroupType,
    };

    if (instanceGroupType !== 'serverless_project') {
      source.provider = this.cloud.csp;
      source.region = this.cloud.region;

      const clusterId = this.cloud.elasticsearchClusterId;
      if (clusterId) {
        source.metadata = { cluster_id: clusterId };
      }
    }

    const record: UsageRecord = {
      id: `agent-builder-execution-${executionId}`,
      usage_timestamp: new Date().toISOString(),
      creation_timestamp: new Date().toISOString(),
      usage: {
        type: AGENT_EXECUTION_USAGE_TYPE,
        quantity: usageQuantity,
        period_seconds: Math.ceil(timeToLastToken / 1000) || 1,
        metadata: usageMeta,
      },
      source,
    };

    this.logger.debug(() => {
      return `[reportExecution] Reporting usage: ${JSON.stringify(record, undefined, 2)}`;
    });

    await this.usageApi.usageReporting.reportUsage([record]);
  }
}
