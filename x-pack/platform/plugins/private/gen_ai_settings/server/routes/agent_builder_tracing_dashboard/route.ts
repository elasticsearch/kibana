/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
} from '@kbn/management-settings-ids';
import { createGenAiSettingsServerRoute } from '../create_gen_ai_settings_server_route';

const syncAgentBuilderTracingDashboardRoute = createGenAiSettingsServerRoute({
  endpoint: 'POST /internal/gen_ai_settings/agent_builder/sync_tracing_dashboard',
  security: {
    authz: {
      requiredPrivileges: ['manage_advanced_settings'],
    },
  },
  handler: async (resources): Promise<{ installed: boolean }> => {
    const { request, plugins } = resources;

    if (!plugins.agentBuilder) {
      return { installed: false };
    }

    const coreStart = await plugins.core.start();
    const uiSettingsClient = coreStart.uiSettings.asScopedToClient(
      coreStart.savedObjects.getScopedClient(request)
    );

    const tracingEnabled = await uiSettingsClient.get<boolean>(
      AGENT_BUILDER_TRACING_ENABLED_SETTING_ID
    );
    const experimentalFeaturesEnabled = await uiSettingsClient.get<boolean>(
      AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
    );
    const enabled = tracingEnabled && experimentalFeaturesEnabled;

    const agentBuilderStart = await plugins.agentBuilder.start();
    await agentBuilderStart.dashboard.syncOverviewForSpace(enabled, request.spaceId);

    return { installed: enabled };
  },
});

export const agentBuilderTracingDashboardRoutes = {
  ...syncAgentBuilderTracingDashboardRoute,
};
