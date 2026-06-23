/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { combineLatest, map, of } from 'rxjs';
import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import { VECTORDB_APP_ID, TUTORIALS_DEEP_LINK_ID } from '../common/constants';
import { createNavigationTree } from './navigation_tree';
import type {
  ServerlessVectordbPluginSetup,
  ServerlessVectordbPluginStart,
  ServerlessVectordbServices,
  ServerlessVectordbStartDependencies,
} from './types';

export class ServerlessVectordbPlugin
  implements
    Plugin<
      ServerlessVectordbPluginSetup,
      ServerlessVectordbPluginStart,
      {},
      ServerlessVectordbStartDependencies
    >
{
  public setup(
    core: CoreSetup<ServerlessVectordbStartDependencies, ServerlessVectordbPluginStart>
  ): ServerlessVectordbPluginSetup {
    core.application.register({
      id: VECTORDB_APP_ID,
      title: i18n.translate('xpack.serverlessVectordb.app.title', {
        defaultMessage: 'Vector DB',
      }),
      appRoute: '/app/vectordb',
      euiIconType: 'logoElasticsearch',
      category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
      deepLinks: [
        {
          id: TUTORIALS_DEEP_LINK_ID,
          path: '/tutorials',
          title: i18n.translate('xpack.serverlessVectordb.tutorials.title', {
            defaultMessage: 'Tutorials',
          }),
          visibleIn: ['globalSearch', 'projectSideNav'],
        },
      ],
      async mount(params) {
        const [coreStart, depsStart] = await core.getStartServices();
        const { renderApp } = await import('./application');
        const appServices: ServerlessVectordbServices = {
          ...coreStart,
          share: depsStart.share,
          console: depsStart.console,
          cloud: depsStart.cloud,
          agentBuilder: depsStart.agentBuilder,
          history: params.history,
        };
        return renderApp(coreStart, appServices, params);
      },
    });

    return {};
  }

  public start(
    core: CoreStart,
    { serverless }: ServerlessVectordbStartDependencies
  ): ServerlessVectordbPluginStart {
    const chatExperience$ = core.settings.client.get$<AIChatExperience>(AI_CHAT_EXPERIENCE_TYPE);

    const navigationTree$ = combineLatest([of(core.application), chatExperience$]).pipe(
      map(([application, chatExperience]) => {
        const showAiAssistant = chatExperience !== AIChatExperience.Agent;
        return createNavigationTree({
          ...application,
          core,
          showAiAssistant,
        });
      })
    );
    serverless.initNavigation('vectordb', navigationTree$);
    return {};
  }

  public stop() {}
}
