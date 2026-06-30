/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import pLimit from 'p-limit';
import { v4 as generateUuid } from 'uuid';
import type { CoreStart, KibanaRequest, Logger } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type {
  EsWorkflowExecution,
  WorkflowDetailDto,
  WorkflowExecutionEngineModel,
} from '@kbn/workflows';
import { toWorkflowExecutionEngineModel } from '@kbn/workflows';
import { validateWorkflowForExecution, type WorkflowRepository } from '@kbn/workflows/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import {
  type EventChainContext,
  getEmitterWorkflowExecutionIdFromRequest,
  getEventChainContext,
  getEventChainDepthFromHeaders,
} from './event_context/event_chain_context';
import { initializeTriggerEventsClient, writeTriggerEvent } from './event_logs';
import type { TriggerEventsDataStreamClient } from './event_logs/trigger_events_data_stream';
import { classifyWorkflowTriggerMatch } from './filter_workflows_by_trigger_condition';
import { resolveWorkflowEventsModeFromOn } from './lib/resolve_workflow_events_mode_from_on';
import {
  createEmptyTriggerResolutionStats,
  createEmptyTriggerScheduleStats,
  type TriggerEventScheduleStats,
} from './trigger_event_stats';
import type { EventTriggersConfig } from '../config';
import {
  extractEventChainDepthFromExecution,
  extractEventChainVisitedWorkflowIdsFromExecution,
  mergeEmitterWorkflowIntoEventChainVisited,
  normalizeEventChainVisitedWorkflowIds,
} from '../lib/telemetry/utils/extract_execution_metadata';
import { WorkflowExecutionTelemetryClient } from '../lib/telemetry/workflow_execution_telemetry_client';
import { WorkflowExecutionRepository } from '../repositories/workflow_execution_repository';
import type { ScheduleWorkflow } from '../types';

const SCHEDULE_CONCURRENCY = 20;

export interface EmitEventParams {
  triggerId: string;
  payload: Record<string, unknown>;
  request: KibanaRequest;
}

export type EmitEvent = (params: EmitEventParams) => Promise<void>;

export interface TriggerEventHandlerDeps {
  coreStart: CoreStart;
  workflowRepository: WorkflowRepository;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  spaces: SpacesServiceStart | undefined;
  scheduleWorkflow: ScheduleWorkflow;
  config: EventTriggersConfig;
  logger: Logger;
  triggerEventsClientPromise?: Promise<TriggerEventsDataStreamClient | undefined>;
}

interface ScheduleEventParams {
  payload: Record<string, unknown>;
  timestamp: string;
  spaceId: string;
  eventId: string;
  eventChainContext?: EventChainContext;
  triggerId: string;
}

/**
 * Next value for `context.event.eventChainDepth` on a scheduled run.
 */
function nextScheduledEventChainDepth(context: EventChainContext | undefined): number {
  const d = context?.depth;
  const parentDepth = d === undefined || d < 0 ? 0 : d;
  return parentDepth + 1;
}

function isKnownNonNegativeEventChainDepth(depth: number | undefined): depth is number {
  return depth !== undefined && depth >= 0;
}

function warnOnEmitterDepthHeaderPersistedMismatch(params: {
  logger: Logger;
  executionId: string;
  headerDepth: number | undefined;
  persistedDepth: number | undefined;
}): void {
  const { logger, executionId, headerDepth, persistedDepth } = params;
  if (
    !isKnownNonNegativeEventChainDepth(headerDepth) ||
    !isKnownNonNegativeEventChainDepth(persistedDepth) ||
    headerDepth === persistedDepth
  ) {
    return;
  }
  logger.warn(
    `[workflows:eventChain] event-chain depth header (${headerDepth}) does not match persisted depth (${persistedDepth}) for emitter execution ${executionId}; using persisted chain from the execution document.`
  );
}

function isWorkflowSourcedChainContext(context: EventChainContext | undefined): boolean {
  return context !== undefined;
}

function getMatchingTriggerOn(
  workflow: WorkflowDetailDto,
  triggerId: string
): Record<string, unknown> | null {
  const matchingTrigger = workflow.definition?.triggers?.find(
    (t) => t != null && typeof t === 'object' && 'type' in t && t.type === triggerId
  );
  if (
    matchingTrigger == null ||
    typeof matchingTrigger !== 'object' ||
    !('on' in matchingTrigger) ||
    matchingTrigger.on == null ||
    typeof matchingTrigger.on !== 'object' ||
    Array.isArray(matchingTrigger.on)
  ) {
    return null;
  }
  return matchingTrigger.on as Record<string, unknown>;
}

function buildNextVisitedWorkflowIds(
  context: EventChainContext | undefined,
  maxEventChainDepth: number
): string[] {
  return normalizeEventChainVisitedWorkflowIds(context?.visitedWorkflowIds, maxEventChainDepth);
}

