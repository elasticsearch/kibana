/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolAvailabilityConfig } from '@kbn/agent-builder-server';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';

// Only reads a setting, so caching per space is safe. Privileges are checked in each handler.
export const aiIndexToolsAvailability: ToolAvailabilityConfig = {
  cacheMode: 'space',
  handler: async ({ uiSettings }) => {
    const contextEngineEnabled = await uiSettings
      .get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID)
      .catch(() => false);
    if (!contextEngineEnabled) {
      return { status: 'unavailable', reason: 'Context Engine is disabled in this space.' };
    }
    return { status: 'available' };
  },
};
