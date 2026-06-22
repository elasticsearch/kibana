/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement, ReactNode } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { of } from 'rxjs';

import type { MatcherFunction, RenderOptions } from '@testing-library/react';
// eslint-disable-next-line import/no-extraneous-dependencies
import { render as reactTestLibRender, configure } from '@testing-library/react';
import { Router } from '@kbn/shared-ux-router';
import { Route } from '@kbn/shared-ux-router';

import { merge } from 'lodash';
import type { History } from 'history';
import { createMemoryHistory } from 'history';
import type { CoreStart } from '@kbn/core/public';
import { I18nProvider } from '@kbn/i18n-react';
import { coreMock } from '@kbn/core/public/mocks';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { KibanaServices } from '@kbn/kibana-react-plugin/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import type { Store } from 'redux';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { stringifyUrlParams } from './url_params/stringify_url_params';
import { mockState } from '../__mocks__/uptime_store.mock';
import { MountWithReduxProvider } from './helper_with_redux';
import type { AppState } from '../../state';
import type { ClientPluginsStart } from '../../../plugin';
import { UptimeRefreshContextProvider, UptimeStartupPluginsContextProvider } from '../../contexts';
import { kibanaService } from '../../state/kibana_service';

type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

interface KibanaProps {
  services?: KibanaServices;
}

export interface KibanaProviderOptions<ExtraCore> {
  core?: DeepPartial<CoreStart> & Partial<ExtraCore>;
  kibanaProps?: KibanaProps;
}

interface MockKibanaProviderProps<ExtraCore> extends KibanaProviderOptions<ExtraCore> {
  children: ReactElement | ReactNode;
}

interface MockRouterProps<ExtraCore> extends MockKibanaProviderProps<ExtraCore> {
  history?: History;
  path?: string;
}

type Url =
  | string
  | {
      path: string;
      queryParams: Record<string, string | number>;
    };

interface RenderRouterOptions<ExtraCore> extends KibanaProviderOptions<ExtraCore> {
  history?: History;
  renderOptions?: Omit<RenderOptions, 'queries'>;
  state?: Partial<AppState> | DeepPartial<AppState>;
  url?: Url;
  path?: string;
}

function getSetting<T = any>(key: string): T {
  return 'MMM D, YYYY @ HH:mm:ss.SSS' as unknown as T;
}

function setSetting$<T = any>(key: string): T {
  return of('MMM D, YYYY @ HH:mm:ss.SSS') as unknown as T;
}

const createMockStore = () => {
  let store: Record<string, any> = {};
  return {
    get: jest.fn().mockImplementation((key) => store[key]),
    set: jest.fn().mockImplementation((key, value) => (store[key] = value)),
    remove: jest.fn().mockImplementation((key: string) => delete store[key]),
    clear: jest.fn().mockImplementation(() => (store = {})),
  };
};

const mockAppUrls: Record<string, string> = {
  uptime: '/app/uptime',
  observability: '/app/observability',
  '/home#/tutorial/uptimeMonitors': '/home#/tutorial/uptimeMonitors',
};

/* default mock core */
export const defaultCore = coreMock.createStart();
export const mockCore: () => Partial<CoreStart> = () => {
  const core: Partial<CoreStart & ClientPluginsStart & { storage: IStorageWrapper }> = {
    ...defaultCore,
    application: {
      ...defaultCore.application,
      getUrlForApp: (app: string) => mockAppUrls[app],
      navigateToUrl: jest.fn(),
      capabilities: {
        ...defaultCore.application.capabilities,
        uptime: {
          'alerting:save': true,
          configureSettings: true,
          save: true,
          show: true,
        },
        actions: {
          save: true,
        },
      },
    },
    uiSettings: {
      ...defaultCore.uiSettings,
      get: getSetting,
      get$: setSetting$,
    },
    settings: {
      client: {
        ...defaultCore.settings.client,
        get: getSetting,
        get$: setSetting$,
      },
      globalClient: defaultCore.settings.globalClient,
      metadata: { getAll: jest.fn().mockResolvedValue({}) },
    },
    usageCollection: {
      reportUiCounter: () => {},
    },
    triggersActionsUi: triggersActionsUiMock.createStart(),
    storage: createMockStore(),
    data: dataPluginMock.createStartContract(),
    // @ts-ignore
    observability: {
      useRulesLink: () => ({ href: 'newRuleLink' }),
      observabilityRuleTypeRegistry: {
        register: jest.fn(),
        getFormatter: jest.fn(),
        list: jest.fn(),
      },
    },
    observabilityShared: {
      navigation: {
        // @ts-ignore
        PageTemplate: KibanaPageTemplate,
      },
    },
    exploratoryView: {
      createExploratoryViewUrl: jest.fn(),
      getAppDataView: jest.fn(),
      ExploratoryViewEmbeddable: () => (
        <div>
          {i18n.translate('xpack.uptime.core.div.embeddableExploratoryViewLabel', {
            defaultMessage: 'Embeddable exploratory view',
          })}
        </div>
      ),
    },
    unifiedSearch: unifiedSearchPluginMock.createStartContract(),
    kql: kqlPluginMock.createStartContract(),
    charts: chartPluginMock.createStartContract(),
  };

  return core;
};

