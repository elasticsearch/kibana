/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  HUMAN_READABLE_ID_MAX_LENGTH,
  HUMAN_READABLE_ID_MIN_LENGTH,
  HUMAN_READABLE_ID_PATTERN,
} from '@kbn/human-readable-id';
import type { DotKeysOf, DotObject, JsonValue, RecursivePartial } from '@kbn/utility-types';
import { z } from '@kbn/zod/v4';
import type { StepDeprecationInfo } from '../spec/deprecated_step_metadata';
import type { SerializedError, WorkflowTokenUsageSchema, WorkflowYaml } from '../spec/schema';
import { WorkflowSchema } from '../spec/schema';

export type { WorkflowYaml } from '../spec/schema';

export enum ExecutionStatus {
  // In progress
  PENDING = 'pending',
  WAITING = 'waiting',
  WAITING_FOR_INPUT = 'waiting_for_input',
  WAITING_FOR_CHILD = 'waiting_for_child',
  RUNNING = 'running',

  // Done
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
  SKIPPED = 'skipped',
}
export type ExecutionStatusUnion = `${ExecutionStatus}`;
export const ExecutionStatusValues = Object.values(ExecutionStatus);

export const TerminalExecutionStatuses: readonly ExecutionStatus[] = [
  ExecutionStatus.COMPLETED,
  ExecutionStatus.FAILED,
  ExecutionStatus.CANCELLED,
  ExecutionStatus.SKIPPED,
  ExecutionStatus.TIMED_OUT,
] as const;

export const NonTerminalExecutionStatuses: readonly ExecutionStatus[] = [
  ExecutionStatus.PENDING,
  ExecutionStatus.WAITING,
  ExecutionStatus.WAITING_FOR_INPUT,
  ExecutionStatus.WAITING_FOR_CHILD,
  ExecutionStatus.RUNNING,
] as const;

export enum ExecutionType {
  TEST = 'test',
  PRODUCTION = 'production',
}
export type ExecutionTypeUnion = `${ExecutionType}`;
export const ExecutionTypeValues = Object.values(ExecutionType);

export const WorkflowExecutionSortFields = ['createdAt', 'finishedAt'] as const;
export type WorkflowExecutionSortField = (typeof WorkflowExecutionSortFields)[number];
export type WorkflowExecutionSortOrder = 'asc' | 'desc';
export const WorkflowExecutionCollapseFields = [
  'concurrencyGroupKey',
  'status',
  'executedBy',
  'triggeredBy',
] as const;
export type WorkflowExecutionCollapseField = (typeof WorkflowExecutionCollapseFields)[number];

/**
 * An interface representing the state of a step scope during workflow execution.
 */

export interface ScopeEntry {
  /**
   * Node that entered this scope.
   * Examples: enterForeach_step1, enterRetry_step1, etc
   */
  nodeId: string;
  nodeType: string;
  /**
   * Optional unique identifier for the scope instance.
   * For example, iteration identifier (0,1,2,3,etc), retry attempt identifier (attempt-1, attempt-2, etc), and so on
   */
  scopeId?: string;
}
export interface StackFrame {
  /** Step that created this frame */
  stepId: string;
  /** Scope entries within this frame */
  nestedScopes: ScopeEntry[];
}

export interface QueueMetrics {
  scheduledAt?: string;
  runAt?: string;
  startedAt: string;
  queueDelayMs: number | null;
  scheduleDelayMs: number | null;
}

/**
 * Normalized LLM token usage. Token-consuming steps (today `ai.agent`, and any
 * future `ai.*` / connector step) emit this shape under `output.metadata.usage`;
 * the execution engine extracts it, persists it as a top-level `usage` field on
 * the step execution, and accumulates the per-execution total. Keeping the
 * persisted field at the top level (rather than nested under `output`) means
 * UI and queries read a stable, output-independent shape that survives the
 * `includeOutput: false` fetch path.
 */
export type WorkflowTokenUsage = z.infer<typeof WorkflowTokenUsageSchema>;

