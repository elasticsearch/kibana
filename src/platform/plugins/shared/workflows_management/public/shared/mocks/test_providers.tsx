/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import React, { type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { I18nProviderMock } from '@kbn/core-i18n-browser-mocks/src/i18n_context_mock';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { QueryClient } from '@kbn/react-query';
import { QueryClientProvider } from '@kbn/react-query';
import { WorkflowsContextProvider } from '../../common/context';
import { createMockStore } from '../../entities/workflows/store/__mocks__/store.mock';
import { createStartServicesMock, type StartServicesMock } from '../../mocks';
import { createTestQueryClient } from '../test_utils';

interface TestProviderProps {
  store?: ReturnType<typeof createMockStore>;
  queryClient?: QueryClient;
  services?: StartServicesMock;
  initialEntries?: React.ComponentProps<typeof MemoryRouter>['initialEntries'];
}

export const TestProvider: React.FC<PropsWithChildren<TestProviderProps>> = ({
  children,
  store,
  queryClient,
  services,
  initialEntries,
}) => {
  const testStore = store ?? createMockStore();
  const testQueryClient = queryClient ?? createTestQueryClient();
  const mockServices = services ?? createStartServicesMock();
  return (
    <EuiProvider colorMode="light">
      <KibanaContextProvider services={mockServices}>
        <QueryClientProvider client={testQueryClient}>
          <WorkflowsContextProvider>
            <MemoryRouter initialEntries={initialEntries}>
              <I18nProviderMock>
                <Provider store={testStore}>{children}</Provider>
              </I18nProviderMock>
            </MemoryRouter>
          </WorkflowsContextProvider>
        </QueryClientProvider>
      </KibanaContextProvider>
    </EuiProvider>
  );
};

export const getTestProvider = (params: TestProviderProps): React.FC<PropsWithChildren> => {
  return function WithTestProviders({ children }) {
    return <TestProvider {...params}>{children}</TestProvider>;
  };
};
