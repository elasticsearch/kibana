/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useForm, FormProvider, type UseFormReturn } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import type { FormValues } from '../../../form/types';
import { NotificationsStep } from './notifications_step';

const createWrapper = (formRef?: { current: UseFormReturn<FormValues> | null }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
  return ({ children }: { children: React.ReactNode }) => {
    const form = useForm<FormValues>({
      defaultValues: {} as FormValues,
      mode: 'onBlur',
    });
    if (formRef) {
      formRef.current = form;
    }
    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <FormProvider {...form}>{children}</FormProvider>
        </QueryClientProvider>
      </IntlProvider>
    );
  };
};

// The synchronous NotificationsStep render can overrun the 5s default under parallel CI load.
jest.setTimeout(60_000);

describe('NotificationsStep', () => {
  it('shows the template-card picker', async () => {
    render(<NotificationsStep />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('actionTemplateCard-inline-email')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('actionRow-policy-1')).not.toBeInTheDocument();
  });

  describe('notifications field validation', () => {
    it('passes trigger when notifications are empty', async () => {
      const formRef: { current: UseFormReturn<FormValues> | null } = { current: null };
      render(<NotificationsStep />, { wrapper: createWrapper(formRef) });

      await waitFor(() => {
        expect(screen.getByTestId('composeDiscoverNotificationsField')).toBeInTheDocument();
      });

      let valid = false;
      await act(async () => {
        valid = await formRef.current!.trigger('notifications');
      });
      expect(valid).toBe(true);
    });

    it('fails trigger and shows an error for an incomplete existing action', async () => {
      const formRef: { current: UseFormReturn<FormValues> | null } = { current: null };
      render(<NotificationsStep />, { wrapper: createWrapper(formRef) });

      await waitFor(() => {
        expect(screen.getByTestId('composeDiscoverNotificationsField')).toBeInTheDocument();
      });

      await act(async () => {
        formRef.current!.setValue('notifications', {
          workflows: [{ id: 'item-1', source: 'existing', workflowId: null }],
        });
      });

      let valid = true;
      await act(async () => {
        valid = await formRef.current!.trigger('notifications');
      });

      expect(valid).toBe(false);
      await waitFor(() => {
        expect(screen.getByText(/incomplete actions/i)).toBeInTheDocument();
      });
    });
  });
});