export interface EsWorkflowExecution {
  spaceId: string;
  id: string;
  workflowId: string;
  managed?: boolean;
  managedBy?: string | null;
  originManagedWorkflowId?: string | null;
  managedVersion?: number | null;
  isTestRun: boolean;
  status: ExecutionStatus;
  context: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  workflowDefinition: WorkflowYaml;
  yaml: string;
  currentNodeId?: string; // The node currently being executed
  /** If specified, the only this step and its children will be executed */
  stepId?: string;
  scopeStack: StackFrame[];
  createdAt: string;
  error: SerializedError | null;
  createdBy?: string; // Keep for backwards compatibility with existing documents
  executedBy?: string; // User who executed the workflow
  startedAt: string;
  finishedAt: string;
  cancelRequested: boolean;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  duration: number;
  triggeredBy?: string; // 'manual' or 'scheduled'
  taskRunAt?: string | null; // Task's runAt timestamp to link execution to specific scheduled run
  traceId?: string; // APM trace ID for observability
  entryTransactionId?: string; // APM root transaction ID for trace embeddable
  concurrencyGroupKey?: string; // Evaluated concurrency group key for grouping executions
  queueMetrics?: QueueMetrics; // Queue delay metrics for observability
  /** IDs of all step executions, enables O(1) mget lookup instead of search */
  stepExecutionIds?: string[];
  /** Caller-supplied execution metadata, separate from workflow inputs */
  metadata?: Record<string, unknown>;
  /**
   * Event-chain hop depth when scheduled by the event-driven trigger handler.
   * Root copy survives partial `context` updates (same pattern as telemetry extraction).
   */
  eventChainDepth?: number;
  /**
   * Workflow ids that already ran earlier in this event chain (for cycle detection).
   * Root copy survives partial `context` updates.
   */
  eventChainVisitedWorkflowIds?: string[];
  /** Trigger dispatch id from event-driven scheduling (`context.metadata.eventId`), when set */
  dispatchEventId?: string;
  /**
   * Aggregated LLM token usage across all token-consuming steps in this
   * execution, accumulated incrementally as each step finishes. Absent when no
   * step reported usage. See {@link WorkflowTokenUsage}.
   */
  usage?: WorkflowTokenUsage;
}

