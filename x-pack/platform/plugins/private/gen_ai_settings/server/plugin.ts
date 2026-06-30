/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, KibanaRequest } from '@kbn/core/server';
import type { Logger, PluginInitializerContext } from '@kbn/core/server';
import {
  AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
} from '@kbn/management-settings-ids';
import { schema } from '@kbn/config-schema';
import { i18n } from '@kbn/i18n';
import { registerServerRoutes } from './routes/register_routes';
import type {
  GenAiSettingsPluginSetupDependencies,
  GenAiSettingsPluginStartDependencies,
} from './types';
import type { GenAiSettingsRouteHandlerResources } from './routes/types';
import { NO_DEFAULT_CONNECTOR, FALLBACK_DEFAULT_CONNECTOR_ID } from '../common/constants';

export type GenAiSettingsPluginSetup = Record<string, never>;
export type GenAiSettingsPluginStart = Record<string, never>;

export class GenAiSettingsPlugin
  implements
    Plugin<
      GenAiSettingsPluginSetup,
      GenAiSettingsPluginStart,
      GenAiSettingsPluginSetupDependencies,
      GenAiSettingsPluginStartDependencies
    >
{
  private readonly logger: Logger;

  constructor(initContext: PluginInitializerContext) {
    this.logger = initContext.logger.get();
  }

  public setup(
    core: CoreSetup<GenAiSettingsPluginStartDependencies>,
    plugins: GenAiSettingsPluginSetupDependencies
  ): GenAiSettingsPluginSetup {
    const routeHandlerPlugins: Pick<
      GenAiSettingsRouteHandlerResources['plugins'],
      'actions' | 'inference' | 'agentBuilderPlatform'
    > = {
      actions: {
        setup: plugins.actions,
        start: () => core.getStartServices().then(([, starts]) => starts.actions),
      },
      inference: {
        setup: plugins.inference,
        start: () => core.getStartServices().then(([, starts]) => starts.inference),
      },
      ...(plugins.agentBuilderPlatform
        ? {
            agentBuilderPlatform: {
              start: () =>
                core.getStartServices().then(([, starts]) => starts.agentBuilderPlatform!),
            },
          }
        : {}),
    };

    const withCore = {
      ...routeHandlerPlugins,
      core: {
        setup: core,
        start: () => core.getStartServices().then(([coreStart]) => coreStart),
      },
    } as GenAiSettingsRouteHandlerResources['plugins'];

    registerServerRoutes({
      core,
      logger: this.logger,
      dependencies: {
        plugins: withCore,
      },
      isDev: false,
    });

    core.uiSettings.register({
      [GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR]: {
        readonlyMode: 'ui',
        readonly: true,
        schema: schema.string(),
        value: NO_DEFAULT_CONNECTOR,
        getValue: async ({ request }: { request?: KibanaRequest } = {}) => {
          try {
            if (!request) {
              return NO_DEFAULT_CONNECTOR;
            }
            const [, startServices] = await core.getStartServices();
            const actionsClient = await startServices.actions.getActionsClientWithRequest(request);
            const connectors = await actionsClient.getAll();
            const preferredExists = connectors.some(
              (connector) => connector.id === FALLBACK_DEFAULT_CONNECTOR_ID
            );
            return preferredExists ? FALLBACK_DEFAULT_CONNECTOR_ID : NO_DEFAULT_CONNECTOR;
          } catch (e) {
            return NO_DEFAULT_CONNECTOR;
          }
        },
      },
    });

    core.uiSettings.register({
      [GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY]: {
        readonlyMode: 'ui',
        readonly: true,
        schema: schema.boolean(),
        value: false,
      },
    });

    core.uiSettings.register({
      [AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS]: {
        readonlyMode: 'ui',
        readonly: true,
        schema: schema.arrayOf(schema.string(), { maxSize: 100 }),
        value: [],
      },
    });

    core.uiSettings.register({
      [GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING]: {
        name: i18n.translate('genAiSettings.tokenUsageTracking.name', {
          defaultMessage: 'Token usage tracking',
        }),
        description: i18n.translate('genAiSettings.tokenUsageTracking.description', {
          defaultMessage:
            'Track token usage for AI features. When enabled, token counts are logged for each LLM request, and a dashboard is available to monitor usage.',
        }),
        readonlyMode: 'ui',
        readonly: true,
        schema: schema.boolean(),
        value: false,
      },
    });

    return {};
  }

  public start(core: CoreStart): GenAiSettingsPluginStart {
    return {};
  }

  public stop() {}
}
