/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { apiPrivileges } from '@kbn/context-engine-plugin/common/features';

export const hasContextEngineReadPrivilege = async ({
  security,
  request,
}: {
  security: SecurityPluginStart | undefined;
  request: KibanaRequest;
}): Promise<boolean> => {
  if (!security) {
    return false;
  }
  const checkPrivileges = security.authz.checkPrivilegesDynamicallyWithRequest(request);
  const { hasAllRequested } = await checkPrivileges({
    kibana: [security.authz.actions.api.get(apiPrivileges.readContextEngine)],
  });
  return hasAllRequested;
};