export interface ProviderInput {
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface Provider {
  type: string;
  action: (stepInputs?: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
  inputsDefinition: Record<string, ProviderInput>;
}

export interface EsWorkflowStepExecution {
  spaceId: string;
  id: string;
  stepId: string;
  stepType?: string;

  /** Current step's stack frames. */
  scopeStack: StackFrame[];
  workflowRunId: string;
  workflowId: string;
  status: ExecutionStatus;
  /** Whether this step execution belongs to a test run of the workflow. */
  isTestRun?: boolean;
  startedAt: string;
  finishedAt?: string;
  executionTimeMs?: number;

  /** Topological index of step in workflow graph. */
  topologicalIndex: number;

  /** Overall execution index in the entire workflow. */
  globalExecutionIndex: number;

  /**
   * Execution index within specific stepId.
   * There might be several instances of the same stepId if it's inside loops, retries, etc.
   */
  stepExecutionIndex: number;
  error?: SerializedError;
  output?: JsonValue;
  input?: JsonValue;

  /** Specific step execution instance state. Used by loops, retries, etc to track execution context. */
  state?: Record<string, unknown>;

  /**
   * Optional Human-In-The-Loop audit envelope, populated only by
   * HITL-aware steps (today: `wait_for_input`). Both the wrapper and
   * every property inside it are optional and MUST be treated as such
   * by readers — the engine itself remains field-agnostic.
   */
  hitl?: {
    /** Server-resolved username (or API-key principal) that submitted the response. */
    respondedBy?: string;
    /** ISO-8601 timestamp the response was recorded server-side. */
    respondedAt?: string;
    /** Free-form channel slug identifying the surface that submitted the response. */
    channel?: string;
  };

  /** Per-step normalized LLM token usage. See {@link WorkflowTokenUsage}. */
  usage?: WorkflowTokenUsage;
}

export type WorkflowStepExecutionDto = Omit<EsWorkflowStepExecution, 'spaceId'>;

export interface WorkflowExecutionHistoryModel {
  id: string;
  workflowId?: string;
  workflowName?: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt: string;
  duration: number | null;
}

export interface WorkflowExecutionLogModel {
  spaceId: string;
  timestamp: string;
  message: string;
  level: string;
}

export interface WorkflowExecutionDto {
  spaceId: string;
  id: string;
  status: ExecutionStatus;
  isTestRun: boolean;
  startedAt: string;
  error: SerializedError | null;
  finishedAt: string;
  workflowId?: string;
  workflowName?: string;
  workflowDefinition: WorkflowYaml;
  /** If specified, only this step and its children were executed */
  stepId?: string | undefined;
  stepExecutions: WorkflowStepExecutionDto[];
  duration: number | null;
  executedBy?: string; // User who executed the workflow
  triggeredBy?: string; // 'manual' or 'scheduled'
  yaml: string;
  context?: Record<string, unknown>;
  traceId?: string; // APM trace ID for observability
  entryTransactionId?: string; // APM root transaction ID for trace embeddable
  concurrencyGroupKey?: string; // Evaluated concurrency group key for grouping executions
  /** Aggregated LLM token usage across all `ai.*` steps in this execution. */
  usage?: WorkflowTokenUsage;
}

export type WorkflowExecutionListItemDto = Omit<
  WorkflowExecutionDto,
  'stepExecutions' | 'yaml' | 'workflowDefinition'
>;

export interface WorkflowExecutionListDto {
  results: WorkflowExecutionListItemDto[];
  page: number;
  size: number;
  total: number;
}

export interface WorkflowStepExecutionListDto {
  results: EsWorkflowStepExecution[];
  total: number;
  page?: number;
  size?: number;
}

// TODO: convert to actual elastic document spec

export const EsWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  managed: z.boolean().optional(),
  managedBy: z.string().nullable().optional(),
  originManagedWorkflowId: z.string().nullable().optional(),
  managedVersion: z.number().nullable().optional(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  createdBy: z.string(),
  lastUpdatedAt: z.date(),
  lastUpdatedBy: z.string(),
  definition: WorkflowSchema.optional(),
  deleted_at: z.date().nullable().default(null),
  yaml: z.string(),
  valid: z.boolean().readonly(),
});

export type EsWorkflow = z.infer<typeof EsWorkflowSchema>;

export type EsWorkflowCreate = Omit<
  EsWorkflow,
  'id' | 'createdAt' | 'createdBy' | 'lastUpdatedAt' | 'lastUpdatedBy' | 'yaml' | 'deleted_at'
>;

export const MAX_WORKFLOW_YAML_LENGTH = 1_048_576;
const MAX_BULK_CREATE_WORKFLOWS = 500;

export const CreateWorkflowCommandSchema = z.object({
  yaml: z.string().max(MAX_WORKFLOW_YAML_LENGTH),
  id: z
    .string()
    .min(HUMAN_READABLE_ID_MIN_LENGTH)
    .max(HUMAN_READABLE_ID_MAX_LENGTH)
    .regex(HUMAN_READABLE_ID_PATTERN)
    .optional(),
});
export type CreateWorkflowCommand = z.infer<typeof CreateWorkflowCommandSchema>;

export const BulkCreateWorkflowsCommandSchema = z.object({
  workflows: z.array(CreateWorkflowCommandSchema).max(MAX_BULK_CREATE_WORKFLOWS),
});

export type BulkCreateWorkflowsCommand = z.infer<typeof BulkCreateWorkflowsCommandSchema>;

export const UpdateWorkflowCommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  yaml: z.string(),
});

export const SearchWorkflowCommandSchema = z.object({
  triggerType: z.string().optional(),
  size: z.number().default(100),
  page: z.number().default(1),
  createdBy: z.array(z.string()).optional(),
  // bool or number transformed to boolean
  enabled: z.array(z.union([z.boolean(), z.number().transform((val) => val === 1)])).optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  _full: z.boolean().default(false),
});

export const RunWorkflowCommandSchema = z.object({
  inputs: z.record(z.string(), z.unknown()),
});
export type RunWorkflowCommand = z.infer<typeof RunWorkflowCommandSchema>;

export const RunStepCommandSchema = z.object({
  workflowYaml: z.string(),
  workflowId: z.string().optional(), // Optional to allow for test step runs for unsaved workflows
  stepId: z.string(),
  executionContext: z.record(z.string(), z.unknown()).optional(),
  contextOverride: z.record(z.string(), z.unknown()).optional(),
});
export type RunStepCommand = z.infer<typeof RunStepCommandSchema>;

export const TestWorkflowCommandSchema = z.object({
  workflowYaml: z.string(),
  inputs: z.record(z.string(), z.unknown()),
});
export type TestWorkflowCommand = z.infer<typeof TestWorkflowCommandSchema>;

