/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AppStatus,
  DEFAULT_APP_CATEGORIES,
  type CoreSetup,
  type CoreStart,
  type Plugin,
  type PluginInitializerContext,
} from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import {
  ALERTZERO_APP_ID,
  ALERTZERO_APP_PATH,
  API_VERSIONS,
  TEMPLATE_ID_INVESTIGATION,
  buildInvestigationUrl,
} from '@kbn/alertzero-common';
import type { GetInvestigationResponse } from '@kbn/alertzero-common';
import { registerAgenticInvestigationTemplateUI } from '@kbn/agentic-investigations-common';
import { getAlertZeroDeepLinks } from './deep_links';
import type {
  AlertZeroClientConfig,
  AlertZeroPublicSetup,
  AlertZeroPublicStart,
  AlertZeroSetupDependencies,
  AlertZeroStartDependencies,
} from './types';

// Kept as a literal rather than `ALERTZERO_PLUGIN_NAME`: the i18n extractor only reads
// string literals, so a constant reference here would silently drop the message.
const APP_TITLE = i18n.translate('xpack.alertzero.appTitle', {
  defaultMessage: 'AlertZero',
});

const INVESTIGATION_TEMPLATE_NAME = i18n.translate('xpack.alertzero.conversationTemplate.name', {
  defaultMessage: 'Investigation',
});

export class AlertZeroPublicPlugin
  implements
    Plugin<
      AlertZeroPublicSetup,
      AlertZeroPublicStart,
      AlertZeroSetupDependencies,
      AlertZeroStartDependencies
    >
{
  private readonly config: AlertZeroClientConfig;

  constructor(context: PluginInitializerContext<AlertZeroClientConfig>) {
    this.config = context.config.get();
  }

  public setup(
    coreSetup: CoreSetup<AlertZeroStartDependencies, AlertZeroPublicStart>,
    _setupDeps: AlertZeroSetupDependencies
  ): AlertZeroPublicSetup {
    if (!this.config.enabled) {
      return {};
    }

    coreSetup.application.register({
      id: ALERTZERO_APP_ID,
      title: APP_TITLE,
      appRoute: ALERTZERO_APP_PATH,
      category: DEFAULT_APP_CATEGORIES.security,
      euiIconType: 'securitySignalDetected',
      status: AppStatus.accessible,
      visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
      order: 101,
      deepLinks: getAlertZeroDeepLinks(),
      mount: async (params) => {
        const [coreStart, startDeps] = await coreSetup.getStartServices();
        const { renderApp } = await import('./application');
        return renderApp({
          coreStart,
          startDeps,
          params,
          config: this.config,
        });
      },
    });

    return {};
  }

  public start(core: CoreStart, startDeps: AlertZeroStartDependencies): AlertZeroPublicStart {
    if (!this.config.enabled) {
      return {};
    }

    registerAgenticInvestigationTemplateUI({
      conversationTemplates: startDeps.agentBuilder.conversationTemplates,
      templateId: TEMPLATE_ID_INVESTIGATION,
      name: INVESTIGATION_TEMPLATE_NAME,
      icon: 'securitySignalDetected',
      loadInvestigation: async (conversationId) => {
        const { investigation } = await core.http.get<GetInvestigationResponse>(
          buildInvestigationUrl(conversationId),
          { version: API_VERSIONS.internal.v1 }
        );
        return investigation;
      },
    });

    return {};
  }

  public stop() {}
}
