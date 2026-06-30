import type { BulkCreateWorkflowsCommand, ExecutionStatus, ExecutionType, WorkflowDetailDto, WorkflowExecutionSortField, WorkflowExecutionSortOrder, WorkflowsEventsLogDocumentSource, WorkflowsSearchParams } from '@kbn/workflows';
export interface BulkCreateWorkflowsParams {
    workflows: BulkCreateWorkflowsCommand['workflows'];
    overwrite?: boolean;
}
export interface BulkCreateWorkflowsResponse {
    created: WorkflowDetailDto[];
    failed: Array<{
        index: number;
        id: string;
        error: string;
    }>;
}
export interface CreateWorkflowParams {
    [key: string]: unknown;
}
export interface UpdateWorkflowParams {
    [key: string]: unknown;
}
export interface MgetWorkflowsParams {
    ids: string[];
    source?: string[];
}
export interface ValidateWorkflowParams {
    yaml: string;
}
export interface ExportWorkflowsParams {
    ids: string[];
}
export interface ExportWorkflowsResponse {
    entries: Array<{
        id: string;
        yaml: string;
    }>;
    manifest: {
        exportedCount: number;
        exportedAt: string;
        version: string;
    };
}
export interface GetAggsParams {
    fields: string[];
    managed?: WorkflowsSearchParams['managed'];
}
export interface GetSchemaParams {
    loose: boolean;
}
export interface RunWorkflowOptions {
    inputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}
export interface TestWorkflowParams {
    workflowId?: string;
    workflowYaml?: string;
    inputs: Record<string, unknown>;
}
export interface GetWorkflowExecutionsParams {
    statuses?: ExecutionStatus[];
    executionTypes?: ExecutionType[];
    executedBy?: string[];
    omitStepRuns?: boolean;
    /** Datemath lower bound for filtering executions by finishedAt (applied to finishedAt). */
    finishedAfter?: string;
    /** Datemath upper bound for filtering executions by finishedAt (applied to finishedAt). */
    finishedBefore?: string;
    sortField?: WorkflowExecutionSortField;
    sortOrder?: WorkflowExecutionSortOrder;
    page?: number;
    size?: number;
    /** Datemath lower bound for filtering executions by startedAt. */
    startedAfter?: string;
    /** Datemath upper bound for filtering executions by startedAt. */
    startedBefore?: string;
}
export interface GetWorkflowStepExecutionsParams {
    stepId?: string;
    includeInput?: boolean;
    includeOutput?: boolean;
    page?: number;
    size?: number;
    /** Datemath lower bound for filtering step executions by startedAt. */
    startedAfter?: string;
    /** Datemath upper bound for filtering step executions by startedAt. */
    startedBefore?: string;
}
export interface GetExecutionParams {
    includeInput?: boolean;
    includeOutput?: boolean;
}
export interface GetExecutionLogsParams {
    stepExecutionId?: string;
    size?: number;
    page?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface WorkflowExecutionLogEntry {
    id: string;
    timestamp: string;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    message: string;
    stepId?: string;
    stepName?: string;
    connectorType?: string;
    duration?: number;
    additionalData?: Record<string, unknown>;
}
export interface WorkflowExecutionLogsResponse {
    logs: WorkflowExecutionLogEntry[];
    total: number;
    size: number;
    page: number;
}
export interface ResumeExecutionParams {
    input: Record<string, unknown>;
}
export interface WorkflowsConfig {
    eventDrivenExecutionEnabled: boolean;
}
export interface SearchTriggerEventLogParams {
    kql?: string;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
}
export interface SearchTriggerEventLogHit {
    id: string;
    source: WorkflowsEventsLogDocumentSource;
}
export interface SearchTriggerEventLogResult {
    hits: SearchTriggerEventLogHit[];
    total: number;
    page: number;
    size: number;
}
