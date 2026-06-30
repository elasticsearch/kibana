/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityServiceStart } from '@kbn/core-security-server';
import type { AuditEvent } from '@kbn/security-plugin-types-server';
import type { WorkflowsService } from '../../workflows_management_service';

/**
 * Stable action names for xpack.security.audit.ignore_filters.
 * Bulk create/delete APIs use dedicated actions (`workflow_bulk_*`) so operators can filter bulk
 * traffic without matching on message text.
 */
export const WorkflowManagementAuditActions = {
  CREATE: 'workflow_create',
  BULK_CREATE: 'workflow_bulk_create',
  UPDATE: 'workflow_update',
  RESTORE: 'workflow_restore',
  DELETE: 'workflow_delete',
  BULK_DELETE: 'workflow_bulk_delete',
  CLONE: 'workflow_clone',
  EXPORT: 'workflow_export',
  MGET: 'workflow_mget',
  GET: 'workflow_get',
  RUN: 'workflow_run',
  TEST: 'workflow_test',
  TEST_STEP: 'workflow_test_step',
  CANCEL_EXECUTION: 'workflow_execution_cancel',
  RESUME_EXECUTION: 'workflow_execution_resume',
} as const;

type WorkflowAuditEventType = 'access' | 'change' | 'creation' | 'deletion';

export interface WorkflowAuditFields {
  managed?: boolean;
  originalWorkflowId?: string | null;
  ownerPlugin?: string | null;
  spaceId?: string;
  reason?: string;
}

interface WorkflowAuditParams extends WorkflowAuditFields {
  id: string;
  error?: unknown;
}

const getManagedWorkflowMessageSuffix = (fields?: WorkflowAuditFields): string => {
  if (fields?.managed !== true) {
    return '';
  }

  return [
    'managed=true',
    fields.originalWorkflowId ? `originalWorkflowId=${fields.originalWorkflowId}` : undefined,
    fields.ownerPlugin ? `ownerPlugin=${fields.ownerPlugin}` : undefined,
    fields.spaceId ? `space=${fields.spaceId}` : undefined,
    fields.reason ? `reason=${fields.reason}` : undefined,
  ]
    .filter((field): field is string => field !== undefined)
    .map((field) => ` [${field}]`)
    .join('');
};

/**
 * Builds a workflow-management audit event (success vs failure from presence of `error`).
 * Non-`Error` values use ECS error code `Unknown` and `String(error)` as the message.
 */
function createEvent(
  action: string,
  eventType: WorkflowAuditEventType,
  message: string,
  error?: unknown,
  fields?: WorkflowAuditFields
): AuditEvent {
  const event: AuditEvent = {
    message: `${message}${getManagedWorkflowMessageSuffix(fields)}`,
    event: {
      action,
      category: ['database'],
      type: [eventType],
      outcome: error !== undefined ? 'failure' : 'success',
    },
  };

  if (error !== undefined) {
    event.error =
      error instanceof Error
        ? { code: error.name, message: error.message }
        : { code: 'Unknown', message: String(error) };
  }

  return event;
}

interface WorkflowManagementAuditLogDeps {
  service: WorkflowsService;
}

/**
 * Audit logger for workflow management.
 * Instantiated once with deps; each method takes only `request` + params.
 * Best-effort: sync throws are caught; audit never affects HTTP responses.
 */
export class WorkflowManagementAuditLog {
  private security?: SecurityServiceStart;

  constructor(private readonly deps: WorkflowManagementAuditLogDeps) {
    this.deps.service
      .getCoreStart()
      .then((coreStart) => {
        this.security = coreStart.security; // security service is initialized
      })
      .catch(() => {
        // Best-effort: do not fail requests if audit logging fails
      });
  }

  private getActor(request?: KibanaRequest): 'User' | 'System' {
    return request ? 'User' : 'System';
  }

  private log(request: KibanaRequest | undefined, event: AuditEvent): void {
    try {
      if (!this.security) {
        return;
      }
      const auditLogger = request
        ? this.security?.audit.asScoped(request)
        : this.security?.audit.withoutRequest;
      auditLogger?.log(event);
    } catch {
      // Best-effort only: never let audit affect the HTTP response.
    }
  }

  logWorkflowCreated(
    request: KibanaRequest | undefined,
    params: WorkflowAuditParams & { viaBulkImport?: boolean }
  ): void {
    const { id, viaBulkImport } = params;
    const actor = this.getActor(request);
    const message = viaBulkImport
      ? `${actor} created workflow via bulk import [id=${id}]`
      : `${actor} created workflow [id=${id}]`;
    const action = viaBulkImport
      ? WorkflowManagementAuditActions.BULK_CREATE
      : WorkflowManagementAuditActions.CREATE;
    this.log(request, createEvent(action, 'creation', message, undefined, params));
  }

