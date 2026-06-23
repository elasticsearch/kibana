/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { appCategories, appIds } from '@kbn/management-cards-navigation';
import { QueryClient, MutationCache, QueryCache } from '@kbn/react-query';
import type { Subscription } from 'rxjs';
import { combineLatest, map, of } from 'rxjs';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import { docLinks } from '../common/doc_links';
import type {
  ServerlessSearchPluginSetup,
  ServerlessSearchPluginSetupDependencies,
  ServerlessSearchPluginStart,
  ServerlessSearchPluginStartDependencies,
} from './types';
import { getErrorCode, getErrorMessage, isKibanaServerError } from './utils/get_error_message';
import { createNavigationTree } from './navigation_tree';
import { WEB_CRAWLERS_LABEL } from '../common/i18n_string';

export class ServerlessSearchPlugin
  implements
    Plugin<
      ServerlessSearchPluginSetup,
      ServerlessSearchPluginStart,
      ServerlessSearchPluginSetupDependencies,
      ServerlessSearchPluginStartDependencies
    >
{
  private managementCardsSubscription?: Subscription;

  public setup(
    core: CoreSetup<ServerlessSearchPluginStartDependencies, ServerlessSearchPluginStart>,
    setupDeps: ServerlessSearchPluginSetupDependencies
  ): ServerlessSearchPluginSetup {
    const queryClient = new QueryClient({
      mutationCache: new MutationCache({
        onError: (error) => {
          core.notifications.toasts.addError(error as Error, {
            title: (error as Error).name,
            toastMessage: getErrorMessage(error),
            toastLifeTimeMs: 1000,
          });
        },
      }),
      queryCache: new QueryCache({
        onError: (error) => {
          // 404s are often functionally okay and shouldn't show toasts by default
          if (getErrorCode(error) === 404) {
            return;
          }
          if (isKibanaServerError(error) && !error.skipToast) {
            core.notifications.toasts.addError(error, {
              title: error.name,
              toastMessage: getErrorMessage(error),
              toastLifeTimeMs: 1000,
            });
          }
        },
      }),
    });

    const homeTitle = i18n.translate('xpack.serverlessSearch.app.home.title', {
      defaultMessage: 'Home',
    });

    core.application.register({
      id: 'serverlessHomeRedirect',
      title: homeTitle,
      appRoute: '/app/elasticsearch',
      euiIconType: 'logoElastic',
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      visibleIn: [],
      async mount({}: AppMountParameters) {
        const [coreStart] = await core.getStartServices();
        coreStart.chrome.docTitle.change(homeTitle);
        coreStart.application.navigateToApp('searchHomepage');
        return () => {};
      },
    });

    const connectorsTitle = i18n.translate('xpack.serverlessSearch.app.connectors.title', {
      defaultMessage: 'Connectors',
    });

    core.application.register({
      id: 'serverlessConnectors',
      title: connectorsTitle,
      appRoute: '/app/connectors',
      euiIconType: 'logoElastic',
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      visibleIn: ['globalSearch'],
      async mount({ element, history }: AppMountParameters) {
        const { renderApp } = await import('./application/connectors');
        const [coreStart, services] = await core.getStartServices();
        coreStart.chrome.docTitle.change(connectorsTitle);
        docLinks.setDocLinks(coreStart.docLinks.links);

        return await renderApp(element, coreStart, { history, ...services }, queryClient);
      },
    });

    core.application.register({
      id: 'serverlessWebCrawlers',
      title: WEB_CRAWLERS_LABEL,
      appRoute: '/app/web_crawlers',
      euiIconType: 'logoElastic',
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      visibleIn: ['globalSearch'],
      async mount({ element, history }: AppMountParameters) {
        const { renderApp } = await import('./application/web_crawlers');
        const [coreStart, services] = await core.getStartServices();
        coreStart.chrome.docTitle.change(WEB_CRAWLERS_LABEL);
        docLinks.setDocLinks(coreStart.docLinks.links);

        return await renderApp(element, coreStart, { history, ...services }, queryClient);
      },
    });

    return {};
  }

  public start(
    core: CoreStart,
    services: ServerlessSearchPluginStartDependencies
  ): ServerlessSearchPluginStart {
    const { serverless, management, security } = services;
    const aiAssistantIsEnabled = core.application.capabilities.observabilityAIAssistant?.show;

    const chatExperience$ = core.settings.client.get$<AIChatExperience>(AI_CHAT_EXPERIENCE_TYPE);

    const navigationTree$ = combineLatest([of(core.application), chatExperience$]).pipe(
      map(([application, chatExperience]) => {
        const showAiAssistant = chatExperience !== AIChatExperience.Agent;
        return createNavigationTree({
          ...application,
          core,
          showAiAssistant,
          showPerformanceLink: Boolean(application.capabilities.serverlessSearch?.manageCluster),
        });
      })
    );
    serverless.initNavigation('es', navigationTree$);

    this.managementCardsSubscription = serverless
      .getNavigationCards$(
        security.authz.isRoleManagementEnabled(),
        aiAssistantIsEnabled
          ? {
              observabilityAiAssistantManagement: {
                category: appCategories.OTHER,
                title: i18n.translate('xpack.serverlessSearch.aiAssistantManagementTitle', {
                  defaultMessage: 'AI Assistant',
                }),
                description: i18n.translate(
                  'xpack.serverlessSearch.aiAssistantManagementDescription',
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
      .subscribe((extendCardNavDefinitions) => {
        management.setupCardsNavigation({
          enabled: true,
          hideLinksTo: [appIds.MAINTENANCE_WINDOWS],
          extendCardNavDefinitions,
        });
      });

    return {};
  }

  public stop() {
    this.managementCardsSubscription?.unsubscribe();
  }
}
