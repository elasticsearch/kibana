/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { applicationServiceMock } from '@kbn/core/public/mocks';
import { lensPluginMock } from '@kbn/lens-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { DELAY_MODE } from './form/types';
import type { FormValues } from './form/types';
import { RuleFormProvider, type RuleFormServices, type RuleFormMeta } from './form/contexts';

/**
 * Creates a QueryClient configured for testing (no retries, silent logger).
 */
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
  });

/**
 * Minimal dashboard start contract mock returning an empty find service.
 * Tests that exercise dashboard resolution override `findDashboardsService`.
 */
export const createMockDashboardStart = (): DashboardStart =>
  ({
    findDashboardsService: jest.fn().mockResolvedValue({
      search: jest.fn().mockResolvedValue({ total: 0, dashboards: [] }),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([]),
      findByTitle: jest.fn(),
    }),
  } as unknown as DashboardStart);

/**
 * Creates mock services for testing.
 */
export const createMockServices = (): RuleFormServices => ({
  http: httpServiceMock.createStartContract(),
  data: dataPluginMock.createStartContract(),
  dataViews: dataViewPluginMocks.createStartContract(),
  notifications: notificationServiceMock.createStartContract(),
  application: applicationServiceMock.createStartContract(),
  lens: lensPluginMock.createStartContract(),
  uiActions: uiActionsPluginMock.createStartContract(),
  dashboard: createMockDashboardStart(),
});

/**
 * Creates a wrapper component with QueryClientProvider for testing hooks.
 * Use this for hook tests that only need React Query context.
 */
export const createQueryClientWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/**
 * Default form values for testing.
 */
export const defaultTestFormValues: FormValues = {
  kind: 'alert',
  metadata: {
    name: '',
    enabled: true,
  },
  timeField: '@timestamp',
  schedule: { every: '5m', lookback: '1m' },
  query: { format: 'standalone', breach: { query: '' } },
  stateTransitionAlertDelayMode: DELAY_MODE.immediate,
  stateTransitionRecoveryDelayMode: DELAY_MODE.immediate,
};

/**
 * Creates a wrapper component with QueryClientProvider, FormProvider, and RuleFormProvider
 * for testing components. Use this for component tests that need React Query, react-hook-form,
 * and services context.
 */
export const createFormWrapper = (
  defaultValues: Partial<FormValues> = {},
  services: RuleFormServices = createMockServices(),
  meta: RuleFormMeta = { layout: 'page' }
) => {
  const queryClient = createTestQueryClient();

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const form = useForm<FormValues>({
      defaultValues: {
        ...defaultTestFormValues,
        ...defaultValues,
      },
    });

    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <FormProvider {...form}>
            <RuleFormProvider services={services} meta={meta}>
              {children}
            </RuleFormProvider>
          </FormProvider>
        </QueryClientProvider>
      </IntlProvider>
    );
  };

  return Wrapper;
};