  logWorkflowCreateFailed(
    request: KibanaRequest | undefined,
    error: unknown,
    options: WorkflowAuditFields & { bulkOperation?: boolean } = {}
  ): void {
    const actor = this.getActor(request);
    const message = options.bulkOperation
      ? `${actor} failed bulk workflow create`
      : `${actor} failed to create a workflow`;
    const action = options.bulkOperation
      ? WorkflowManagementAuditActions.BULK_CREATE
      : WorkflowManagementAuditActions.CREATE;
    this.log(request, createEvent(action, 'creation', message, error, options));
  }

  /**
   * One `workflow_bulk_create` audit per created workflow and per failed bulk row (bulk POST /api/workflows).
   */
  logBulkWorkflowCreateResults(
    request: KibanaRequest | undefined,
    params: {
      created: ReadonlyArray<{ id: string }>;
      failed: ReadonlyArray<{ index: number; id: string; error: string }>;
    }
  ): void {
    const actor = this.getActor(request);
    for (const workflow of params.created) {
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.BULK_CREATE,
          'creation',
          `${actor} created workflow via bulk import [id=${workflow.id}]`
        )
      );
    }
    for (const row of params.failed) {
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.BULK_CREATE,
          'creation',
          `${actor} failed to create workflow via bulk import [index=${row.index}] [id=${row.id}]`,
          row.error
        )
      );
    }
  }

  logWorkflowUpdated(request: KibanaRequest | undefined, params: WorkflowAuditParams): void {
    const { id, error } = params;
    const actor = this.getActor(request);
    const message =
      error !== undefined
        ? `${actor} failed to update workflow [id=${id}]`
        : `${actor} updated workflow [id=${id}]`;
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.UPDATE, 'change', message, error, params)
    );
  }

  logWorkflowRestored(
    request: KibanaRequest | undefined,
    params: WorkflowAuditParams & { eventId: string; version?: number; sequence?: number }
  ): void {
    const { id, eventId, version, sequence, error } = params;
    const actor = this.getActor(request);
    const metadataSuffix = [
      sequence !== undefined ? `[sequence=${sequence}]` : undefined,
      version !== undefined ? `[version=${version}]` : undefined,
    ]
      .filter((part): part is string => part !== undefined)
      .join(' ');
    const metadataPart = metadataSuffix.length > 0 ? ` ${metadataSuffix}` : '';
    const message =
      error !== undefined
        ? `${actor} failed to restore workflow from history [id=${id}] [eventId=${eventId}]`
        : `${actor} restored workflow from history [id=${id}] [eventId=${eventId}]${metadataPart}`;
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.RESTORE, 'change', message, error, params)
    );
  }

  logWorkflowDeleted(
    request: KibanaRequest | undefined,
    params: WorkflowAuditParams & { viaBulkDelete?: boolean; force?: boolean }
  ): void {
    const { id, viaBulkDelete, force, error } = params;
    const actor = this.getActor(request);
    const forceTag = force ? ' (force)' : '';
    let message: string;
    if (error !== undefined) {
      message = viaBulkDelete
        ? `${actor} failed to delete workflow via bulk delete [id=${id}]${forceTag}`
        : `${actor} failed to delete workflow [id=${id}]${forceTag}`;
    } else {
      message = viaBulkDelete
        ? `${actor} deleted workflow via bulk delete [id=${id}]${forceTag}`
        : `${actor} deleted workflow [id=${id}]${forceTag}`;
    }
    const action = viaBulkDelete
      ? WorkflowManagementAuditActions.BULK_DELETE
      : WorkflowManagementAuditActions.DELETE;
    this.log(request, createEvent(action, 'deletion', message, error, params));
  }

  /**
   * One `workflow_bulk_delete` audit event per successfully removed id and per failed id (bulk API).
   */
  logBulkWorkflowDeleteResults(
    request: KibanaRequest | undefined,
    params: {
      successfulIds: readonly string[];
      failures: ReadonlyArray<{ id: string; error: string } & WorkflowAuditFields>;
      force?: boolean;
      workflows?: ReadonlyArray<{ id: string } & WorkflowAuditFields>;
    }
  ): void {
    const actor = this.getActor(request);
    const forceTag = params.force ? ' (force)' : '';
    for (const id of params.successfulIds) {
      const workflow = params.workflows?.find((candidate) => candidate.id === id);
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.BULK_DELETE,
          'deletion',
          `${actor} deleted workflow via bulk delete [id=${id}]${forceTag}`,
          undefined,
          workflow
        )
      );
    }
    for (const f of params.failures) {
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.BULK_DELETE,
          'deletion',
          `${actor} failed to delete workflow via bulk delete [id=${f.id}]${forceTag}`,
          f.error,
          f
        )
      );
    }
  }

  logBulkWorkflowDeleteFailed(
    request: KibanaRequest | undefined,
    error: unknown,
    options: WorkflowAuditFields & { force?: boolean } = {}
  ): void {
    const actor = this.getActor(request);
    const forceTag = options.force ? ' (force)' : '';
    this.log(
      request,
      createEvent(
        WorkflowManagementAuditActions.BULK_DELETE,
        'deletion',
        `${actor} failed bulk workflow delete${forceTag}`,
        error,
        options
      )
    );
  }

  logWorkflowCloned(
    request: KibanaRequest,
    params: { sourceId: string; newId?: string; error?: unknown }
  ): void {
    const { sourceId, newId, error } = params;
    const message =
      error !== undefined
        ? `User failed to clone workflow [id=${sourceId}]`
        : `User cloned workflow [sourceId=${sourceId}] to [id=${newId}]`;
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.CLONE, 'creation', message, error)
    );
  }

  /**
   * Export audit: one `workflow_export` event per id on success; a single failure event when `error` is set.
   */
  logWorkflowsExported(
    request: KibanaRequest,
    params: { ids?: readonly string[]; error?: unknown }
  ): void {
    const { ids, error } = params;
    if (error !== undefined) {
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.EXPORT,
          'access',
          'User failed to export workflows',
          error
        )
      );
      return;
    }
    for (const id of ids ?? []) {
      this.log(
        request,
        createEvent(
          WorkflowManagementAuditActions.EXPORT,
          'access',
          `User exported workflow [id=${id}]`
        )
      );
    }
  }

  logWorkflowAccessed(request: KibanaRequest, params: { id: string; error?: unknown }): void {
    const { id, error } = params;
    const message =
      error !== undefined
        ? `User failed to read workflow [id=${id}]`
        : `User accessed workflow [id=${id}]`;
    this.log(request, createEvent(WorkflowManagementAuditActions.GET, 'access', message, error));
  }

  logWorkflowMget(
    request: KibanaRequest,
    params: { requestedCount?: number; returnedCount?: number; error?: unknown }
  ): void {
    const { error, requestedCount, returnedCount } = params;
    const message =
      error !== undefined
        ? `User failed workflows mget: ${String(error)}`
        : `User requested workflows by ids: requested ${requestedCount}, returned ${returnedCount}`;
    this.log(request, createEvent(WorkflowManagementAuditActions.MGET, 'access', message, error));
  }

  logWorkflowRun(
    request: KibanaRequest,
    params: { workflowId: string; executionId?: string; error?: unknown }
  ): void {
    const { workflowId, executionId, error } = params;
    const message =
      error !== undefined
        ? `User failed to run workflow [id=${workflowId}]`
        : `User ran workflow [id=${workflowId}] [executionId=${executionId}]`;
    this.log(request, createEvent(WorkflowManagementAuditActions.RUN, 'change', message, error));
  }

  logWorkflowTest(
    request: KibanaRequest,
    params: { workflowExecutionId: string; workflowId?: string; error?: unknown }
  ): void {
    const { workflowExecutionId, workflowId, error } = params;
    const wfPart = workflowId !== undefined ? `[workflowId=${workflowId}]` : '[draft yaml]';
    const executionPart =
      workflowExecutionId !== undefined ? `[executionId=${workflowExecutionId}]` : '';
    const message =
      error !== undefined
        ? `User failed to test workflow ${wfPart} ${executionPart}`
        : `User tested workflow ${wfPart} ${executionPart}`;
    this.log(request, createEvent(WorkflowManagementAuditActions.TEST, 'change', message, error));
  }

  logWorkflowStepTest(
    request: KibanaRequest,
    params: {
      stepId: string;
      workflowExecutionId: string;
      workflowId?: string;
      error?: unknown;
    }
  ): void {
    const { stepId, workflowExecutionId, workflowId, error } = params;
    const wfPart = workflowId !== undefined ? `[workflowId=${workflowId}]` : '[draft yaml]';
    const executionPart =
      workflowExecutionId !== undefined ? `[executionId=${workflowExecutionId}]` : '';
    const message =
      error !== undefined
        ? `User failed to test workflow step [stepId=${stepId}] ${wfPart} ${executionPart}`
        : `User tested workflow step [stepId=${stepId}] ${wfPart} ${executionPart}`;
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.TEST_STEP, 'change', message, error)
    );
  }

  logExecutionCanceled(
    request: KibanaRequest,
    params: { executionId: string; error?: unknown }
  ): void {
    const { executionId, error } = params;
    const message =
      error !== undefined
        ? `User failed to cancel workflow execution [executionId=${executionId}]`
        : `User canceled workflow execution [executionId=${executionId}]`;
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.CANCEL_EXECUTION, 'change', message, error)
    );
  }

  logExecutionResumed(
    request: KibanaRequest,
    params: {
      executionId: string;
      error?: unknown;
      /** Present on success; mirrors execution context written by the engine. */
      resumedBy?: string;
    }
  ): void {
    const { executionId, error, resumedBy } = params;
    let message: string;
    if (error !== undefined) {
      message = `User failed to resume workflow execution [executionId=${executionId}]`;
    } else {
      const responderPart = resumedBy !== undefined ? ` [responder=${resumedBy}]` : '';
      message = `User resumed workflow execution [executionId=${executionId}]${responderPart}`;
    }
    this.log(
      request,
      createEvent(WorkflowManagementAuditActions.RESUME_EXECUTION, 'change', message, error)
    );
  }
}
