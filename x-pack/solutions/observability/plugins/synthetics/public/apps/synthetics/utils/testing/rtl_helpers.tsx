/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement, ReactNode } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { BehaviorSubject, of } from 'rxjs';

import type { MatcherFunction, RenderOptions } from '@testing-library/react';
// eslint-disable-next-line import/no-extraneous-dependencies
import { render as reactTestLibRender, configure } from '@testing-library/react';
import { Router } from '@kbn/shared-ux-router';
import { Route } from '@kbn/shared-ux-router';

import { merge, mergeWith } from 'lodash';
import type { History } from 'history';
import { createMemoryHistory } from 'history';
import type { CoreStart } from '@kbn/core/public';
import { I18nProvider } from '@kbn/i18n-react';
import { coreMock } from '@kbn/core/public/mocks';
import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { KibanaServices } from '@kbn/kibana-react-plugin/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { triggersActionsUiMock } from '@kbn/triggers-actions-ui-plugin/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import type { ChromeStyle } from '@kbn/core-chrome-browser';
import { mockState } from './__mocks__/synthetics_store.mock';
import { MountWithReduxProvider } from './helper_with_redux';
import type { AppState } from '../../state';
import { stringifyUrlParams } from '../url_params';
import type { ClientPluginsStart } from '../../../../plugin';
import { SyntheticsRefreshContextProvider } from '../../contexts';
import { kibanaService } from '../../../../utils/kibana_service';

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
  synthetics: '/app/synthetics',
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
    charts: chartPluginMock.createStartContract(),
    exploratoryView: {
      createExploratoryViewUrl: jest.fn(),
      getAppDataView: jest.fn(),
      ExploratoryViewEmbeddable: () => (
        <div>
          {i18n.translate('xpack.synthetics.core.div.embeddableExploratoryViewLabel', {
            defaultMessage: 'Embeddable exploratory view',
          })}
        </div>
      ),
    },
    chrome: {
      ...defaultCore.chrome,
      getChromeStyle$: () => new BehaviorSubject<ChromeStyle>('classic').asObservable(),
    },
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

  kibanaService.coreStart = coreOptions as any;

  return (
    <KibanaContextProvider services={{ ...coreOptions }} {...kibanaProps}>
      <SyntheticsRefreshContextProvider>
        <EuiThemeProvider darkMode={false}>
          <I18nProvider>{children}</I18nProvider>
        </EuiThemeProvider>
      </SyntheticsRefreshContextProvider>
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
  history = createMemoryHistory(),
}: React.PropsWithChildren<RenderRouterOptions<ExtraCore> & { useRealStore?: boolean }>) {
  const testState: AppState = mergeWith({}, mockState, state, (objValue, srcValue) => {
    if (Array.isArray(objValue)) {
      return srcValue;
    }
  });

  if (url) {
    history = getHistoryFromUrl(url);
  }

  return (
    <MountWithReduxProvider state={testState} useRealStore={useRealStore}>
      <MockRouter path={path} history={history} kibanaProps={kibanaProps} core={core}>
        {children}
      </MockRouter>
    </MountWithReduxProvider>
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
  }: RenderRouterOptions<ExtraCore> & { useRealStore?: boolean } = {}
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

export const makeSyntheticsPermissionsCore = (
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

const wrappedInClass = (element: HTMLElement | Element, classWrapper: string): boolean => {
  if (element.className.includes(classWrapper)) return true;
  if (element.parentElement) return wrappedInClass(element.parentElement, classWrapper);
  return false;
};

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