/* Mock Provider Components */
export function MockKibanaProvider<ExtraCore>({
  children,
  core,
  kibanaProps,
}: MockKibanaProviderProps<ExtraCore>) {
  const coreOptions = merge({}, mockCore(), core);

  kibanaService.core = coreOptions as any;

  return (
    <KibanaContextProvider services={{ ...coreOptions }} {...kibanaProps}>
      <UptimeRefreshContextProvider>
        <UptimeStartupPluginsContextProvider
          data={(coreOptions as any).data}
          observability={(coreOptions as any).observability}
          observabilityShared={(coreOptions as any).observabilityShared}
          exploratoryView={(coreOptions as any).exploratoryView}
        >
          <EuiThemeProvider darkMode={false}>
            <I18nProvider>{children}</I18nProvider>
          </EuiThemeProvider>
        </UptimeStartupPluginsContextProvider>
      </UptimeRefreshContextProvider>
    </KibanaContextProvider>
  );
}

export function MockRouter<ExtraCore>({
  children,
  core,
  path,
  history = createMemoryHistory(),
  kibanaProps,
}: MockRouterProps<ExtraCore>) {
  return (
    <Router history={history}>
      <MockKibanaProvider core={core} kibanaProps={kibanaProps}>
        <Route path={path}>{children}</Route>
      </MockKibanaProvider>
    </Router>
  );
}
configure({ testIdAttribute: 'data-test-subj' });

export const MockRedux = ({
  state,
  history = createMemoryHistory(),
  children,
  path,
}: {
  state: Partial<AppState>;
  history?: History;
  children: React.ReactNode;
  path?: string;
  useRealStore?: boolean;
}) => {
  const testState: AppState = {
    ...mockState,
    ...state,
  };

  return (
    <MountWithReduxProvider state={testState}>
      <MockRouter path={path} history={history}>
        {children}
      </MockRouter>
    </MountWithReduxProvider>
  );
};

export function WrappedHelper<ExtraCore>({
  children,
  core,
  kibanaProps,
  state,
  url,
  useRealStore,
  path,
  store,
  history = createMemoryHistory(),
}: RenderRouterOptions<ExtraCore> & {
  children: ReactElement;
  useRealStore?: boolean;
  store?: Store;
}) {
  const testState: AppState = merge({}, mockState, state);

  return (
    <I18nProvider>
      <MountWithReduxProvider state={testState} useRealStore={useRealStore} store={store}>
        <MockRouter path={path} history={history} kibanaProps={kibanaProps} core={core}>
          {children}
        </MockRouter>
      </MountWithReduxProvider>
    </I18nProvider>
  );
}

/* Custom react testing library render */
export function render<ExtraCore>(
  ui: ReactElement,
  {
    history = createMemoryHistory(),
    core,
    kibanaProps,
    renderOptions,
    state,
    url,
    path,
    useRealStore,
    store,
  }: RenderRouterOptions<ExtraCore> & { useRealStore?: boolean; store?: Store } = {}
): any {
  if (url) {
    history = getHistoryFromUrl(url);
  }

  return {
    ...reactTestLibRender(
      <WrappedHelper
        history={history}
        kibanaProps={kibanaProps}
        core={core}
        url={url}
        state={state}
        path={path}
        useRealStore={useRealStore}
        store={store}
      >
        {ui}
      </WrappedHelper>,
      renderOptions
    ),
    history,
  };
}

const getHistoryFromUrl = (url: Url) => {
  if (typeof url === 'string') {
    return createMemoryHistory({
      initialEntries: [url],
    });
  }

  return createMemoryHistory({
    initialEntries: [url.path + stringifyUrlParams(url.queryParams)],
  });
};

const forNearestTag =
  (tag: string) =>
  (getByText: (f: MatcherFunction) => HTMLElement | null) =>
  (text: string): HTMLElement | null =>
    getByText((_content: string, node: Element | null) => {
      if (!node) return false;
      const noOtherButtonHasText = Array.from(node.children).every(
        (child) => child && (child.textContent !== text || child.tagName.toLowerCase() !== tag)
      );
      return (
        noOtherButtonHasText && node.textContent === text && node.tagName.toLowerCase() === tag
      );
    });

// This function allows us to query for the nearest button with test
// no matter whether it has nested tags or not (as EuiButton elements do).
export const forNearestButton = forNearestTag('button');

export const forNearestAnchor = forNearestTag('a');

export const makeUptimePermissionsCore = (
  permissions: Partial<{
    'alerting:save': boolean;
    configureSettings: boolean;
    save: boolean;
    show: boolean;
  }>
) => {
  return {
    application: {
      capabilities: {
        uptime: {
          'alerting:save': true,
          configureSettings: true,
          save: true,
          show: true,
          ...permissions,
        },
      },
    },
  };
};
