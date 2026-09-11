/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { apiPrivileges } from '@kbn/context-engine-plugin/common/features';
import { isContextEngineEnabledInSpace } from '@kbn/context-engine-plugin/server/utils/is_context_engine_enabled_in_space';

export const assertContextEngineWriteAccess = async ({
  request,
  spaceId,
  getCoreStart,
  getSecurityStart,
}: {
  request: KibanaRequest;
  spaceId: string;
  getCoreStart: () => Promise<CoreStart>;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
}): Promise<void> => {
  const coreStart = await getCoreStart();
  const security = await getSecurityStart();

  if (!security) {
    throw new Error('Security plugin is not available.');
  }

  const isEnabled = await isContextEngineEnabledInSpace({
    savedObjects: coreStart.savedObjects,
    uiSettings: coreStart.uiSettings,
    spaceId,
  });

  if (!isEnabled) {
    throw new Error('Context Engine is not enabled in this space.');
  }

  const checkPrivileges = security.authz.checkPrivilegesWithRequest(request);
  const privileges = await checkPrivileges.atSpace(spaceId, {
    kibana: [apiPrivileges.writeContextEngine],
  });

  if (!privileges.hasAllRequested) {
    throw new Error('Insufficient privileges to update Context Engine AI indices.');
  }
};
