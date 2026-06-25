/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RouteSecurity } from '@kbn/core-http-server';
import { WorkflowsManagementApiActions } from '@kbn/workflows';
import { ManagedWorkflowExecutionReadForbiddenError } from '../../managed_workflow_execution_read_error';
import { ManagedWorkflowReadForbiddenError } from '../../managed_workflow_read_error';
import type { GetWorkflowsParams } from '../../workflows_management_api';

interface AuthzRequest {
  authzResult?: Record<string, boolean>;
}

interface ManagedResource {
  managed?: boolean;
}

/**
 * Security configuration objects ready to be used in route definitions.
 *
 * Privilege model:
 * - Routes that return workflow data to the caller require `read`.
 * - Routes that return execution data require `readExecution`.
 * - Mutating routes (update / delete) perform internal reads as part of the
 *   write operation (merge, space-scoping). These reads are implementation
 *   details and do NOT require the `read` privilege.
 * - `get_workflows` and `get_stats` conditionally include execution data when
 *   the user also holds `readExecution` (checked at runtime via `authzResult`).
 */
export const WORKFLOW_READ_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.read] },
};
/**
 * Allows either base read or managed read through platform authz so handlers can
 * inspect `authzResult` for both. Handlers must still require base `read`.
 */
export const WORKFLOW_READ_WITH_MANAGED_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      {
        anyRequired: [
          WorkflowsManagementApiActions.read,
          WorkflowsManagementApiActions.readManaged,
        ],
      },
    ],
  },
};
/**
 * This security configuration allows either `read` or `readExecution` privilege.
 * This is used to include optional `readExecution` privilege.
 * The `read` privilege needs to be checked explicitly in the route handler to enforce it.
 */
export const WORKFLOW_READ_OR_READ_EXECUTIONS_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      {
        anyRequired: [
          WorkflowsManagementApiActions.read,
          WorkflowsManagementApiActions.readManaged,
          WorkflowsManagementApiActions.readExecution,
          WorkflowsManagementApiActions.readManagedExecution,
        ],
      },
    ],
  },
};
export const WORKFLOW_CREATE_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.create] },
};
export const WORKFLOW_CLONE_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [WorkflowsManagementApiActions.create, WorkflowsManagementApiActions.read],
  },
};
export const WORKFLOW_BULK_CREATE_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      WorkflowsManagementApiActions.create,
      WorkflowsManagementApiActions.update,
    ],
  },
};
export const WORKFLOW_UPDATE_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.update] },
};
export const WORKFLOW_MANAGED_UPDATE_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      WorkflowsManagementApiActions.update,
      WorkflowsManagementApiActions.updateManaged,
    ],
  },
};
export const WORKFLOW_DELETE_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.delete] },
};
export const WORKFLOW_EXECUTE_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [WorkflowsManagementApiActions.execute, WorkflowsManagementApiActions.read],
  },
};
export const WORKFLOW_EXECUTION_READ_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.readExecution] },
};
/**
 * Allows either base execution read or managed execution read through platform
 * authz so handlers can inspect `authzResult` for both. Handlers must still
 * require base `readExecution`.
 */
export const WORKFLOW_EXECUTION_READ_WITH_MANAGED_SECURITY: RouteSecurity = {
  authz: {
    requiredPrivileges: [
      {
        anyRequired: [
          WorkflowsManagementApiActions.readExecution,
          WorkflowsManagementApiActions.readManagedExecution,
        ],
      },
    ],
  },
};
export const WORKFLOW_EXECUTION_CANCEL_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.cancelExecution] },
};
export const WORKFLOW_EXECUTION_RESUME_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [WorkflowsManagementApiActions.execute] },
};

const hasPrivilege = (request: AuthzRequest, action: WorkflowsManagementApiActions): boolean =>
  request.authzResult?.[action] === true;

export const hasWorkflowReadPrivilege = (request: AuthzRequest): boolean =>
  hasPrivilege(request, WorkflowsManagementApiActions.read);

export const hasWorkflowExecutionReadPrivilege = (request: AuthzRequest): boolean =>
  hasPrivilege(request, WorkflowsManagementApiActions.readExecution);

export const canReadManagedWorkflows = (request: AuthzRequest): boolean =>
  hasWorkflowReadPrivilege(request) &&
  hasPrivilege(request, WorkflowsManagementApiActions.readManaged);

export const canReadManagedWorkflowExecutions = (request: AuthzRequest): boolean =>
  hasWorkflowExecutionReadPrivilege(request) &&
  hasPrivilege(request, WorkflowsManagementApiActions.readManagedExecution);

export const resolveAuthorizedManagedFilter = (
  request: AuthzRequest,
  requested?: GetWorkflowsParams['managedFilter']
): GetWorkflowsParams['managedFilter'] => {
  if ((requested === 'managed' || requested === 'all') && !canReadManagedWorkflows(request)) {
    throw new ManagedWorkflowReadForbiddenError();
  }

  return requested ?? 'unmanaged';
};

export const assertCanReadManagedWorkflow = (
  request: AuthzRequest,
  workflow: ManagedResource | null | undefined
): void => {
  if (workflow?.managed === true && !canReadManagedWorkflows(request)) {
    throw new ManagedWorkflowReadForbiddenError();
  }
};

export const assertCanReadManagedWorkflowExecution = (
  request: AuthzRequest,
  execution: ManagedResource | null | undefined
): void => {
  if (execution?.managed === true && !canReadManagedWorkflowExecutions(request)) {
    throw new ManagedWorkflowExecutionReadForbiddenError();
  }
};