export const RunWorkflowResponseSchema = z.object({
  workflowExecutionId: z.string(),
});
export type RunWorkflowResponseDto = z.infer<typeof RunWorkflowResponseSchema>;

export const TestWorkflowResponseSchema = z.object({
  workflowExecutionId: z.string(),
});
export type TestWorkflowResponseDto = z.infer<typeof TestWorkflowResponseSchema>;

/** Result of scheduling a resume for a workflow execution that was waiting for human input. */
export const ResumeWorkflowExecutionResponseSchema = z.object({
  resumedBy: z.string(),
});
export type ResumeWorkflowExecutionResponseDto = z.infer<
  typeof ResumeWorkflowExecutionResponseSchema
>;

export interface UpdatedWorkflowResponseDto {
  id: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string | undefined;
  enabled: boolean;
  valid: boolean;
  validationErrors: string[];
}

export interface WorkflowDetailDto {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  managed?: boolean;
  managedBy?: string | null;
  definitionHash?: string | null;
  originManagedWorkflowId?: string | null;
  managedVersion?: number | null;
  lifecycle?: 'static' | 'dynamic' | null;
  createdAt: string;
  createdBy: string;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  definition: WorkflowYaml | null;
  yaml: string;
  valid: boolean;
}

export interface WorkflowPartialDetailDto extends Partial<WorkflowDetailDto> {
  id: string;
}
export type WorkflowMgetResponseDto = WorkflowPartialDetailDto[];

export interface WorkflowListItemDto {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  managed?: boolean;
  managedBy?: string | null;
  definition: WorkflowYaml | null;
  createdAt: string;
  history?: WorkflowExecutionHistoryModel[];
  tags?: string[];
  valid: boolean;
}

export interface WorkflowListDto {
  page: number;
  size: number;
  total: number;
  results: WorkflowListItemDto[];
}
export interface WorkflowExecutionEngineModel
  extends Pick<
    EsWorkflow,
    | 'id'
    | 'name'
    | 'enabled'
    | 'definition'
    | 'yaml'
    | 'managed'
    | 'managedBy'
    | 'originManagedWorkflowId'
    | 'managedVersion'
  > {
  isTestRun?: boolean;
  isEphemeral?: boolean;
  spaceId?: string;
}

export interface WorkflowListItemAction {
  isPrimary?: boolean;
  type: string;
  color: string;
  name: string;
  icon: string;
  description: string;
  onClick: (item: WorkflowListItemDto) => void;
}

