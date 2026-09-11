/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import {
  DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
  SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import { investigationStateSchema } from '@kbn/significant-events-schema';
import { installInvestigationAgent } from '../lib/install_investigation_agent';
import { installDeductiveInvestigationAgent } from '../lib/install_deductive_investigation_agent';
import type {
  AlertInvestigationContext,
  GetInvestigationResponse,
  InvestigationContext,
  InvestigationStatus,
  InvestigationSubject,
  InvestigationSubjectType,
  InvestigationTriggerType,
  ListInvestigationItem,
  ListInvestigationsRequest,
  ListInvestigationsResponse,
  SeverityCountsRequest,
  SeverityCountsResponse,
  UpdateInvestigationRequest,
  StartInvestigationRequest,
  StartInvestigationResponse,
} from '../../common';
import {
  alertInvestigationContextSchema,
  DEFAULT_INVESTIGATION_TRIGGER_TYPE,
  freeFormContextSchema,
  INVESTIGATION_SUBJECT_TYPES,
  INVESTIGATION_TRIGGER_TYPES,
} from '../../common';
import type {
  InvestigationAttributes,
  InvestigationPatch,
  InvestigationRecord,
  InvestigationRepository,
  ProjectedInvestigationRecord,
} from '../storage';
import { InvestigationAlreadyExistsError, InvestigationStaleWriteError } from '../storage';
import { buildInvestigationMessage } from './build_investigation_message';
import {
  InvestigationConflictError,
  InvestigationNotFoundError,
  InvalidInvestigationContextError,
  InvestigationSubjectMissingError,
  InvestigationUnavailableError,
} from './errors';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v || undefined : undefined;
}

