/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolAvailabilityConfig } from '@kbn/agent-builder-server';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';

// Settings-only check, so per-space caching is safe; authz happens in each handler.
export const aiIndexToolsAvailability: ToolAvailabilityConfig = {
  cacheMode: 'space',
  handler: async ({ uiSettings }) => {
    const [experimentalEnabled, contextEngineEnabled] = await Promise.all([
      uiSettings.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID).catch(() => false),
      uiSettings.get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID).catch(() => false),
    ]);
    if (!experimentalEnabled) {
      return {
        status: 'unavailable',
        reason: 'Agent Builder experimental features are disabled in this space.',
      };
    }
    if (!contextEngineEnabled) {
      return { status: 'unavailable', reason: 'Context Engine is disabled in this space.' };
    }
    return { status: 'available' };
  },
};
