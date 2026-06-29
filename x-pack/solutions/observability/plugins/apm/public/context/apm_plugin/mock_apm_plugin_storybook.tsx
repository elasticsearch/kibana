/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CoreStart } from '@kbn/core/public';
import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';
import { createKibanaReactContext } from '@kbn/kibana-react-plugin/public';
import { MlLocatorDefinition } from '@kbn/ml-plugin/public';
import { enableInspectEsQueries } from '@kbn/observability-plugin/common';
import { UI_SETTINGS } from '@kbn/observability-shared-plugin/public/hooks/use_kibana_ui_settings';
import { UrlService } from '@kbn/share-plugin/common/url_service';
import { PerformanceContext } from '@kbn/ebt-tools';
import type { Router } from '@kbn/typed-react-router-config';
import { RouterProvider } from '@kbn/typed-react-router-config';
import { createMemoryHistory } from 'history';
import { merge, noop } from 'lodash';
import type { ReactNode } from 'react';
import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { Observable, of } from 'rxjs';
import { getMockApiCache } from '../../services/rest/call_apm_api_spy';
import type { ITelemetryClient } from '../../services/telemetry/types';
import { createCallApmApi } from '../../services/rest/create_call_apm_api';
import type { APMServiceContextValue } from '../apm_service/apm_service_context';
import { APMServiceContext } from '../apm_service/apm_service_context';
import { MockTimeRangeContextProvider } from '../time_range_metadata/mock_time_range_metadata_context_provider';
import { ApmTimeRangeMetadataContextProvider } from '../time_range_metadata/time_range_metadata_context';
import type { ApmPluginContextValue } from './apm_plugin_context';
import { ApmPluginContext } from './apm_plugin_context';

/**
 * Routes a real HTTP call (pathname + method) to the matching registered
 * mockApmApiCallResponse entry.  Needed because webpack live-binding means
 * the spyObj-based spy never intercepts useFetcher calls in the browser;
 * intercepting at the core.http level is the only reliable hook.
 *
 * Cache keys look like:
 *   "GET /internal/apm/services/{serviceName}/transactions/charts/latency"
 *   "GET /api/apm/services/{serviceName}/annotation/search 2023-10-31"
 *
 * We take parts[1] as the URL template (strips optional trailing version date),
 * convert {param} segments to [^/]+ and test against the actual pathname.
 */
function findMockHandler(httpMethod: string, pathname: string): Function | undefined {
  const cache = getMockApiCache();
  for (const key of Object.keys(cache)) {
    const parts = key.split(' ');
    if (parts[0].toUpperCase() !== httpMethod.toUpperCase()) continue;
    const urlTemplate = parts[1]; // e.g. /internal/apm/services/{serviceName}/...
    const regexStr = '^' + urlTemplate.replace(/\{[^}]+\}/g, '[^/]+') + '$';
    if (new RegExp(regexStr).test(pathname)) return cache[key];
  }
  return undefined;
}

function makeMockHttpMethod(httpMethod: string) {
  return async (pathname: string, options?: Record<string, unknown>) => {
    const handler = findMockHandler(httpMethod, pathname);
    if (handler) {
      return handler({ params: { query: options?.query, body: options?.body } });
    }
    return undefined;
  };
}

const uiSettings: Record<string, unknown> = {
  [UI_SETTINGS.TIMEPICKER_QUICK_RANGES]: [
    {
      from: 'now/d',
      to: 'now/d',
      display: 'Today',
    },
    {
      from: 'now/w',
      to: 'now/w',
      display: 'This week',
    },
  ],
  [UI_SETTINGS.TIMEPICKER_TIME_DEFAULTS]: {
    from: 'now-15m',
    to: 'now',
  },
  [UI_SETTINGS.TIMEPICKER_REFRESH_INTERVAL_DEFAULTS]: {
    pause: false,
    value: 100000,
  },
  [enableInspectEsQueries]: false,
};

const urlService = new UrlService({
  navigate: async () => {},
  getUrl: async ({ app, path }, { absolute }) => {
    return `${absolute ? 'http://localhost:8888' : ''}/app/${app}${path}`;
  },
  shortUrls: () => ({ get: () => {} } as any),
});
const locator = urlService.locators.create(new MlLocatorDefinition());

const mockPlugin = {
  ml: {
    locator,
  },
  alerting: {},
  data: {
    query: {
      timefilter: { timefilter: { setTime: () => {}, getTime: () => ({}) } },
    },
  },
  share: {
    url: {
      locators: {
        get: jest.fn(),
      },
    },
  },
  observability: {
    useRulesLink: () => ({ href: '/app/rules', onClick: jest.fn() }),
  },
};