function getWorkflowEventsMode(workflow: WorkflowDetailDto, triggerId: string) {
  return resolveWorkflowEventsModeFromOn(getMatchingTriggerOn(workflow, triggerId));
}

type ScheduleContextSkipReason = 'workflow_events_ignore' | 'depth' | 'cycle';

/**
 * Handles trigger events end-to-end: validates the trigger, resolves subscribed workflows,
 * evaluates KQL conditions, writes audit logs, schedules executions, and reports telemetry.
 */
export class TriggerEventHandler {
  private readonly workflowRepository: WorkflowRepository;
  private readonly workflowExecutionRepository: WorkflowExecutionRepository;
  private readonly workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  private readonly scheduleWorkflow: ScheduleWorkflow;
  private readonly telemetryClient: WorkflowExecutionTelemetryClient;
  private readonly spaces: SpacesServiceStart | undefined;
  private readonly config: EventTriggersConfig;
  private readonly logger: Logger;
  private readonly triggerEventsClientPromise: Promise<TriggerEventsDataStreamClient | undefined>;

  constructor(deps: TriggerEventHandlerDeps) {
    this.scheduleWorkflow = deps.scheduleWorkflow;
    this.workflowRepository = deps.workflowRepository;
    this.spaces = deps.spaces;
    this.workflowsExtensions = deps.workflowsExtensions;
    this.config = deps.config;
    this.logger = deps.logger;

    const coreStart = deps.coreStart;
    this.telemetryClient = new WorkflowExecutionTelemetryClient(coreStart.analytics, deps.logger);

    const esClient = coreStart.elasticsearch.client.asInternalUser;
    this.workflowExecutionRepository = new WorkflowExecutionRepository(esClient);
    this.triggerEventsClientPromise =
      deps.triggerEventsClientPromise ?? initializeTriggerEventsClient(coreStart.dataStreams);
  }

  async handleEvent(params: EmitEventParams): Promise<void> {
    if (!this.config.enabled && !this.config.logEvents) {
      this.logger.debug(
        'Event-driven triggers are off (execution and trigger-event logging both disabled); skipping.'
      );
      return;
    }
    const { triggerId, payload, request } = params;

    const spaceId = this.spaces?.getSpaceId(request) ?? DEFAULT_SPACE_ID;

    const timestamp = new Date().toISOString();
    const eventId = generateUuid();

    let eventChainContext = getEventChainContext(request);
    if (eventChainContext === undefined) {
      eventChainContext = await this.resolveEventChainContextFromEmitterExecution(
        request,
        spaceId,
        this.config.maxChainDepth
      );
    }

    const eventContextForResolution = {
      ...payload,
      timestamp,
      spaceId,
      eventChainDepth: nextScheduledEventChainDepth(eventChainContext),
    };

    this.validateTrigger(triggerId, spaceId, payload);

    const resolutionStartMs = Date.now();
    const { workflows, stats: resolutionStats } = await this.resolveMatchingWorkflowSubscriptions(
      triggerId,
      spaceId,
      eventContextForResolution
    );
    const subscriberResolutionMs = Math.max(0, Date.now() - resolutionStartMs);
    this.logger.trace(
      `Workflows trigger resolution funnel: triggerId=${triggerId} ${JSON.stringify(
        resolutionStats
      )}`
    );

    if (this.config.logEvents) {
      await this.writeTriggerEvents({
        timestamp,
        eventId,
        triggerId,
        spaceId,
        subscriptions: workflows.map((w) => w.id),
        payload,
        ...(eventChainContext?.sourceExecutionId && {
          sourceExecutionId: eventChainContext.sourceExecutionId,
        }),
      });
    }

    let scheduleStats: TriggerEventScheduleStats;
    if (this.config.enabled && workflows.length > 0) {
      const eventParams: ScheduleEventParams = {
        payload,
        timestamp,
        spaceId,
        eventId,
        eventChainContext,
        triggerId,
      };
      scheduleStats = await this.scheduleMatchingWorkflows(workflows, request, eventParams);
      this.logger.trace(
        `Workflows trigger schedule outcomes: triggerId=${triggerId} ${JSON.stringify(
          scheduleStats
        )}`
      );
    } else {
      scheduleStats = createEmptyTriggerScheduleStats();
    }

    this.telemetryClient.reportTriggerEventDispatched({
      triggerId,
      eventId,
      config: this.config,
      eventChainContext,
      subscriberResolutionMs,
      resolutionStats,
      scheduleStats,
    });
  }

