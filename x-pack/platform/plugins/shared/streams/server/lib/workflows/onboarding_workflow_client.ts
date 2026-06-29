/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { NonTerminalExecutionStatuses } from '@kbn/workflows';
import type { WorkflowExecutionListItemDto } from '@kbn/workflows';
import { STREAMS_KI_ONBOARDING_WORKFLOW_ID } from '@kbn/workflows/managed';
import type { ChatCompletionTokenCount } from '@kbn/inference-common';
import {
  SigEventsWorkflowStatus,
  type SigEventsWorkflowStatusResult,
  type StreamsKIsOnboardingResult,
  type StreamsKIsOnboardingStatusResult,
  type BaseFeature,
  type GeneratedSignificantEventQuery,
} from '@kbn/streams-schema';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { WorkflowExecutionService } from './workflow_execution_service';
import type { EbtTelemetryClient } from '../telemetry/ebt/client';

const EMPTY_TOKEN_COUNT: ChatCompletionTokenCount = { prompt: 0, completion: 0, total: 0 };

/**
 * Inputs for an onboarding run, grouped by the two pipeline steps. Required
 * fields drive the steps (features identification and queries generation);
 * optional fields override tuning knobs that default inside the YAML.
 *
 * These are flattened into {@link OnboardingWorkflowInputPayload} before being
 * handed to the workflow engine, whose manual trigger only accepts flat scalars.
 */
export interface StreamsKIsOnboardingInputs {
  streamName: string;
  features: {
    skip: boolean;
    start: number;
    end: number;
    connectorId?: string;
    maxIterations?: number;
    sampleSize?: number;
    ttlDays?: number;
    entityFilteredRatio?: number;
    diverseRatio?: number;
    maxExcludedInPrompt?: number;
    maxEntityFilters?: number;
    maxPreviouslyIdentified?: number;
    recencyThresholdHours?: number;
  };
  queries: {
    skip: boolean;
    connectorId?: string;
  };
}

/**
 * Flat scalar payload actually passed to the workflow engine's manual trigger,
 * matching the `inputs` keys declared in streams_ki/onboarding.yaml. Nested
 * {@link StreamsKIsOnboardingInputs} are flattened into this shape in `run()`.
 */
interface OnboardingWorkflowInputPayload {
  streamName: string;
  skipFeatures: boolean;
  skipQueries: boolean;
  featuresStart: number;
  featuresEnd: number;
  featuresConnectorId?: string;
  queriesConnectorId?: string;
  featuresMaxIterations?: number;
  featuresSampleSize?: number;
  featuresTtlDays?: number;
  featuresEntityFilteredRatio?: number;
  featuresDiverseRatio?: number;
  featuresMaxExcludedInPrompt?: number;
  featuresMaxEntityFilters?: number;
  featuresMaxPreviouslyIdentified?: number;
  featuresRecencyThresholdHours?: number;
}

/**
 * Raw, flat `context.output` emitted by a completed onboarding workflow
 * execution (see the `output_result` step in streams_ki/onboarding.yaml).
 * Mapped into the nested {@link StreamsKIsOnboardingOutput} shape on read.
 */
interface OnboardingWorkflowOutputContext {
  streamName: string;
  featuresSkipped: boolean;
  featuresConnectorUsed: string;
  discoveredFeatures: BaseFeature[];
  featuresTokensUsed: ChatCompletionTokenCount;
  queriesSkipped: boolean;
  queriesConnectorUsed: string;
  persistedQueries: GeneratedSignificantEventQuery[];
  queriesTokensUsed: ChatCompletionTokenCount;
  keepAliveRefreshed: number;
}

/**
 * Nested domain representation of a completed onboarding run, grouped by step.
 * Used to extract summary counts for the status response.
 */
export interface StreamsKIsOnboardingOutput extends StreamsKIsOnboardingResult {
  streamName: string;
}

/** Flattens nested onboarding inputs into the workflow engine's scalar payload. */
const toWorkflowInputPayload = (
  inputs: StreamsKIsOnboardingInputs
): OnboardingWorkflowInputPayload => {
  const { streamName, features, queries } = inputs;
  return {
    streamName,
    skipFeatures: features.skip,
    skipQueries: queries.skip,
    featuresStart: features.start,
    featuresEnd: features.end,
    ...(features.connectorId !== undefined && { featuresConnectorId: features.connectorId }),
    ...(queries.connectorId !== undefined && { queriesConnectorId: queries.connectorId }),
    ...(features.maxIterations !== undefined && { featuresMaxIterations: features.maxIterations }),
    ...(features.sampleSize !== undefined && { featuresSampleSize: features.sampleSize }),
    ...(features.ttlDays !== undefined && { featuresTtlDays: features.ttlDays }),
    ...(features.entityFilteredRatio !== undefined && {
      featuresEntityFilteredRatio: features.entityFilteredRatio,
    }),
    ...(features.diverseRatio !== undefined && { featuresDiverseRatio: features.diverseRatio }),
    ...(features.maxExcludedInPrompt !== undefined && {
      featuresMaxExcludedInPrompt: features.maxExcludedInPrompt,
    }),
    ...(features.maxEntityFilters !== undefined && {
      featuresMaxEntityFilters: features.maxEntityFilters,
    }),
    ...(features.maxPreviouslyIdentified !== undefined && {
      featuresMaxPreviouslyIdentified: features.maxPreviouslyIdentified,
    }),
    ...(features.recencyThresholdHours !== undefined && {
      featuresRecencyThresholdHours: features.recencyThresholdHours,
    }),
  };
};

