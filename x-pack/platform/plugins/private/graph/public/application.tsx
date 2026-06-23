/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import type {
  ChromeStart,
  CoreStart,
  PluginInitializerContext,
  ToastsStart,
  OverlayStart,
  AppMountParameters,
  IUiSettingsClient,
  Capabilities,
  ScopedHistory,
} from '@kbn/core/public';
import ReactDOM from 'react-dom';
import type { DataPlugin } from '@kbn/data-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { NavigationPublicPluginStart as NavigationStart } from '@kbn/navigation-plugin/public';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { Start as InspectorPublicPluginStart } from '@kbn/inspector-plugin/public';
import type { SpacesApi } from '@kbn/spaces-plugin/public';
import type { SavedObjectsManagementPluginStart } from '@kbn/saved-objects-management-plugin/public';
import type {
  ContentClient,
  ContentManagementPublicStart,
} from '@kbn/content-management-plugin/public';

import type { KqlPluginStart } from '@kbn/kql/public';
import type { GraphSavePolicy } from './types';
import { graphRouter } from './router';
import { checkLicense } from '../common/check_license';

/**
 * These are dependencies of the Graph app besides the base dependencies
 * provided by the application service. Some of those still rely on non-shimmed
 * plugins in LP-world, but if they are migrated only the import path in the plugin
 * itself changes
 */
export interface GraphDependencies {
  pluginInitializerContext: PluginInitializerContext;
  core: CoreStart;
  coreStart: CoreStart;
  element: HTMLElement;
  appBasePath: string;
  capabilities: Capabilities;
  navigation: NavigationStart;
  licensing: LicensingPluginStart;
  chrome: ChromeStart;
  toastNotifications: ToastsStart;
  dataViews: DataViewsContract;
  data: ReturnType<DataPlugin['start']>;
  kql: KqlPluginStart;
  contentClient: ContentClient;
  addBasePath: (url: string) => string;
  getBasePath: () => string;
  storage: Storage;
  canEditDrillDownUrls: boolean;
  graphSavePolicy: GraphSavePolicy;
  overlays: OverlayStart;
  setHeaderActionMenu: AppMountParameters['setHeaderActionMenu'];
  uiSettings: IUiSettingsClient;
  history: ScopedHistory<unknown>;
  spaces?: SpacesApi;
  inspect: InspectorPublicPluginStart;
  savedObjectsManagement: SavedObjectsManagementPluginStart;
  contentManagement: ContentManagementPublicStart;
}

export type GraphServices = Omit<GraphDependencies, 'element' | 'history'>;

export const renderApp = ({ history, element, ...deps }: GraphDependencies) => {
  const { chrome, capabilities, core } = deps;

  if (!capabilities.graph.save) {
    chrome.setBadge({
      text: i18n.translate('xpack.graph.badge.readOnly.text', {
        defaultMessage: 'Read only',
      }),
      tooltip: i18n.translate('xpack.graph.badge.readOnly.tooltip', {
        defaultMessage: 'Unable to save Graph workspaces',
      }),
      iconType: 'readOnly',
    });
  }

  const licenseSubscription = deps.licensing.license$.subscribe((license) => {
    const info = checkLicense(license);
    const licenseAllowsToShowThisPage = info.showAppLink && info.enableAppLink;

    if (!licenseAllowsToShowThisPage) {
      if (info.message) {
        deps.core.notifications.toasts.addDanger(info.message);
      }

      // This has to happen in the next tick because otherwise the original navigation
      // bringing us to the graph app in the first place
      // never completes and the browser enters are redirect loop
      setTimeout(() => {
        deps.core.application.navigateToApp('home');
      }, 0);
    }
  });

  // dispatch synthetic hash change event to update hash history objects
  // this is necessary because hash updates triggered by using popState won't trigger this event naturally.
  const unlistenParentHistory = history.listen(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  ReactDOM.render(core.rendering.addContext(graphRouter(deps)), element);

  return () => {
    licenseSubscription.unsubscribe();
    unlistenParentHistory();
    ReactDOM.unmountComponentAtNode(element);
  };
};