  /**
   * Ensures the trigger is registered and, when defined, `eventSchema` matches the same event object
   * used for KQL resolution and scheduling (`timestamp`, `spaceId`, `eventChainDepth` included).
   */
  private validateTrigger(
    triggerId: string,
    spaceId: string,
    event: Record<string, unknown>
  ): void {
    const definition = this.workflowsExtensions.getTriggerDefinition(triggerId);
    if (!definition) {
      throw new Error(
        `Trigger "${triggerId}" is not registered. Register it during plugin setup via registerTriggerDefinition.`
      );
    }

    if (definition.eventSchema && typeof definition.eventSchema.safeParse === 'function') {
      const result = definition.eventSchema.safeParse(event);
      if (!result.success) {
        const message = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(
          `Event for trigger "${triggerId}" (space: ${spaceId}) did not match the trigger's eventSchema. ${message}`
        );
      }
    }
  }

  private eventChainContextFromExecution(
    doc: EsWorkflowExecution,
    maxEventChainDepth: number,
    persistedDepth: number | undefined
  ): EventChainContext {
    const baseVisited = extractEventChainVisitedWorkflowIdsFromExecution(doc, maxEventChainDepth);
    const visitedWorkflowIds = mergeEmitterWorkflowIntoEventChainVisited(
      baseVisited,
      doc.workflowId,
      maxEventChainDepth
    );
    return {
      depth: persistedDepth ?? -1,
      sourceExecutionId: doc.id,
      ...(visitedWorkflowIds.length > 0 ? { visitedWorkflowIds } : {}),
    };
  }

