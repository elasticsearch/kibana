/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { appCategories, appIds } from '@kbn/management-cards-navigation';
import type { Subscription } from 'rxjs';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import { createNavigationTree } from './navigation_tree';
import type {
  ServerlessObservabilityPublicSetup,
  ServerlessObservabilityPublicStart,
  ServerlessObservabilityPublicSetupDependencies,
  ServerlessObservabilityPublicStartDependencies,
} from './types';

export class ServerlessObservabilityPlugin
  implements
    Plugin<
      ServerlessObservabilityPublicSetup,
      ServerlessObservabilityPublicStart,
      ServerlessObservabilityPublicSetupDependencies,
      ServerlessObservabilityPublicStartDependencies
    >
{
  private managementCardsSubscription?: Subscription;

  public setup(
    _core: CoreSetup<
      ServerlessObservabilityPublicStartDependencies,
      ServerlessObservabilityPublicStart
    >,
    _setupDeps: ServerlessObservabilityPublicSetupDependencies
  ): ServerlessObservabilityPublicSetup {
    return {};
  }

  public start(
    core: CoreStart,
    setupDeps: ServerlessObservabilityPublicStartDependencies
  ): ServerlessObservabilityPublicStart {
    const { serverless, management, security, workflowsManagement } = setupDeps;

    const chatExperience$ = core.settings.client.get$<AIChatExperience>(AI_CHAT_EXPERIENCE_TYPE);

    const navigationTree$ = combineLatest([
      setupDeps.streams?.navigationStatus$ || of({ status: 'disabled' as const }),
      chatExperience$,
    ]).pipe(
      map(([{ status }, chatExperience]) => {
        return createNavigationTree({
          core,
          streamsAvailable: status === 'enabled',
          overviewAvailable: core.pricing.isFeatureAvailable('observability:complete_overview'),
          genAiSettingsAvailable: core.pricing.isFeatureAvailable('observability:gen_ai_settings'),
          isCasesAvailable: Boolean(setupDeps.cases),
          showAiAssistant: chatExperience !== AIChatExperience.Agent,
        });
      })
    );
    serverless.initNavigation('oblt', navigationTree$);

    if (workflowsManagement && !core.pricing.isFeatureAvailable('observability:workflows')) {
      workflowsManagement.setUnavailableInServerlessTier({
        // Hardcoded for now since it's the only product that can require an upgrade. Could be improved by retrieving the required products from the pricing config.
        requiredProducts: ['Observability: Complete'],
      });
    }

    const aiAssistantIsEnabled = core.application.capabilities.observabilityAIAssistant?.show;
    const roleManagementEnabled = security.authz.isRoleManagementEnabled();

    this.managementCardsSubscription = chatExperience$
      .pipe(
        map(
          (chatExperience) =>
            Boolean(aiAssistantIsEnabled) && chatExperience !== AIChatExperience.Agent
        ),
        distinctUntilChanged(),
        switchMap((showAiAssistant) =>
          serverless.getNavigationCards$(
            roleManagementEnabled,
            showAiAssistant
              ? {
                  observabilityAiAssistantManagement: {
                    category: appCategories.OTHER,
                    title: i18n.translate(
                      'xpack.serverlessObservability.aiAssistantManagementTitle',
                      {
                        defaultMessage: 'AI Assistant Settings',
                      }
                    ),
                    description: i18n.translate(
                      'xpack.serverlessObservability.aiAssistantManagementDescription',
                      {
                        defaultMessage:
                          'Manage knowledge base and control assistant behavior, including response language.',
                      }
                    ),
                    icon: 'sparkles',
                  },
                }
              : undefined
          )
        )
      )
      .subscribe((extendCardNavDefinitions) => {
        management.setupCardsNavigation({
          enabled: true,
          hideLinksTo: [appIds.RULES],
          extendCardNavDefinitions,
        });
      });

    return {};
  }

  public stop() {
    this.managementCardsSubscription?.unsubscribe();
  }
}
