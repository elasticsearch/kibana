/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { AppMountParameters } from '@kbn/core-application-browser';
import type { CoreTheme } from '@kbn/core-theme-browser';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { sloFeatureId } from '@kbn/observability-shared-plugin/common';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { ComponentType } from 'react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { of } from 'rxjs';
import { PluginContext } from '../context/plugin_context';
import { createObservabilityRuleTypeRegistryMock } from '../rules/observability_rule_type_registry_mock';
import type { SLORepositoryClient } from '../types';

export function KibanaReactStorybookDecorator(Story: ComponentType) {
  const queryClient = new QueryClient();

  const appMountParameters = {
    setHeaderActionMenu: () => {},
  } as unknown as AppMountParameters;
  const observabilityRuleTypeRegistry = createObservabilityRuleTypeRegistryMock();

  const mockTheme: CoreTheme = {
    darkMode: false,
    name: 'amsterdam',
  };

  const createTheme$Mock = () => {
    return of({ ...mockTheme });
  };

  return (
    <KibanaContextProvider
      services={{
        application: {
          navigateToUrl: () => {},
          capabilities: {
            [sloFeatureId]: {
              read: true,
              write: true,
            },
          },
        },
        charts: {
          theme: {
            useChartsBaseTheme: () => {},
          },
          activeCursor: () => {},
        },
        data: {},
        dataViews: {
          create: () => Promise.resolve({}),
        },
        docLinks: {
          links: {
            query: {},
            observability: {
              slo: 'https://www.elastic.co/guide',
            },
          },
        },
        inspector: { open: () => {} },
        http: {
          basePath: {
            prepend: (_: string) => '',
          },
        },
        notifications: {
          toasts: {
            addDanger: () => {},
          },
        },
        share: {
          url: { locators: { get: () => {} } },
        },
        storage: {
          get: () => {},
        },
        theme: {
          theme$: createTheme$Mock(),
        },
        triggersActionsUi: { ruleTypeRegistry: {}, actionTypeRegistry: {} },
        uiSettings: {
          get: (setting: string) => {
            if (setting === 'dateFormat') {
              return 'MMM D, YYYY @ HH:mm:ss.SSS';
            }
            if (setting === 'format:percent:defaultPattern') {
              return '0,0.[000]%';
            }
          },
        },
        unifiedSearch: {},
      }}
    >
      <PluginContext.Provider
        value={{
          appMountParameters,
          observabilityRuleTypeRegistry,
          ObservabilityPageTemplate: KibanaPageTemplate,
          sloClient: {} as SLORepositoryClient,
        }}
      >
        <MemoryRouter>
          <MockAppHeaderProvider>
            <QueryClientProvider client={queryClient}>
              <Story />
            </QueryClientProvider>
          </MockAppHeaderProvider>
        </MemoryRouter>
      </PluginContext.Provider>
    </KibanaContextProvider>
  );
}