/** Maps the raw flat workflow output into the nested onboarding output shape. */
const parseWorkflowOutput = (
  output: Partial<OnboardingWorkflowOutputContext>
): StreamsKIsOnboardingOutput => ({
  streamName: output.streamName ?? '',
  features: {
    skipped: output.featuresSkipped === true,
    discovered: Array.isArray(output.discoveredFeatures) ? output.discoveredFeatures : [],
    connectorUsed: output.featuresConnectorUsed ?? '',
    tokensUsed: output.featuresTokensUsed ?? EMPTY_TOKEN_COUNT,
  },
  queries: {
    skipped: output.queriesSkipped === true,
    persisted: Array.isArray(output.persistedQueries) ? output.persistedQueries : [],
    connectorUsed: output.queriesConnectorUsed ?? '',
    tokensUsed: output.queriesTokensUsed ?? EMPTY_TOKEN_COUNT,
  },
  keepAlive: {
    refreshed: output.keepAliveRefreshed ?? 0,
  },
});

const ONBOARDING_EXECUTIONS_SPACE_ID = DEFAULT_SPACE_ID;

const CONCURRENCY_KEY_PREFIX = 'streams-ki-onboarding-';

/**
 * Builds the concurrency group key used to correlate workflow executions with
 * a specific stream. Must stay in sync with the `settings.concurrency.key`
 * template in the onboarding YAML definition.
 */
export const buildConcurrencyKey = (streamName: string) => `${CONCURRENCY_KEY_PREFIX}${streamName}`;

/** Extracts the stream name from a concurrency key, or returns null if the prefix doesn't match. */
export const parseStreamNameFromConcurrencyKey = (key: string): string | null => {
  if (!key.startsWith(CONCURRENCY_KEY_PREFIX)) {
    return null;
  }
  return key.slice(CONCURRENCY_KEY_PREFIX.length);
};

export const MAX_STREAMS_PER_QUERY = 10000;
/**
 * Client that wraps the workflows management API to provide a stream-centric
 * interface for running, querying, and canceling KI onboarding workflows.
 *
 * Each stream's onboarding execution is keyed by a concurrency group derived
 * from the stream name, so at most one onboarding run is active per stream.
 */
export class StreamsKIsOnboardingClient {
  private readonly workflowExecutionService: WorkflowExecutionService<OnboardingWorkflowInputPayload>;
  private readonly telemetry: EbtTelemetryClient;

  constructor({
    managementApi,
    telemetry,
  }: {
    managementApi: WorkflowsServerPluginSetup['management'];
    telemetry: EbtTelemetryClient;
  }) {
    this.workflowExecutionService = new WorkflowExecutionService({
      managementApi,
      workflowId: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
      workflowSpaceId: GLOBAL_WORKFLOW_SPACE_ID,
    });
    this.telemetry = telemetry;
  }

  /**
   * Triggers a new onboarding workflow execution for a stream.
   * Fetches the managed workflow definition from the global space and
   * runs it in the default space with the provided inputs.
   *
   * @throws If the managed onboarding workflow definition is not found.
   */
  async run({
    inputs,
    request,
  }: {
    inputs: StreamsKIsOnboardingInputs;
    request: KibanaRequest;
  }): Promise<{ executionId: string }> {
    const executionId = await this.workflowExecutionService.execute({
      executionSpaceId: ONBOARDING_EXECUTIONS_SPACE_ID,
      inputs: toWorkflowInputPayload(inputs),
      request,
    });

    this.telemetry.trackOnboardingScheduled({
      stream_name: inputs.streamName,
      execution_id: executionId,
      workflow_id: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
      space_id: ONBOARDING_EXECUTIONS_SPACE_ID,
      skip_features: inputs.features.skip,
      skip_queries: inputs.queries.skip,
    });

    return { executionId };
  }

