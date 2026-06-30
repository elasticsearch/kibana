/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { Store } from 'redux';
import { I18nProvider } from '@kbn/i18n-react';
import { type QueryClient, QueryClientProvider } from '@kbn/react-query';
import { createTestQueryClient } from './query_client_wrapper';
import { createMockStore } from '../../entities/workflows/store/__mocks__/store.mock';

interface TestWrapperProps {
  children: React.ReactNode;
  store?: Store;
  queryClient?: QueryClient;
  routerHistory?: React.ComponentProps<typeof MemoryRouter>['initialEntries'];
}

/**
 * A reusable test wrapper component that provides all necessary context providers
 * for testing Kibana components.
 *
 * @param store - The Redux store to use
 * @param queryClient - Optional QueryClient for React Query hooks
 * @param routerHistory - Optional array of routes to simulate browser history
 * @param children - The component(s) to render within the providers
 */
export function TestWrapper({ store, queryClient, routerHistory, children }: TestWrapperProps) {
  const reduxStore = store ?? createMockStore();
  const client = queryClient ?? createTestQueryClient();

  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={routerHistory}>
        <I18nProvider>
          <ReduxProvider store={reduxStore}>{children}</ReduxProvider>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
