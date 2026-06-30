/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { Plugin, CoreSetup, AppMountParameters, AppDeepLink } from '@kbn/core/public';
import { AppStatus } from '@kbn/core/public';
import type { AppUpdater } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { sortBy } from 'lodash';
import { css as cssClassName } from '@emotion/css';

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/public';
import type { UrlForwardingSetup } from '@kbn/url-forwarding-plugin/public';
import { deepLinkIds as devtoolsDeeplinkIds } from '@kbn/deeplinks-devtools';
import type { CreateDevToolArgs, DevToolApp } from './dev_tool';
import { createDevToolApp } from './dev_tool';
import { DocTitleService, BreadcrumbService } from './services';

export interface DevToolsSetup {
  /**
   * Register a developer tool. It will be available
   * in the dev tools app under a separate tab.
   *
   * Registering dev tools works almost similar to registering
   * applications in the core application service,
   * but they will be rendered with a frame containing tabs
   * to switch between the tools.
   * @param devTool The dev tools descriptor
   */
  register: (devTool: CreateDevToolArgs) => DevToolApp;
}

const devAppWrapperClassName = cssClassName`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

export class DevToolsPlugin implements Plugin<DevToolsSetup, void> {
  private readonly devTools = new Map<string, DevToolApp>();
  private appStateUpdater = new BehaviorSubject<AppUpdater>(() => ({}));

  private breadcrumbService = new BreadcrumbService();
  private docTitleService = new DocTitleService();

  private getSortedDevTools(): readonly DevToolApp[] {
    return sortBy([...this.devTools.values()], 'order');
  }

  constructor() {}

  public setup(coreSetup: CoreSetup, { urlForwarding }: { urlForwarding: UrlForwardingSetup }) {
    const { application: applicationSetup, getStartServices } = coreSetup;

    applicationSetup.register({
      id: 'dev_tools',
      title: i18n.translate('devTools.devToolsTitle', {
        defaultMessage: 'Dev Tools',
      }),
      updater$: this.appStateUpdater,
      euiIconType: 'logoElastic',
      order: 9010,
      category: DEFAULT_APP_CATEGORIES.management,
      mount: async (params: AppMountParameters) => {
        const { element, history } = params;
        element.className = devAppWrapperClassName;

        const [core] = await getStartServices();
        const { application, chrome, executionContext, rendering } = core;
        const { analytics, i18n: i18nStart, theme, userProfile } = core;
        const startServices = { analytics, i18n: i18nStart, theme, userProfile };

        this.docTitleService.setup(chrome.docTitle.change);
        this.breadcrumbService.setup(chrome.setBreadcrumbs);

        const appServices = {
          breadcrumbService: this.breadcrumbService,
          docTitleService: this.docTitleService,
          executionContext,
        };

        const { renderApp } = await import('./application');
        return renderApp(
          element,
          application,
          chrome,
          history,
          this.getSortedDevTools(),
          appServices,
          startServices,
          rendering
        );
      },
    });

    urlForwarding.forwardApp('dev_tools', 'dev_tools');

    return {
      register: (devToolArgs: CreateDevToolArgs) => {
        if (this.devTools.has(devToolArgs.id)) {
          throw new Error(
            `Dev tool with id [${devToolArgs.id}] has already been registered. Use a unique id.`
          );
        }

        const devTool = createDevToolApp(devToolArgs);
        this.devTools.set(devTool.id, devTool);
        return devTool;
      },
    };
  }

  public start() {
    if (this.getSortedDevTools().length === 0) {
      this.appStateUpdater.next(() => ({ status: AppStatus.inaccessible }));
    } else {
      this.appStateUpdater.next(() => {
        const deepLinks: AppDeepLink[] = [...this.devTools.values()]
          .filter(
            // Some tools do not use a string title, so we filter those out
            (tool) => !tool.isDisabled() && typeof tool.title === 'string'
          )
          .map((tool) => {
            const deepLink: AppDeepLink = {
              id: tool.id,
              title: tool.title as string,
              path: `#/${tool.id}`,
              visibleIn: ['globalSearch', 'projectSideNav'],
            };
            if (!devtoolsDeeplinkIds.some((id) => id === deepLink.id)) {
              throw new Error('Deeplink must be registered in package.');
            }
            return deepLink;
          });

        return {
          deepLinks,
        };
      });
    }
  }

  public stop() {}
}