function isTerminalStatus(status: InvestigationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/** Used when persist omitted `error`. */
const FALLBACK_INVESTIGATION_ERROR = 'Investigation failed';

const SUPERSEDED_STATUSES = [
  'pending',
  'running',
] as const satisfies ReadonlyArray<InvestigationStatus>;

const isSubjectType = (value: unknown): value is InvestigationSubjectType =>
  typeof value === 'string' && INVESTIGATION_SUBJECT_TYPES.some((type) => type === value);

const isTriggerType = (value: unknown): value is InvestigationTriggerType =>
  typeof value === 'string' && INVESTIGATION_TRIGGER_TYPES.some((type) => type === value);

const INVESTIGATION_WORKFLOW_IDS = new Set([
  SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID,
  DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
]);

/**
 * A manual investigation has no stored entity to write results back to, so it runs the lean
 * deductive workflow; every other subject runs the significant-events workflow, which attaches
 * its findings to the event or alert it was started from.
 */
const workflowIdForSubject = (subject: InvestigationSubject): string =>
  subject.type === 'manual'
    ? DEDUCTIVE_INVESTIGATION_WORKFLOW_ID
    : SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID;

/** Each workflow calls its own agent, so the pre-install has to follow the same split. */
const installAgentForSubject = (subject: InvestigationSubject) =>
  subject.type === 'manual' ? installDeductiveInvestigationAgent : installInvestigationAgent;

const isInvestigationWorkflowExecution = (execution: {
  workflowId?: string | null;
  originManagedWorkflowId?: string | null;
}): boolean =>
  INVESTIGATION_WORKFLOW_IDS.has(execution.workflowId ?? '') ||
  INVESTIGATION_WORKFLOW_IDS.has(execution.originManagedWorkflowId ?? '');

interface ExecutionInvestigationMetadata {
  subject?: InvestigationSubject;
  triggerType: InvestigationTriggerType;
  concurrencyKey?: string;
}
/**
 * Context fields each subject type's id may arrive under, in precedence order. A significant event
 * has two spellings because discovery's `workflow.executeAsync` sends `event_id` while `start()`
 * sends `significant_event_id`; both must resolve to the same subject. The `satisfies` clause is
 * what makes a newly added {@link InvestigationSubjectType} a compile error rather than a run that
 * silently recovers no subject.
 */
const SUBJECT_ID_FIELDS = {
  significant_event: ['event_id', 'significant_event_id'],
  alert: ['alert_id'],
  manual: ['manual_id'],
} as const satisfies Record<InvestigationSubjectType, readonly string[]>;

const toSubject = ({
  subjectType,
  subjectId,
  subjectSummary,
}: {
  subjectType: InvestigationSubjectType;
  subjectId: string;
  subjectSummary?: string;
}): InvestigationSubject => {
  if (subjectSummary) {
    return { type: subjectType, id: subjectId, summary: subjectSummary };
  }
  return { type: subjectType, id: subjectId };
};

/**
 * Stored attributes each {@link ListInvestigationItem} property needs from `find`. A new list
 * property is a compile error until it is mapped here; `investigation_id` is the SO id and needs
 * none. Flattened values are what `list()` passes as `fields`.
 */
const LIST_INVESTIGATION_ITEM_FIELDS = {
  investigation_id: [],
  status: ['status'],
  created_at: ['created_at'],
  started_at: ['started_at'],
  completed_at: ['completed_at'],
  severity: ['severity'],
  concurrency_key: ['concurrency_key'],
  executed_by: ['executed_by'],
  subject: ['subject_type', 'subject_id', 'subject_summary'],
  summary: ['summary'],
  impact: ['impact'],
} as const satisfies Record<
  keyof ListInvestigationItem,
  readonly (keyof InvestigationAttributes)[]
>;

const LIST_INVESTIGATION_ATTRIBUTE_FIELDS = Object.values(LIST_INVESTIGATION_ITEM_FIELDS).flat();

type ListInvestigationRecord = ProjectedInvestigationRecord<
  (typeof LIST_INVESTIGATION_ITEM_FIELDS)[keyof ListInvestigationItem][number]
>;

const toListInvestigationItem = (record: ListInvestigationRecord): ListInvestigationItem => ({
  investigation_id: record.id,
  status: record.status,
  created_at: record.created_at,
  started_at: record.started_at,
  completed_at: record.completed_at,
  severity: record.severity,
  concurrency_key: record.concurrency_key,
  executed_by: record.executed_by,
  subject: toSubject({
    subjectType: record.subject_type,
    subjectId: record.subject_id,
    subjectSummary: record.subject_summary,
  }),
  summary: record.summary,
  impact: record.impact,
});

const toInvestigationResponse = (record: InvestigationRecord): GetInvestigationResponse => {
  const recommendations = investigationStateSchema.shape.recommendations.safeParse(
    record.recommendations
  );
  const blindSpots = investigationStateSchema.shape.blind_spots.safeParse(record.blind_spots);

  return {
    ...toListInvestigationItem(record),
    trigger_type: record.trigger_type,
    error: record.error,
    summary: record.summary,
    conclusion: record.conclusion,
    hypotheses: record.hypotheses,
    recommendations: recommendations.success ? recommendations.data : undefined,
    blind_spots: blindSpots.success ? blindSpots.data : undefined,
    trigger_feedback: record.trigger_feedback,
    conversation_id: record.conversation_id,
    impact: record.impact,
  };
};

const parseExecutionInvestigationMetadata = (
  executionContext: Record<string, unknown> | undefined
): ExecutionInvestigationMetadata => {
  const inputs =
    isPlainObject(executionContext) && isPlainObject(executionContext.inputs)
      ? executionContext.inputs
      : undefined;
  const rawConcurrencyKey = inputs?.concurrency_key;
  const concurrencyKey = typeof rawConcurrencyKey === 'string' ? rawConcurrencyKey : undefined;

  return {
    subject: recoverSubjectFromInput(inputs),
    triggerType: recoverTriggerTypeFromInput(inputs) ?? DEFAULT_INVESTIGATION_TRIGGER_TYPE,
    concurrencyKey,
  };
};

const toSubjectFields = (
  subject: InvestigationSubject
): Pick<InvestigationAttributes, 'subject_type' | 'subject_id' | 'subject_summary'> => ({
  subject_type: subject.type,
  subject_id: subject.id,
  ...(subject.summary ? { subject_summary: subject.summary } : {}),
});

/**
 * The investigation subject an execution's inputs describe, summary included, or undefined when
 * they describe none. Shared by `ensureOrCreate()` and the write path so they cannot disagree
 * about what a run is investigating.
 */
function recoverSubjectFromInput(
  input: Record<string, unknown> | undefined
): InvestigationSubject | undefined {
  const ctx = input?.context;
  if (!isPlainObject(ctx)) return undefined;

  const source = ctx.source;
  if (!isSubjectType(source)) return undefined;

  for (const field of SUBJECT_ID_FIELDS[source]) {
    const subjectId = asString(ctx[field]);
    if (subjectId) {
      return toSubject({ subjectType: source, subjectId, subjectSummary: asString(ctx.summary) });
    }
  }

  return undefined;
}

function recoverTriggerTypeFromInput(
  input: Record<string, unknown> | undefined
): InvestigationTriggerType | undefined {
  const ctx = input?.context;
  if (!isPlainObject(ctx)) return undefined;
  return isTriggerType(ctx.trigger_type) ? ctx.trigger_type : undefined;
}

export interface NightshiftInvestigationsClientDeps {
  request: KibanaRequest;
  workflowsManagement?: WorkflowsServerPluginSetup;
  spaces?: SpacesPluginStart;
  logger: Logger;
  /**
   * Explicit override for contexts where the request cannot carry space info (e.g. workflow step
   * definitions using getFakeRequest). See https://github.com/elastic/kibana/issues/284786.
   */
  spaceIdOverride?: string;
  agentBuilder?: AgentBuilderPluginStart;
  investigationRepository: InvestigationRepository;
  isAvailable: () => Promise<boolean>;
}

export class NightshiftInvestigationsClient {
  private readonly request: KibanaRequest;
  private readonly workflowsManagement: WorkflowsServerPluginSetup | undefined;
  private readonly spaces: SpacesPluginStart | undefined;
  private readonly logger: Logger;
  private readonly spaceIdOverride?: string;
  private readonly agentBuilder?: AgentBuilderPluginStart;
  private readonly investigationRepository: InvestigationRepository;
  private readonly checkAvailability: () => Promise<boolean>;

  constructor(deps: NightshiftInvestigationsClientDeps) {
    this.request = deps.request;
    this.workflowsManagement = deps.workflowsManagement;
    this.spaces = deps.spaces;
    this.logger = deps.logger;
    this.spaceIdOverride = deps.spaceIdOverride;
    this.agentBuilder = deps.agentBuilder;
    this.investigationRepository = deps.investigationRepository;
    this.checkAvailability = deps.isAvailable;
  }

  public isAvailable = (): Promise<boolean> => this.checkAvailability();

  private getSpaceId(): string {
    return (
      this.spaceIdOverride ??
      this.spaces?.spacesService.getSpaceId(this.request) ??
      DEFAULT_SPACE_ID
    );
  }

  /**
   * Validates the context against the contract for its subject type and composes the brief the
   * agent will read. Done here and not only in the route schema, because the workflow step
   * definition and the plugin start contract both reach `start` without passing through route
   * validation. Each branch parses with its own schema, so the alert brief is composed from a
   * value the schema has already vouched for rather than from a re-checked `unknown`.
   */
  private prepareAgentInput(
    subject: InvestigationSubject,
    message: string | undefined,
    context: InvestigationContext | AlertInvestigationContext
  ): { message: string; context: Record<string, unknown> } {
    if (subject.type === 'alert') {
      const parsed = alertInvestigationContextSchema.safeParse(context);
      if (!parsed.success) {
        throw new InvalidInvestigationContextError(subject.type, parsed.error);
      }
      // An alert investigation always gets the brief composed from its alert data — that is what
      // the alert context exists for. Every other subject keeps the caller-supplied message.
      return { message: buildInvestigationMessage(parsed.data), context: parsed.data };
    }

    const parsed = freeFormContextSchema.safeParse(context);
    if (!parsed.success) {
      throw new InvalidInvestigationContextError(subject.type, parsed.error);
    }
    return {
      message: message ?? `Investigation requested for ${subject.type} ${subject.id}`,
      context: parsed.data,
    };
  }

  async start({
    subject,
    trigger_type,
    message,
    stream_names,
    concurrency_key,
    context = {},
  }: StartInvestigationRequest): Promise<StartInvestigationResponse> {
    if (!this.workflowsManagement) {
      throw new InvestigationUnavailableError('workflowsManagement is not available');
    }

    if (!this.agentBuilder) {
      throw new InvestigationUnavailableError('agentBuilder is not available');
    }
    if (!(await this.isAvailable())) {
      throw new InvestigationUnavailableError('Investigations are not available');
    }

    const prepared = this.prepareAgentInput(subject, message, context);

    const spaceId = this.getSpaceId();

    // The `nightshift.ensureInvestigationAgent` workflow step is the general guarantee that the
    // agent exists wherever an investigation runs. This narrower install stays because the run
    // below executes the *stored* workflow definition, which predates that step until the managed
    // install has upgraded it — and that install is fire-and-forget. Deliberately without the
    // step's visibility retry: the workflow owns that, and this request path should not pay for it.
    await installAgentForSubject(subject)({ agentBuilder: this.agentBuilder, spaceId });

    const workflowId = workflowIdForSubject(subject);
    const workflow = await this.workflowsManagement.management.getWorkflow(workflowId, spaceId);

    if (!workflow?.definition) {
      this.logger.error(
        `Investigation workflow "${workflowId}" is not installed in space "${spaceId}"`
      );
      throw new InvestigationUnavailableError('Investigations are not configured in this space');
    }

    const inputs = {
      message: prepared.message,
      stream_names: stream_names ?? [],
      ...(concurrency_key ? { concurrency_key } : {}),
      context: {
        ...prepared.context,
        source: subject.type,
        [`${subject.type}_id`]: subject.id,
        trigger_type: trigger_type ?? DEFAULT_INVESTIGATION_TRIGGER_TYPE,
        ...(subject.summary ? { summary: subject.summary } : {}),
      },
    };

    const executionId = await this.workflowsManagement.management.runWorkflow(
      { ...workflow, definition: workflow.definition },
      spaceId,
      inputs,
      this.request,
      'nightshift-investigations'
    );

    this.logger.info(
      `Started investigation for ${subject.type}/${subject.id}, execution_id=${executionId}`
    );

    await this.create({
      investigationId: executionId,
      subject,
      triggerType: trigger_type ?? DEFAULT_INVESTIGATION_TRIGGER_TYPE,
      concurrencyKey: concurrency_key,
    }).catch((error) => {
      this.logger.warn(
        `Failed to eagerly persist investigation "${executionId}", deferring to the workflow's ensure step: ${error.message}`
      );
    });

    return { investigation_id: executionId };
  }

  /**
   * Creates a new investigation record as `pending`. Called from start() so the id is readable
   * immediately. The workflow's persist_investigation_started step later transitions the record
   * to `running` via ensureOrCreate().
   */
  async create({
    investigationId,
    subject,
    triggerType,
    concurrencyKey,
  }: {
    investigationId: string;
    subject: InvestigationSubject;
    triggerType: InvestigationTriggerType;
    concurrencyKey?: string;
  }): Promise<void> {
    if (concurrencyKey) {
      await this.cancelSupersededInvestigation({ concurrencyKey, investigationId });
    }

    await this.createIgnoringConflict({
      id: investigationId,
      attributes: {
        status: 'pending',
        ...toSubjectFields(subject),
        trigger_type: triggerType,
        concurrency_key: concurrencyKey,
        created_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Ensures the investigation record exists and is running. Called by the workflow's
   * persist_investigation_started step. If a pending record exists (created by start()), transitions
   * it to running. If no record exists (workflow triggered without start()), creates one as running
   * from the execution document. Already-running records are left untouched. A settled record
   * (completed, failed, or cancelled) throws so the persist step fails the run rather than
   * continuing through the agent.
   *
   * Both write paths read the execution document, so `started_at` and `executed_by` mean the same
   * thing however the record came to exist: `start()` cannot know the id the engine assigns to the
   * run's executor, and stamping the transition with the wall clock would date the record to when
   * the persist step happened to run rather than to when the run began.
   */
  async ensureOrCreate(investigationId: string): Promise<void> {
    const existing = await this.investigationRepository.get(investigationId);
    if (existing && isTerminalStatus(existing.status)) {
      throw InvestigationConflictError.settled(investigationId, existing.status);
    }
    if (existing && existing.status !== 'pending') {
      return;
    }

    if (!this.workflowsManagement) {
      throw new InvestigationUnavailableError('workflowsManagement is not available');
    }

    const spaceId = this.getSpaceId();
    const execution = await this.workflowsManagement.management.getWorkflowExecution(
      investigationId,
      spaceId,
      { includeOutput: false }
    );

    if (!execution || !isInvestigationWorkflowExecution(execution)) {
      throw new InvestigationNotFoundError(investigationId);
    }

    const startedAt = execution.startedAt ?? new Date().toISOString();

    if (existing) {
      await this.transitionPendingToRunning({
        investigationId,
        version: existing.version,
        startedAt,
        executedBy: execution.executedBy,
      });
      return;
    }

    const { subject, triggerType, concurrencyKey } = parseExecutionInvestigationMetadata(
      execution.context
    );

    if (!subject) {
      throw new InvestigationSubjectMissingError(investigationId);
    }

    if (concurrencyKey) {
      await this.cancelSupersededInvestigation({ concurrencyKey, investigationId });
    }

    await this.createIgnoringConflict({
      id: investigationId,
      attributes: {
        status: 'running',
        ...toSubjectFields(subject),
        trigger_type: triggerType,
        concurrency_key: concurrencyKey,
        executed_by: execution.executedBy,
        created_at: startedAt,
        started_at: startedAt,
      },
    });
  }

  private async transitionPendingToRunning({
    investigationId,
    version,
    startedAt,
    executedBy,
  }: {
    investigationId: string;
    version?: string;
    startedAt: string;
    executedBy?: string;
  }): Promise<void> {
    try {
      await this.investigationRepository.update({
        id: investigationId,
        patch: { status: 'running', started_at: startedAt, executed_by: executedBy },
        version,
      });
    } catch (error) {
      if (error instanceof InvestigationStaleWriteError) {
        return;
      }
      throw error;
    }
  }

  private async createIgnoringConflict({
    id,
    attributes,
  }: {
    id: string;
    attributes: InvestigationAttributes;
  }): Promise<void> {
    try {
      await this.investigationRepository.create({ id, attributes });
    } catch (error) {
      if (error instanceof InvestigationAlreadyExistsError) {
        return;
      }
      throw error;
    }
  }

  /**
   * Cancels the in-flight investigation that `investigationId` supersedes, if there is one.
   *
   * `investigationId` is excluded rather than assumed absent: both callers run while the workflow's
   * `_ensure` step may be creating the very same record, so without the guard the newest match can
   * be the incoming investigation itself — cancelling a record whose execution is alive and which
   * nothing superseded. Two results are fetched because the excluded record can occupy the first.
   */
  private async cancelSupersededInvestigation({
    concurrencyKey,
    investigationId,
  }: {
    concurrencyKey: string;
    investigationId: string;
  }): Promise<void> {
    const { results } = await this.investigationRepository.find({
      concurrencyKey,
      statuses: [...SUPERSEDED_STATUSES],
      sortField: 'created_at',
      sortOrder: 'desc',
      perPage: 2,
    });
    const superseded = results.find(({ id }) => id !== investigationId);

    if (!superseded) {
      return;
    }

    try {
      await this.investigationRepository.update({
        id: superseded.id,
        patch: {
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        },
        version: superseded.version,
      });
    } catch (error) {
      if (error instanceof InvestigationStaleWriteError) {
        this.logger.warn(
          `Skipped cancelling superseded investigation "${superseded.id}": it was concurrently modified`
        );
        return;
      }
      throw error;
    }
  }

  async update(investigationId: string, state: UpdateInvestigationRequest): Promise<void> {
    const existing = await this.investigationRepository.get(investigationId);
    if (!existing) {
      throw new InvestigationNotFoundError(investigationId);
    }

    const { status, error, ...output } = state;

    if (isTerminalStatus(existing.status)) {
      if (status === existing.status) {
        return;
      }
      throw InvestigationConflictError.settled(investigationId, existing.status);
    }

    if (status === 'failed' && error) {
      this.logger.warn(`Investigation "${investigationId}" failed: ${error}`);
    }

    const patch: InvestigationPatch = {
      status,
      ...(isTerminalStatus(status) && { completed_at: new Date().toISOString() }),
      ...(status === 'failed' && { error: error ?? FALLBACK_INVESTIGATION_ERROR }),
      ...output,
    };

    try {
      await this.investigationRepository.update({
        id: investigationId,
        patch,
        version: existing.version,
      });
    } catch (err) {
      if (err instanceof InvestigationStaleWriteError) {
        throw InvestigationConflictError.concurrentlyModified(investigationId);
      }
      throw err;
    }
  }

  /**
   * Returns the stored investigation. `running` is not checked against the workflow engine, so it
   * can linger after edge cases where no persist step ran: user cancel, cancel-in-progress that
   * ensureOrCreate() did not see, timeout, or a worker dying mid-run. Complete/fail still go
   * through PATCH; a superseded run is cancelled in ensureOrCreate().
   */
  async get(investigationId: string): Promise<GetInvestigationResponse> {
    const record = await this.investigationRepository.get(investigationId);

    if (!record) {
      throw new InvestigationNotFoundError(investigationId);
    }

    return toInvestigationResponse(record);
  }

  async list({
    statuses,
    severities,
    subject_types,
    query,
    concurrency_key,
    created_after,
    created_before,
    started_after,
    started_before,
    completed_after,
    completed_before,
    sort_field,
    sort_order,
    page = 1,
    size = 20,
  }: ListInvestigationsRequest = {}): Promise<ListInvestigationsResponse> {
    const result = await this.investigationRepository.find({
      statuses,
      severities,
      subjectTypes: subject_types,
      query,
      concurrencyKey: concurrency_key,
      createdAfter: created_after,
      createdBefore: created_before,
      startedAfter: started_after,
      startedBefore: started_before,
      completedAfter: completed_after,
      completedBefore: completed_before,
      sortField: sort_field,
      sortOrder: sort_order,
      page,
      perPage: size,
      fields: [...LIST_INVESTIGATION_ATTRIBUTE_FIELDS],
    });

    // Stored `running` is not reconciled with the engine — same edge cases as get().
    return {
      results: result.results.map((record) => toListInvestigationItem(record)),
      page: result.page,
      size: result.size,
      total: result.total,
    };
  }

  /**
   * Severity facet counts under the given filters, for the homepage tiles.
   *
   * Separate from `list()` because the counts are independent of pagination and sort — bundling
   * them would recompute an identical aggregation on every page change.
   */
  async getSeverityCounts({
    statuses,
    subject_types,
    query,
    concurrency_key,
    created_after,
    created_before,
    started_after,
    started_before,
    completed_after,
    completed_before,
  }: SeverityCountsRequest = {}): Promise<SeverityCountsResponse> {
    const severityCounts = await this.investigationRepository.countBySeverity({
      statuses,
      subjectTypes: subject_types,
      query,
      concurrencyKey: concurrency_key,
      createdAfter: created_after,
      createdBefore: created_before,
      startedAfter: started_after,
      startedBefore: started_before,
      completedAfter: completed_after,
      completedBefore: completed_before,
    });

    return { severity_counts: severityCounts };
  }
}
