/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppMountParameters } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { createObservabilityRuleTypeRegistryMock } from '@kbn/observability-plugin/public';
import type { DefaultClientOptions } from '@kbn/server-route-repository-client';
import { createRepositoryClient } from '@kbn/server-route-repository-client';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import { render as testLibRender } from '@testing-library/react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiProvider } from '@elastic/eui';
import type { SLORouteRepository } from '../../server/routes/utils/get_slo_server_route_repository';
import { PluginContext } from '../context/plugin_context';

const appMountParameters = { setHeaderActionMenu: () => {} } as unknown as AppMountParameters;
const observabilityRuleTypeRegistry = createObservabilityRuleTypeRegistryMock();

export const core = coreMock.createStart();
export const data = dataPluginMock.createStartContract();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
  logger: {
    // eslint-disable-next-line no-console
    log: console.log,
    // eslint-disable-next-line no-console
    warn: console.warn,
    error: () => {},
  },
});

const sloClient = createRepositoryClient<SLORouteRepository, DefaultClientOptions>(core);

export const pluginContextDefaultValue = {
  appMountParameters,
  observabilityRuleTypeRegistry,
  ObservabilityPageTemplate: KibanaPageTemplate,
  sloClient,
};

export const render = (component: React.ReactNode) => {
  return testLibRender(
    // @ts-ignore
    <IntlProvider locale="en-US">
      <EuiProvider>
        <KibanaContextProvider
          services={{
            ...core,
            data,
            exploratoryView: {
              createExploratoryViewUrl: jest.fn(),
              getAppDataView: jest.fn(),

              ExploratoryViewEmbeddable: () => (
                <div>
                  {i18n.translate('xpack.slo.render.div.embeddableExploratoryViewLabel', {
                    defaultMessage: 'Embeddable exploratory view',
                  })}
                </div>
              ),
            },
          }}
        >
          <PluginContext.Provider value={pluginContextDefaultValue}>
            <MockAppHeaderProvider>
              <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
            </MockAppHeaderProvider>
          </PluginContext.Provider>
        </KibanaContextProvider>
      </EuiProvider>
    </IntlProvider>
  );
};
