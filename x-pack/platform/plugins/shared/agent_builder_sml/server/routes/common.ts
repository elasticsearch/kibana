/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RouteSecurity } from '@kbn/core-http-server';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { apiPrivileges } from '../../common/features';

export const READ_SECURITY: RouteSecurity = {
  authz: { requiredPrivileges: [apiPrivileges.readAgentBuilderSml] },
};

export type SmlFilters = { types?: string[]; tags?: string[] } | undefined;

export const getEffectiveFilters = async (
  uiSettingsClient: { get: <T>(key: string) => Promise<T> },
  filters: SmlFilters
): Promise<SmlFilters> => {
  const isExperimental = await uiSettingsClient.get<boolean>(
    AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
  );
  return isExperimental ? filters : { ...filters, types: ['connector'] };
};
