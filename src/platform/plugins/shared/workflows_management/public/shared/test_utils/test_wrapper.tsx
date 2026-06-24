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
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { I18nProvider } from '@kbn/i18n-react';
import { type QueryClient, QueryClientProvider } from '@kbn/react-query';
import { createMockStore } from '../../entities/workflows/store/__mocks__/store.mock';

interface TestWrapperProps {
  children: React.ReactNode;
  store?: Store;
  queryClient?: QueryClient;
  routerHistory?: string[];
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
  const content = (
    <MemoryRouter initialEntries={routerHistory}>
      <I18nProvider>
        <ChromeServiceProvider value={{ chrome: chromeServiceMock.createStartContract() }}>
          <ReduxProvider store={reduxStore}>{children}</ReduxProvider>
        </ChromeServiceProvider>
      </I18nProvider>
    </MemoryRouter>
  );

  if (queryClient) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
  }

  return content;
}
