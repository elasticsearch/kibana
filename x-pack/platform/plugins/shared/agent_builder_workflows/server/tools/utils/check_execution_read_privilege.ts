/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import { WorkflowsManagementApiActions } from '@kbn/workflows';

/**
 * Verifies the caller holds the `workflowsManagement:readExecution` Kibana
 * privilege before workflow execution data is returned through an Agent Builder
 * tool.
 *
 * Returns `true` when access is allowed. When the security plugin is disabled
 * there is no privilege model to enforce, so access is allowed.
 */
export const hasWorkflowExecutionReadPrivilege = async ({
  getSecurity,
  request,
  spaceId,
}: {
  getSecurity: () => SecurityPluginStart | undefined;
  request: KibanaRequest;
  spaceId: string;
}): Promise<boolean> => {
  const security = getSecurity();
  if (!security) {
    return true;
  }

  const requiredPrivilege = security.authz.actions.api.get(
    WorkflowsManagementApiActions.readExecution
  );
  const { hasAllRequested } = await security.authz
    .checkPrivilegesWithRequest(request)
    .atSpace(spaceId, { kibana: [requiredPrivilege] });

  return hasAllRequested;
};