export interface WorkflowExecutionsHistoryStats {
  date: string;
  timestamp: string;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface WorkflowStatsDto {
  workflows: {
    enabled: number;
    disabled: number;
  };
  executions?: WorkflowExecutionsHistoryStats[];
}

export interface WorkflowAggsDto {
  [key: string]: {
    key: string;
    label: string;
  }[];
}

export interface ConnectorSubAction {
  name: string;
  displayName: string;
}

export interface ConnectorInstance {
  id: string;
  name: string;
  isPreconfigured: boolean;
  isDeprecated: boolean;
  config?: ConnectorInstanceConfig;
}

export interface ConnectorInstanceConfig {
  taskType?: string;
}

export interface ConnectorTypeInfo {
  actionTypeId: string;
  displayName: string;
  instances: ConnectorInstance[];
  enabled: boolean;
  enabledInConfig: boolean;
  enabledInLicense: boolean;
  minimumLicenseRequired: string;
  subActions: ConnectorSubAction[];
}

export type CompletionFn = () => Promise<
  Array<{ label: string; value: string; detail?: string; documentation?: string }>
>;

export type StepStabilityLevel = 'stable' | 'beta' | 'tech_preview';

export interface BaseConnectorContract {
  type: string;
  paramsSchema: z.ZodType;
  hasConnectorId?: 'required' | 'optional' | false;
  outputSchema: z.ZodType;
  configSchema?: z.ZodObject;
  summary: string | null;
  description: string | null;
  /** Documentation URL for this API endpoint */
  documentation?: string | null;
  /** API stability level derived from the OpenAPI `x-state` field */
  stability?: StepStabilityLevel;
  /** Deprecation metadata for this step type. */
  deprecation?: StepDeprecationInfo;
  examples?: ConnectorExamples;
  // Rich property handlers for completions, validation and decorations
  editorHandlers?: {
    config?: Record<string, StepPropertyHandler | undefined>;
    input?: Record<string, StepPropertyHandler | undefined>;
  };
}

export interface DynamicConnectorContract extends BaseConnectorContract {
  /** Action type ID from Kibana actions plugin */
  actionTypeId: string;
  /** User-facing connector type name from the actions plugin */
  displayName: string;
  /** Available connector instances */
  instances: ConnectorInstance[];
  /** Whether this connector type is enabled */
  enabled?: boolean;
  /** Whether this is a system action type */
  isSystemActionType?: boolean;
}

export const KNOWN_HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface EnhancedInternalConnectorContract extends InternalConnectorContract {
  examples: ConnectorExamples;
}

export interface InternalConnectorContract extends BaseConnectorContract {
  /** HTTP method(s) for this API endpoint */
  methods: HttpMethod[];
  /** URL pattern(s) for this API endpoint */
  patterns: string[];
  /** Parameter type metadata for proper request building */
  parameterTypes: {
    headerParams: string[];
    pathParams: string[];
    urlParams: string[];
    bodyParams: string[];
  };
}

/**
 * Editor handlers type, only used in the UI and extensions.
 * Maintains type safety while allowing variance
 */
export interface EditorHandlers<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> {
  config?: EditorHandlersConfig<Config, Input>;
  input?: EditorHandlersInput<Input, Config>;
  dynamicSchema?: DynamicSchema<Input, Output, Config>;
}

export type EditorHandlersConfig<
  Config extends z.ZodObject = z.ZodObject,
  Input extends z.ZodType = z.ZodType
> = {
  [K in DotKeysOf<z.infer<Config>>]?: StepPropertyHandler<
    DotObject<z.infer<Config>>[K],
    z.infer<Config>,
    Input extends z.ZodObject ? z.infer<Input> : Record<string, unknown>
  >;
};

export type EditorHandlersInput<
  Input extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> = Input extends z.ZodObject
  ? {
      [K in DotKeysOf<z.infer<Input>>]?: StepPropertyHandler<
        DotObject<z.infer<Input>>[K],
        z.infer<Config>,
        z.infer<Input>
      >;
    }
  : {};

/**
 * Dynamic schema handlers for a step
 */
export interface DynamicSchema<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
  Config extends z.ZodObject = z.ZodObject
> {
  /**
   * Dynamic Zod schema for validating step output based on input.
   * Allows for more flexible output structure based on the specific input provided.
   * @param input The input data for the step.
   * @returns A Zod schema defining structure and validation rules for the output of the step.
   */
  getOutputSchema?(params: {
    input: z.infer<Input>;
    config: z.infer<Config>;
  }): z.ZodType<z.infer<Output>>;
}

export interface StepPropertyHandler<
  T = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TInput extends Record<string, unknown> = Record<string, unknown>
> {
  /**
   * Entity selection configuration for the property.
   * Provides a unified interface for search, resolution, and decoration of entity references.
   */
  selection?: PropertySelectionHandler<Exclude<T, undefined>, TConfig, TInput>;
  /**
   * Connector ID selection configuration for the property.
   * Used to resolve connector IDs for custom steps.
   *
   * **Note**: This handler is currently only supported for the `connector-id` property in the config schema.
   */
  connectorIdSelection?: ConnectorIdSelectionHandler;
}

type DependsOnValuePath = `config.${string}` | `input.${string}`;
export interface PropertySelectionHandler<
  T = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TInput extends Record<string, unknown> = Record<string, unknown>
> {
  /**
   * Dot paths (e.g. `config.proxy.ssl`, `input.owner`) whose values are passed in `context.values`
   * and included in the selection cache key. If omitted or empty, `context.values` is `{ config: {}, input: {} }`.
   */
  dependsOnValues?: DependsOnValuePath[];
  /**
   * Search for options matching the input query.
   * Used by autocomplete dropdowns when the user types.
   */
  search: (
    input: string,
    context: SelectionContext<TConfig, TInput>
  ) => Promise<SelectionOption<T>[]>;

  /**
   * Resolve an entity by its value.
   * Used when loading existing values or when a value is pasted.
   * Returns null if the entity is not found.
   */
  resolve: (
    value: T,
    context: SelectionContext<TConfig, TInput>
  ) => Promise<SelectionOption<T> | null>;

  /**
   * Get detailed information for the current value.
   * Used for decoration and metadata display in the editor.
   * The option parameter is the resolved entity from `resolve`, if available.
   */
  getDetails: (
    input: string,
    context: SelectionContext<TConfig, TInput>,
    option: SelectionOption<T> | null
  ) => Promise<SelectionDetails>;
}

export interface SelectionOption<T = unknown> {
  /** The value that will be stored in the YAML */
  value: T;
  /** The label displayed in the UI (optional) */
  label?: string;
  /** Description shown in completion popup or tooltips (optional) */
  description?: string;
  /** Extended documentation shown in side panel (optional) */
  documentation?: string;
}

export interface SelectionDetails {
  /** Message to display (e.g., "✓ Agent connected" or "Agent not found") */
  message: string;
  /** Links to related actions (e.g., "Edit agent", "Create agent") */
  links?: Array<{
    /** Link text */
    text: string;
    /** Link path (relative or absolute URL) */
    path: string;
  }>;
}

/**
 * Structured values of the current step, split by scope.
 *
 * Built from scalar leaf properties in the YAML step definition.
 * Intermediate map nodes that have no scalar value are **not** represented;
 * a missing key means "not yet defined in the YAML", not "empty object".
 */
export interface StepSelectionValues<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TInput extends Record<string, unknown> = Record<string, unknown>
> {
  /** Root-level step properties (everything outside the `with` block). */
  config: RecursivePartial<TConfig>;
  /** Properties nested under the `with` block. */
  input: RecursivePartial<TInput>;
}

export interface SelectionContext<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TInput extends Record<string, unknown> = Record<string, unknown>
> {
  /** The step type ID (e.g., "onechat.runAgent") */
  stepType: string;
  /** The property path ("config" or "input") */
  scope: 'config' | 'input';
  /** The property key (e.g., "agent_id") */
  propertyKey: string;
  /** Sibling values of the current step, keyed by scope (only paths listed in `dependsOnValues` are populated). */
  values: StepSelectionValues<TConfig, TInput>;
}

export interface ConnectorIdSelectionHandler {
  /**
   * The action type IDs to search for.
   */
  connectorTypes: string[];
  /**
   * Whether to disable creation of a new connector from the connector ID selection.
   * If false (default), creation from the connector ID selection will be disabled.
   * If true, creation from the connector ID selection will be enabled for the first type in the `connectorTypes` list.
   */
  enableCreation?: boolean;
}

export interface ConnectorExamples {
  params?: Record<string, string>;
  snippet?: string;
}

export type ConnectorContractUnion =
  | DynamicConnectorContract
  | BaseConnectorContract
  | InternalConnectorContract;

export type WorkflowSortField = 'name' | 'enabled';

export interface WorkflowsSearchParams {
  size?: number;
  page?: number;
  query?: string;
  createdBy?: string[];
  enabled?: boolean[];
  tags?: string[];
  sortField?: WorkflowSortField;
  sortOrder?: 'asc' | 'desc';
  managed?: 'all' | 'managed' | 'unmanaged';
}

export interface RequestOptions {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  /** Bulk body for elasticsearch.bulk step */
  bulkBody?: Array<Record<string, unknown>>;
}

export type WorkflowDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface WorkflowDiagnostic {
  severity: WorkflowDiagnosticSeverity;
  message: string;
  source: string;
  path?: (string | number)[];
}
export interface ValidateWorkflowResponseDto {
  valid: boolean;
  diagnostics: WorkflowDiagnostic[];
  parsedWorkflow?: WorkflowYaml;
}

export interface GetAvailableConnectorsResponse {
  connectorTypes: Record<string, ConnectorTypeInfo>;
  totalConnectors: number;
}

export interface ChildWorkflowExecutionItem {
  parentStepExecutionId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  status: ExecutionStatus;
  stepExecutions: WorkflowStepExecutionDto[];
}

/**
 * Per-item result of a bulk workflow schedule call. The array is order- and
 * length-preserving with respect to the input items: `results[i]` corresponds
 * to `items[i]`.
 */
export type BulkScheduleWorkflowResult = Array<
  | { status: 'scheduled'; workflowExecutionId: string }
  | { status: 'error'; error: { message: string } }
>;
