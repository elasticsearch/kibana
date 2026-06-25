/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import type { Capabilities } from '@kbn/core/public';
import type { ApplicationStart } from '@kbn/core-application-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { WORKFLOWS_MANAGEMENT_FEATURE_ID } from '@kbn/workflows';
import { WorkflowsManagementUiActions } from '@kbn/workflows/common/privileges';

const CapabilitiesMap = {
  canCreateWorkflow: WorkflowsManagementUiActions.create,
  canReadWorkflow: WorkflowsManagementUiActions.read,
  canReadManagedWorkflow: WorkflowsManagementUiActions.readManaged,
  canUpdateWorkflow: WorkflowsManagementUiActions.update,
  canDeleteWorkflow: WorkflowsManagementUiActions.delete,
  canExecuteWorkflow: WorkflowsManagementUiActions.execute,
  canReadWorkflowExecution: WorkflowsManagementUiActions.readExecution,
  canReadManagedWorkflowExecution: WorkflowsManagementUiActions.readManagedExecution,
  canCancelWorkflowExecution: WorkflowsManagementUiActions.cancelExecution,
} as const;

export type CapabilitiesKey = keyof typeof CapabilitiesMap;
export type WorkflowsManagementCapabilities = Record<CapabilitiesKey, boolean>;

export const useWorkflowsCapabilities = (): WorkflowsManagementCapabilities => {
  const {
    services: { application },
  } = useKibana<{ application: ApplicationStart }>();

  return useMemo(
    () => getWorkflowsCapabilities(application?.capabilities ?? {}),
    [application?.capabilities]
  );
};

export const getWorkflowsCapabilities = (
  capabilities: Capabilities
): WorkflowsManagementCapabilities => {
  const workflowsCapabilities = capabilities?.[WORKFLOWS_MANAGEMENT_FEATURE_ID] ?? {};

  return Object.fromEntries(
    Object.entries(CapabilitiesMap).map(([key, value]) => [
      key,
      Boolean(workflowsCapabilities[value]),
    ])
  ) as WorkflowsManagementCapabilities;
};