  private async resolveEventChainContextFromEmitterExecution(
    request: KibanaRequest,
    spaceId: string,
    maxEventChainDepth: number
  ): Promise<EventChainContext | undefined> {
    const executionId = getEmitterWorkflowExecutionIdFromRequest(request);
    if (executionId === undefined) {
      return undefined;
    }
    try {
      const doc = await this.workflowExecutionRepository.getWorkflowExecutionById(
        executionId,
        spaceId
      );
      if (!doc?.workflowId) {
        return undefined;
      }

      const persistedDepth = extractEventChainDepthFromExecution(doc);
      const headerDepth = request.isInternalApiRequest
        ? getEventChainDepthFromHeaders(request.headers)
        : undefined;

      warnOnEmitterDepthHeaderPersistedMismatch({
        logger: this.logger,
        executionId,
        headerDepth,
        persistedDepth,
      });

      const context = this.eventChainContextFromExecution(doc, maxEventChainDepth, persistedDepth);
      this.logger.debug(
        `[workflows:eventChain] restored chain from emitter execution: executionId=${executionId} context=${JSON.stringify(
          context
        )}`
      );
      return context;
    } catch (error) {
      this.logger.warn(
        `Failed to load emitter workflow execution ${executionId} for event-chain context: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }

  private async resolveMatchingWorkflowSubscriptions(
    triggerId: string,
    spaceId: string,
    eventContext: Record<string, unknown>
  ) {
    const allWorkflows = await this.workflowRepository.getWorkflowsSubscribedToTrigger(
      triggerId,
      spaceId
    );

    const stats = createEmptyTriggerResolutionStats();
    stats.subscribedCount = allWorkflows.length;
    const workflows: WorkflowDetailDto[] = [];

    for (const workflow of allWorkflows) {
      const outcome = classifyWorkflowTriggerMatch(workflow, triggerId, eventContext, this.logger);
      switch (outcome) {
        case 'disabled':
          stats.disabledCount += 1;
          break;
        case 'kql_false':
          stats.kqlFalseCount += 1;
          break;
        case 'kql_error':
          stats.kqlErrorCount += 1;
          break;
        case 'matched':
          stats.matchedCount += 1;
          workflows.push(workflow);
          break;
      }
    }

    return { workflows, stats };
  }

  private async writeTriggerEvents(params: {
    timestamp: string;
    eventId: string;
    triggerId: string;
    spaceId: string;
    subscriptions: string[];
    payload: Record<string, unknown>;
    sourceExecutionId?: string;
  }): Promise<void> {
    try {
      const triggerEventsClient = await this.triggerEventsClientPromise;
      if (!triggerEventsClient) {
        return;
      }
      await writeTriggerEvent(triggerEventsClient, params);
    } catch (error) {
      this.logger.warn(
        `Failed to write trigger event to data stream (trigger: ${params.triggerId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private getEventContextForScheduledWorkflow(
    workflow: WorkflowDetailDto,
    eventParams: ScheduleEventParams,
    maxEventChainDepth: number
  ):
    | { outcome: 'scheduled'; event: Record<string, unknown> }
    | { outcome: 'skipped'; reason: ScheduleContextSkipReason } {
    const { payload, timestamp, spaceId, eventChainContext, triggerId } = eventParams;
    const workflowEventsMode = getWorkflowEventsMode(workflow, triggerId);

    if (workflowEventsMode === 'ignore' && isWorkflowSourcedChainContext(eventChainContext)) {
      this.logger.warn(
        `WorkflowEvents ignore skipped scheduling workflow ${workflow.id} for trigger ${triggerId} in space ${spaceId}; on.workflowEvents is ignore and this event was emitted from a workflow execution.`
      );
      return { outcome: 'skipped', reason: 'workflow_events_ignore' };
    }

    const newDepth = nextScheduledEventChainDepth(eventChainContext);
    if (newDepth > maxEventChainDepth) {
      this.logger.warn(
        `Event chain depth (${newDepth}) exceeds max (${maxEventChainDepth}); skipping workflow ${workflow.id} (trigger: ${triggerId}, space: ${spaceId}) to prevent unbounded chains.`
      );
      return { outcome: 'skipped', reason: 'depth' };
    }

    const nextVisitedForPayload = buildNextVisitedWorkflowIds(
      eventChainContext,
      maxEventChainDepth
    );

    if (workflowEventsMode !== 'allow-all') {
      if (nextVisitedForPayload.includes(workflow.id)) {
        this.logger.warn(
          `Event chain cycle guard skipped scheduling workflow ${
            workflow.id
          } for trigger ${triggerId} in space ${spaceId}; workflow already in chain [${nextVisitedForPayload.join(
            ', '
          )}]. Set on.workflowEvents: allow-all on this trigger to allow repeats.`
        );
        return { outcome: 'skipped', reason: 'cycle' };
      }
    }

    return {
      outcome: 'scheduled',
      event: {
        ...payload,
        timestamp,
        spaceId,
        eventChainDepth: newDepth,
        eventChainVisitedWorkflowIds: nextVisitedForPayload,
      },
    };
  }

  private async scheduleMatchingWorkflows(
    workflows: WorkflowDetailDto[],
    request: KibanaRequest,
    eventParams: ScheduleEventParams
  ): Promise<TriggerEventScheduleStats> {
    if (workflows.length === 0) {
      return createEmptyTriggerScheduleStats();
    }
    const scheduleConcurrency = pLimit(SCHEDULE_CONCURRENCY);
    const schedulePromises = workflows.map((workflow) =>
      scheduleConcurrency(
        async (): Promise<
          | 'workflow_events_cycle_skipped'
          | 'depth_skipped'
          | 'workflow_events_ignore_skipped'
          | 'success'
          | 'failure'
        > => {
          const scheduleResult = this.getEventContextForScheduledWorkflow(
            workflow,
            eventParams,
            this.config.maxChainDepth
          );
          if (scheduleResult.outcome === 'skipped') {
            if (scheduleResult.reason === 'workflow_events_ignore') {
              return 'workflow_events_ignore_skipped';
            }
            if (scheduleResult.reason === 'cycle') {
              return 'workflow_events_cycle_skipped';
            }
            return 'depth_skipped';
          }
          try {
            validateWorkflowForExecution(workflow, workflow.id);
            const workflowToRun: WorkflowExecutionEngineModel =
              toWorkflowExecutionEngineModel(workflow);
            const context: Record<string, unknown> = {
              event: scheduleResult.event,
              spaceId: eventParams.spaceId,
              inputs: {},
              triggeredBy: eventParams.triggerId,
              metadata: {
                eventDispatchTimestamp: eventParams.timestamp,
                eventTriggerId: eventParams.triggerId,
                eventId: eventParams.eventId,
              },
            };
            await this.scheduleWorkflow(workflowToRun, context, request);
            return 'success';
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason);
            this.logger.warn(
              `Event-driven workflow scheduling failed for workflow ${workflow.id} (trigger: ${eventParams.triggerId}): ${message}`
            );
            return 'failure';
          }
        }
      )
    );
    const outcomes = await Promise.allSettled(schedulePromises);
    const stats = createEmptyTriggerScheduleStats();
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'rejected') {
        const workflow = workflows[index];
        const message =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        this.logger.warn(
          `Event-driven workflow scheduling failed for workflow ${workflow.id} (trigger: ${eventParams.triggerId}): ${message}`
        );
        stats.scheduledAttemptCount += 1;
        stats.scheduledFailureCount += 1;
      } else {
        if (outcome.value === 'depth_skipped') {
          stats.depthSkippedCount += 1;
        } else if (outcome.value === 'workflow_events_ignore_skipped') {
          stats.workflowEventsIgnoreSkippedCount += 1;
        } else if (outcome.value === 'workflow_events_cycle_skipped') {
          stats.workflowEventsCycleSkippedCount += 1;
        } else {
          stats.scheduledAttemptCount += 1;
          if (outcome.value === 'success') {
            stats.scheduledSuccessCount += 1;
          } else {
            stats.scheduledFailureCount += 1;
          }
        }
      }
    }
    return stats;
  }
}