  /**
   * Returns the onboarding status for a stream by looking up its most recent
   * workflow execution via the concurrency group key.
   *
   * For completed executions a second fetch retrieves the full execution
   * context so output counts can be included in the result.
   */
  async getStatus({
    streamName,
  }: {
    streamName: string;
  }): Promise<StreamsKIsOnboardingStatusResult> {
    const result = await this.workflowExecutionService.getStatus({
      spaceId: ONBOARDING_EXECUTIONS_SPACE_ID,
      queryParams: { concurrencyGroupKey: buildConcurrencyKey(streamName) },
    });

    if (result.status !== SigEventsWorkflowStatus.Completed) {
      return result;
    }

    const fullExecution = await this.workflowExecutionService.getExecution({
      id: result.executionId,
      spaceId: ONBOARDING_EXECUTIONS_SPACE_ID,
      options: { includeOutput: true },
    });
    const ctx = (fullExecution?.context ?? {}) as {
      output?: Partial<OnboardingWorkflowOutputContext>;
    };
    const { features, queries, keepAlive } = parseWorkflowOutput(ctx.output ?? {});
    return { ...result, features, queries, keepAlive };
  }

  /**
   * Returns a lightweight status summary for many streams in one query.
   *
   * Collapses all onboarding executions via {@link getRecentExecutions} and
   * filters to the requested names in memory (the management API can't filter
   * by a set of concurrency keys). Streams with no execution map to
   * `NotStarted`. Unlike {@link getStatus}, the completed output is omitted so
   * no extra per-stream fetch is needed.
   */
  async getStatuses({
    streamNames,
  }: {
    streamNames: string[];
  }): Promise<Record<string, SigEventsWorkflowStatusResult>> {
    if (streamNames.length === 0) {
      return {};
    }

    const statuses: Record<string, SigEventsWorkflowStatusResult> = {};

    for (const streamName of streamNames) {
      statuses[streamName] = { status: SigEventsWorkflowStatus.NotStarted, executionId: null };
    }

    const requested = new Set(streamNames);
    const executions = await this.getRecentExecutions();

    for (const execution of executions) {
      if (execution.concurrencyGroupKey === undefined) {
        continue;
      }
      const streamName = parseStreamNameFromConcurrencyKey(execution.concurrencyGroupKey);
      if (streamName === null || !requested.has(streamName)) {
        continue;
      }
      statuses[streamName] = WorkflowExecutionService.toStatusResult({
        execution,
        workflowId: STREAMS_KI_ONBOARDING_WORKFLOW_ID,
      });
    }

    return statuses;
  }

  /**
   * Cancels the latest non-terminal onboarding execution for a stream.
   * No-ops if no active execution exists or the latest execution already reached
   * a terminal state.
   *
   * @returns The ID of the canceled execution, or `null` if nothing was running.
   */
  async cancel({
    streamName,
    request,
  }: {
    streamName: string;
    request: KibanaRequest;
  }): Promise<string | null> {
    return this.workflowExecutionService.cancelLatest({
      spaceId: ONBOARDING_EXECUTIONS_SPACE_ID,
      request,
      concurrencyGroupKey: buildConcurrencyKey(streamName),
    });
  }

  /**
   * Cancels every non-terminal onboarding execution across all streams.
   * Used during teardown of the continuous KI onboarding workflow.
   */
  async cancelAllRunning({ request }: { request: KibanaRequest }): Promise<void> {
    const { results } = await this.workflowExecutionService.getExecutions(
      { statuses: [...NonTerminalExecutionStatuses], size: MAX_STREAMS_PER_QUERY },
      ONBOARDING_EXECUTIONS_SPACE_ID
    );

    if (results.length === 0) {
      return;
    }

    await Promise.all(
      results.map((result) =>
        this.workflowExecutionService.cancelExecution({
          id: result.id,
          spaceId: ONBOARDING_EXECUTIONS_SPACE_ID,
          request,
        })
      )
    );
  }

  /**
   * Returns the latest onboarding execution per stream, collapsed by
   * concurrency group key. At most {@link MAX_STREAMS_PER_QUERY} streams
   * are returned (one execution each), sorted by createdAt date descending.
   *
   * We sort by createdAt (not finishedAt) so the most recently *started*
   * execution wins per stream: a currently running execution has no
   * finishedAt, and sorting by finishedAt would hide it behind an older
   * completed run, breaking the "already running" classification.
   */
  async getRecentExecutions(): Promise<WorkflowExecutionListItemDto[]> {
    const { results } = await this.workflowExecutionService.getExecutions(
      {
        size: MAX_STREAMS_PER_QUERY,
        sortField: 'createdAt',
        sortOrder: 'desc',
        collapse: 'concurrencyGroupKey',
      },
      ONBOARDING_EXECUTIONS_SPACE_ID
    );

    return results;
  }
}
