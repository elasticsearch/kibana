/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { merge } from 'lodash';
import type { LocationDescriptorObject } from 'history';
import SemVer from 'semver/classes/semver';

import type { HttpSetup } from '@kbn/core/public';
import {
  notificationServiceMock,
  docLinksServiceMock,
  uiSettingsServiceMock,
  themeServiceMock,
  scopedHistoryMock,
  executionContextServiceMock,
  applicationServiceMock,
  fatalErrorsServiceMock,
  httpServiceMock,
  chromeServiceMock,
  i18nServiceMock,
  analyticsServiceMock,
  coreMock,
} from '@kbn/core/public/mocks';

import { GlobalFlyout } from '@kbn/es-ui-shared-plugin/public';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/public/mocks';
import { createKibanaReactContext } from '@kbn/kibana-react-plugin/public';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import { settingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import { EuiThemeProvider } from '@elastic/eui';
import { ReindexService } from '@kbn/reindex-service-plugin/public';
import { MAJOR_VERSION } from '../../../common';
import type { AppDependencies } from '../../../public/application/app_context';
import { AppContextProvider } from '../../../public/application/app_context';
import { httpService } from '../../../public/application/services/http';
import { breadcrumbService } from '../../../public/application/services/breadcrumbs';
import { documentationService } from '../../../public/application/services/documentation';
import { NotificationService } from '../../../public/application/services/notification';
import { ExtensionsService } from '../../../public/services';
import { UiMetricService } from '../../../public/application/services/ui_metric';
import { setUiMetricService } from '../../../public/application/services/api';
import { setExtensionsService } from '../../../public/application/store/selectors/extension_service';
import {
  MappingsEditorProvider,
  ComponentTemplatesProvider,
} from '../../../public/application/components';
import { componentTemplatesMockDependencies } from '../../../public/application/components/component_templates/__jest__';
import { init as initHttpRequests } from './http_requests';

const { GlobalFlyoutProvider } = GlobalFlyout;

export const createServices = () => {
  const notifications = notificationServiceMock.createStartContract();
  const services: AppDependencies['services'] = {
    extensionsService: new ExtensionsService(),
    uiMetricService: new UiMetricService('index_management'),
    notificationService: new NotificationService(notifications.toasts),
    httpService,
  };
  services.uiMetricService.setup(usageCollectionPluginMock.createSetupContract());
  setExtensionsService(services.extensionsService);
  setUiMetricService(services.uiMetricService);
  return services;
};

const createAppDependencies = (httpSetup: HttpSetup): AppDependencies => {
  const services = createServices();

  const history = scopedHistoryMock.create();
  history.createHref.mockImplementation((location: LocationDescriptorObject) => {
    return `${location.pathname}?${location.search}`;
  });

  const applicationService = applicationServiceMock.createStartContract();
  // Required for EisCloudConnectPromoCallout component
  applicationService.capabilities = {
    ...applicationService.capabilities,
    cloudConnect: {
      show: true,
      configure: true,
    },
  };

  return {
    services,
    history,
    url: sharePluginMock.createStartContract().url,
    core: {
      getUrlForApp: applicationService.getUrlForApp,
      executionContext: executionContextServiceMock.createStartContract(),
      http: httpSetup,
      application: applicationService,
      chrome: chromeServiceMock.createStartContract(),
      fatalErrors: fatalErrorsServiceMock.createSetupContract(),
      i18n: i18nServiceMock.createStartContract(),
      theme: themeServiceMock.createStartContract(),
    },
    plugins: {
      usageCollection: usageCollectionPluginMock.createSetupContract(),
      isFleetEnabled: false,
      share: sharePluginMock.createStartContract(),
      cloud: cloudMock.createSetup(),
      reindexService: { reindexService: new ReindexService(httpSetup) },
    },
    // Default stateful configuration
    config: {
      enableLegacyTemplates: true,
      enableIndexActions: true,
      enableIndexStats: true,
      enableSizeAndDocCount: false,
      enableDataStreamStats: true,
      editableIndexSettings: 'all',
      enableMappingsSourceFieldSection: true,
      enableTogglingDataRetention: true,
      enableProjectLevelRetentionChecks: true,
      enableSemanticText: true,
      enforceAdaptiveAllocations: false,
      enableFailureStoreRetentionDisabling: true,
      isServerless: false,
    },
    overlays: coreMock.createStart().overlays,
    privs: {
      monitor: true,
      manageEnrich: true,
      monitorEnrich: true,
      manageIndexTemplates: true,
    },
    setBreadcrumbs: jest.fn(),
    uiSettings: uiSettingsServiceMock.createSetupContract(),
    settings: settingsServiceMock.createStartContract(),
    docLinks: docLinksServiceMock.createStartContract(),
    kibanaVersion,
    canUseSyntheticSource: false,
  };
};

export const kibanaVersion = new SemVer(MAJOR_VERSION);

export const setupEnvironment = () => {
  breadcrumbService.setup(() => undefined);
  documentationService.setup(docLinksServiceMock.createStartContract());

  // Reset httpService singleton to ensure clean state between tests
  // This is critical - if httpService.httpClient is undefined, components will crash
  // We set it to a mock here, and it will be set to the actual httpSetup in WithAppDependencies
  httpService.setup(httpServiceMock.createSetupContract());

  return initHttpRequests();
};

export const WithAppDependencies =
  <P extends object = Record<string, never>>(
    Comp: React.ComponentType<P>,
    httpSetup: HttpSetup,
    overridingDependencies: Record<string, unknown> = {}
  ) =>
  (props: P) => {
    // CRITICAL: Set up httpService BEFORE anything else
    // The component might try to use httpService.httpClient during render
    // and if it's not set up, the component will crash
    httpService.setup(httpSetup);

    const startServicesMock = {
      i18n: i18nServiceMock.createStartContract(),
      theme: themeServiceMock.createStartContract(),
      analytics: analyticsServiceMock.createAnalyticsServiceStart(),
      chrome: chromeServiceMock.createStartContract(),
    };

    const mergedDependencies = merge(
      {},
      createAppDependencies(httpSetup),
      overridingDependencies
    ) as AppDependencies;

    const { Provider: KibanaReactContextProvider } = createKibanaReactContext({
      uiSettings: uiSettingsServiceMock.createSetupContract(),
      settings: settingsServiceMock.createStartContract(),
      theme: themeServiceMock.createStartContract(),
      chrome: chromeServiceMock.createStartContract(),
      application: mergedDependencies.core.application,
      kibanaVersion: {
        get: () => kibanaVersion,
      },
    });

    // httpService.setup() was already called at the start of this function
    // This ensures it's set up before any component tries to use it

    return (
      <KibanaRenderContextProvider {...startServicesMock}>
        <KibanaReactContextProvider>
          <EuiThemeProvider>
            <AppContextProvider value={mergedDependencies}>
              <MappingsEditorProvider>
                <ComponentTemplatesProvider value={componentTemplatesMockDependencies(httpSetup)}>
                  <GlobalFlyoutProvider>
                    <Comp {...props} />
                  </GlobalFlyoutProvider>
                </ComponentTemplatesProvider>
              </MappingsEditorProvider>
            </AppContextProvider>
          </EuiThemeProvider>
        </KibanaReactContextProvider>
      </KibanaRenderContextProvider>
    );
  };
