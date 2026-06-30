/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { UsageRecord, UsageReportingService } from '@kbn/usage-api-plugin/server';
import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus, isTerminalStatus, pickManagedWorkflowFields } from '@kbn/workflows';

import { BUCKET_SIZE_MS, METERING_SOURCE_ID, WORKFLOWS_USAGE_TYPE } from './constants';

/**
 * Workflows Metering Service - Stage 1 of the billing pipeline.
 *
 * Builds UsageRecords from completed workflow executions and sends them
 * to the Usage API. Uses event-based metering: reports immediately after
 * each workflow reaches a terminal state (fire-and-forget with inline retry).
 *
 * Key design decisions:
 * - quantity=1 for each execution (simple count). Transform function decides billing.
 * - Rich metadata (duration, status, step_types, etc.) for flexible pricing logic.
 * - Deduplication via deterministic ID: `workflow-execution-{executionId}`.
 * - Supports both Serverless (projectId) and ECH (deploymentId).
 */
export class WorkflowsMeteringService {
  constructor(
    private readonly usageReportingService: UsageReportingService,
    private readonly logger: Logger
  ) {}

  /**
   * Reports a workflow execution to the Usage API.
   *
   * Callers should NOT await this -- it is designed to be fire-and-forget.
   * All errors are caught and logged internally. Returning a Promise enables
   * tests to await completion without needing fake timers.
   */
  public async reportWorkflowExecution(
    execution: EsWorkflowExecution,
    cloudSetup?: CloudSetup
  ): Promise<void> {
    const projectId = cloudSetup?.serverless?.projectId;
    const deploymentId = cloudSetup?.deploymentId;
    const instanceGroupId = projectId || deploymentId;
    const instanceGroupType = projectId ? 'serverless_project' : 'stateful_deployment';

    // Self-managed: no metering (no projectId or deploymentId available)
    if (!instanceGroupId) {
      return;
    }

    // Only report for terminal states; skip SKIPPED executions since they
    // were dropped by concurrency limits and never actually ran.
    if (!isTerminalStatus(execution.status as ExecutionStatus)) {
      return;
    }
    if (execution.status === ExecutionStatus.SKIPPED) {
      return;
    }

    const usageRecord = this.buildUsageRecord(
      execution,
      instanceGroupId,
      instanceGroupType,
      cloudSetup
    );

    try {
      await this.usageReportingService.reportUsage([usageRecord]);
    } catch (err) {
      // Log with billing-relevant details per monitoring requirements:
      // project ID, type, and count for impact assessment
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to report workflow metering for execution ${execution.id} ` +
          `(instanceGroupId=${instanceGroupId}, type=${WORKFLOWS_USAGE_TYPE}, quantity=1): ${errorMessage}`
      );
    }
  }

  /**
   * Builds a UsageRecord from a completed workflow execution.
   *
   * The record follows Usage Record Schema v2. Kibana (Stage 1) sends raw data;
   * the transform function (Stage 3) decides what's billable and how to price it.
   */
  private buildUsageRecord(
    execution: EsWorkflowExecution,
    instanceGroupId: string,
    instanceGroupType: NonNullable<UsageRecord['source']['instance_group_type']>,
    cloudSetup?: CloudSetup
  ): UsageRecord {
    const durationMs = execution.duration || 0;
    const durationMinutes = Math.ceil(durationMs / 60000);
    const normalizedQuantity = Math.max(1, Math.ceil(durationMs / BUCKET_SIZE_MS));
    const stepTypes = this.extractStepTypes(execution);
    const stepCount = Object.values(stepTypes).reduce((sum, count) => sum + count, 0);

    const managedWorkflowFields = pickManagedWorkflowFields(execution);

    const metadata: Record<string, string> = {
      duration_ms: String(durationMs),
      duration_minutes: String(durationMinutes),
      normalized_quantity: String(normalizedQuantity),
      status: execution.status,
      triggered_by: execution.triggeredBy || 'unknown',
      is_test_run: String(execution.isTestRun),
      is_managed: String(managedWorkflowFields.managed === true),
      is_billable: String(
        managedWorkflowFields.managed !== true || managedWorkflowFields.billable === true
      ),
      workflow_id: execution.workflowId,
      space_id: execution.spaceId,
      step_count: String(stepCount),
    };

    if (managedWorkflowFields.managedBy !== undefined) {
      metadata.managed_by = managedWorkflowFields.managedBy;
    }

    if (managedWorkflowFields.originManagedWorkflowId !== undefined) {
      metadata.origin_managed_workflow_id = managedWorkflowFields.originManagedWorkflowId;
    }

    if (Object.keys(stepTypes).length > 0) {
      metadata.step_types = JSON.stringify(stepTypes);
    }

    const source: UsageRecord['source'] = {
      id: METERING_SOURCE_ID,
      instance_group_id: instanceGroupId,
      instance_group_type: instanceGroupType,
    };

    if (instanceGroupType !== 'serverless_project') {
      source.provider = cloudSetup?.csp;
      source.region = cloudSetup?.region;

      const clusterId = cloudSetup?.elasticsearchClusterId;
      if (clusterId) {
        source.metadata = { cluster_id: clusterId };
      }
    }

    return {
      id: `workflow-execution-${execution.id}`,
      usage_timestamp: execution.finishedAt || new Date().toISOString(),
      creation_timestamp: new Date().toISOString(),
      usage: {
        type: WORKFLOWS_USAGE_TYPE,
        quantity: 1,
        period_seconds: Math.ceil(durationMs / 1000) || 1,
        metadata,
      },
      source,
    };
  }

  /**
   * Extracts a breakdown of step types from the workflow definition.
   * Returns a map of step type -> count (e.g., { connector: 5, transform: 3, ai: 2 }).
   */
  private extractStepTypes(execution: EsWorkflowExecution): Record<string, number> {
    const stepTypes: Record<string, number> = {};

    const steps = execution.workflowDefinition?.steps;
    if (!steps || !Array.isArray(steps)) {
      return stepTypes;
    }

    for (const step of steps) {
      const stepType = step?.type || 'unknown';
      stepTypes[stepType] = (stepTypes[stepType] || 0) + 1;
    }

    return stepTypes;
  }
}
