/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { merge } from 'lodash';
import type { LocationDescriptorObject } from 'history';

import type { CoreStart, HttpSetup } from '@kbn/core/public';
import { docLinksServiceMock } from '@kbn/core-doc-links-browser-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-browser-mocks';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import {
  notificationServiceMock,
  coreMock,
  scopedHistoryMock,
  httpServiceMock,
} from '@kbn/core/public/mocks';
import { GlobalFlyout } from '@kbn/es-ui-shared-plugin/public';

import { breadcrumbService } from '../../../../../services/breadcrumbs';
import { AppContextProvider, type AppDependencies } from '../../../../../app_context';
import { MappingsEditorProvider } from '../../../../mappings_editor';
import { ComponentTemplatesProvider } from '../../../component_templates_context';

import { init as initHttpRequests } from './http_requests';
import { API_BASE_PATH } from './constants';

const { GlobalFlyoutProvider } = GlobalFlyout;

const history = scopedHistoryMock.create();
history.createHref.mockImplementation((location: LocationDescriptorObject) => {
  return `${location.pathname}?${location.search}`;
});

// We provide the minimum deps required to make the tests pass
const createAppDependencies = (httpSetup?: HttpSetup): AppDependencies => {
  const coreStart = coreMock.createStart();

  return {
    docLinks: docLinksServiceMock.createStartContract(),
    url: sharePluginMock.createStartContract().url,
    plugins: { ml: {} } as unknown as AppDependencies['plugins'],
    config: { isServerless: false } as unknown as AppDependencies['config'],
    core: {
      getUrlForApp: coreStart.application.getUrlForApp,
      executionContext: coreStart.executionContext,
      http: httpSetup ?? httpServiceMock.createSetupContract(),
      application: coreStart.application,
      chrome: coreStart.chrome,
      fatalErrors: coreStart.fatalErrors,
      i18n: coreStart.i18n,
      theme: coreStart.theme,
    },
    history,
    privs: {
      monitor: true,
      manageEnrich: true,
      monitorEnrich: true,
      manageIndexTemplates: true,
    },
  } as unknown as AppDependencies;
};

export const componentTemplatesDependencies = (httpSetup: HttpSetup, coreStart?: CoreStart) => {
  const coreMockStart = coreMock.createStart();
  return {
    overlays: coreStart?.overlays ?? coreMockStart.overlays,
    httpClient: httpSetup,
    apiBasePath: API_BASE_PATH,
    trackMetric: () => {},
    docLinks: docLinksServiceMock.createStartContract(),
    toasts: notificationServiceMock.createSetupContract().toasts,
    getUrlForApp: coreMockStart.application.getUrlForApp,
    executionContext: executionContextServiceMock.createInternalStartContract(),
    startServices: coreStart ?? coreMockStart,
  };
};

export const setupEnvironment = () => {
  breadcrumbService.setup(() => undefined);
  return initHttpRequests();
};

export const WithAppDependencies =
  <P extends object>(
    Comp: React.ComponentType<P>,
    httpSetup: HttpSetup,
    coreStart?: CoreStart,
    appContextMerge?: Record<string, unknown>
  ) =>
  (props: P) => {
    const appDependencies = merge(
      {},
      createAppDependencies(httpSetup),
      appContextMerge
    ) as AppDependencies;
    return (
      <AppContextProvider value={appDependencies}>
        <MappingsEditorProvider>
          <ComponentTemplatesProvider value={componentTemplatesDependencies(httpSetup, coreStart)}>
            <GlobalFlyoutProvider>
              <Comp {...props} />
            </GlobalFlyoutProvider>
          </ComponentTemplatesProvider>
        </MappingsEditorProvider>
      </AppContextProvider>
    );
  };