export const mockCore = {
  application: {
    capabilities: {
      apm: { save: true, 'alerting:show': true, 'alerting:save': true },
      ml: { canGetJobs: true },
      slo: { read: true, write: true },
      savedObjectsManagement: {},
      dashboard_v2: { show: true },
    },
    currentAppId$: new Observable(),
    getUrlForApp: (appId: string) => '',
    navigateToUrl: (url: string) => {},
  },
  chrome: {
    docTitle: { change: () => {} },
    setBreadcrumbs: () => {},
    setHelpExtension: () => {},
    setBadge: () => {},
  },
  docLinks: {
    DOC_LINK_VERSION: '0',
    ELASTIC_WEBSITE_URL: 'https://www.elastic.co/',
    links: {
      apm: {},
      observability: { guide: '' },
      security: { apiKeyServiceSettings: '' },
    },
  },
  http: {
    basePath: {
      prepend: (path: string) => `/basepath${path}`,
      get: () => '/basepath',
    },
    get: makeMockHttpMethod('GET'),
    post: makeMockHttpMethod('POST'),
    put: makeMockHttpMethod('PUT'),
    delete: makeMockHttpMethod('DELETE'),
    patch: makeMockHttpMethod('PATCH'),
    fetch: async () => undefined,
  },
  i18n: {
    Context: ({ children }: { children: ReactNode }) => children,
  },
  notifications: {
    toasts: {
      addWarning: () => {},
      addDanger: () => {},
      add: () => {},
    },
  },
  uiSettings: {
    get: (key: string) => uiSettings[key],
    get$: (key: string) => of(mockCore.uiSettings.get(key)),
  },
  unifiedSearch: {
    autocomplete: {
      hasQuerySuggestions: () => Promise.resolve(false),
      getQuerySuggestions: () => [],
      getValueSuggestions: () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve([]);
          }, 300);
        }),
    },
  },
  data: {
    query: {
      queryString: { getQuery: jest.fn(), setQuery: jest.fn(), clearQuery: jest.fn() },
      timefilter: {
        timefilter: {
          setTime: jest.fn(),
          setRefreshInterval: jest.fn(),
        },
      },
    },
  },
  dataViews: {
    create: jest.fn(),
  },
};

/** Satisfies `useKibana` consumers (e.g. service map) that read `services.telemetry`. */
export const storybookTelemetry: ITelemetryClient = {
  reportSearchQuerySubmitted: () => {},
  reportSloOverviewFlyoutViewed: () => {},
  reportSloOverviewFlyoutSearchQueried: () => {},
  reportSloOverviewFlyoutStatusFiltered: () => {},
  reportSloInfoShown: () => {},
  reportServiceMapDagreLayoutFallback: () => {},
  reportServiceMapAddedToDashboard: () => {},
  reportMetricsCalloutDateRangeSelected: () => {},
  reportMetricsCalloutLoaded: () => {},
};

const mockPerformanceApi = {
  onPageReady: () => {},
  onPageRefreshStart: () => {},
};

const mockUnifiedSearchBar = {
  ui: {
    SearchBar: () => <div />,
  },
};

export const mockApmPluginContext = {
  core: mockCore,
  plugins: mockPlugin,
  unifiedSearch: mockUnifiedSearchBar,
  observabilityAIAssistant: {
    service: { setScreenContext: () => noop },
  },
  share: {
    url: {
      locators: {
        get: jest.fn(),
      },
    },
  },
} as unknown as ApmPluginContextValue;

export function MockApmPluginStorybook({
  children,
  router,
  apmContext = {} as ApmPluginContextValue,
  routePath,
  serviceContextValue = {} as APMServiceContextValue,
}: {
  children?: ReactNode;
  /**
   * The typed router to provide. Callers must pass `apmRouter` (or another router) explicitly:
   * importing `apmRouter` here would eagerly load the full route tree, which breaks per-test
   * `jest.mock()` hoisting in tests that mock modules reachable from the route config.
   */
  router: Router<any>;
  routePath?: string;
  apmContext?: ApmPluginContextValue;
  serviceContextValue?: APMServiceContextValue;
}) {
  const contextMock = merge({}, mockApmPluginContext, apmContext);
  createCallApmApi(contextMock.core);
  const KibanaReactContext = createKibanaReactContext(
    merge({}, contextMock.core, {
      telemetry: storybookTelemetry,
      securityService: {
        authc: {
          getCurrentUser: async () => ({
            username: 'storybook_user',
            roles: ['superuser'],
            enabled: true,
            authentication_realm: { name: 'native', type: 'native' },
            lookup_realm: { name: 'native', type: 'native' },
            authentication_provider: { type: 'basic', name: 'basic' },
          }),
        },
      },
      triggersActionsUi: {
        ruleTypeRegistry: { has: () => false, get: () => null, list: () => [] },
        actionTypeRegistry: { has: () => false, get: () => null, list: () => [] },
      },
    }) as unknown as Partial<CoreStart>
  );

  const history = createMemoryHistory({
    initialEntries: [routePath || '/services/?rangeFrom=now-15m&rangeTo=now'],
  });

  return (
    <IntlProvider locale="en">
      <EuiThemeProvider darkMode={false}>
        <KibanaReactContext.Provider>
          <ApmPluginContext.Provider value={contextMock}>
            <APMServiceContext.Provider value={serviceContextValue}>
              <RouterProvider router={router as any} history={history}>
                <PerformanceContext.Provider value={mockPerformanceApi}>
                  <MockTimeRangeContextProvider>
                    <ApmTimeRangeMetadataContextProvider>
                      {children}
                    </ApmTimeRangeMetadataContextProvider>
                  </MockTimeRangeContextProvider>
                </PerformanceContext.Provider>
              </RouterProvider>
            </APMServiceContext.Provider>
          </ApmPluginContext.Provider>
        </KibanaReactContext.Provider>
      </EuiThemeProvider>
    </IntlProvider>
  );
}
