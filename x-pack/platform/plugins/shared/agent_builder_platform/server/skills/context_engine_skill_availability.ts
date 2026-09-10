/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AvailabilityConfig } from '@kbn/agent-builder-server';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';

/** Hides Context Engine skills where the AI-index tools they bind are unavailable. */
export const contextEngineSkillAvailability: AvailabilityConfig = {
  cacheMode: 'space',
  handler: async ({ uiSettings }) => {
    const contextEngineEnabled = await uiSettings
      .get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID)
      .catch(() => false);
    return contextEngineEnabled
      ? { status: 'available' }
      : { status: 'unavailable', reason: 'Context Engine is disabled in this space.' };
  },
};
