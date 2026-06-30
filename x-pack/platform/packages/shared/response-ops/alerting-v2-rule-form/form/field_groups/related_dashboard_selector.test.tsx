/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClientProvider } from '@kbn/react-query';
import { DASHBOARD_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { createMockServices, createTestQueryClient } from '../../test_utils';
import { RuleFormProvider, type RuleFormServices } from '../contexts';
import type { FormValues } from '../types';
import { RelatedDashboardSelector } from './related_dashboard_selector';

const BASE_COMPOSE_VALUES: FormValues = {
  kind: 'alert',
  metadata: { name: 'Test rule', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'standalone', breach: { query: '' } },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
  artifacts: [],
  runbookArtifacts: [],
  dashboardArtifacts: [],
};

const DASHBOARD_ID = 'dashboard-123';
const DASHBOARD_TITLE = 'Dashboard 123';
const MISSING_DASHBOARD_ID = 'missing-dashboard';

const mockSearch = jest.fn(async () => ({
  data: [{ id: DASHBOARD_ID, data: { title: DASHBOARD_TITLE }, meta: {} }],
  meta: { page: 1, per_page: 100, total: 1 },
}));

// Resolves only DASHBOARD_ID; any other id is reported as a not-found (deleted) artifact.
const mockFindByIds = jest.fn(async (ids: string[]) =>
  ids.map((id) =>
    id === DASHBOARD_ID
      ? { id, status: 'success', attributes: { title: DASHBOARD_TITLE } }
      : { id, status: 'error', notFound: true, error: new Error('not found') }
  )
);

const mockFindDashboardsService = jest.fn(async () => ({
  search: mockSearch,
  findById: jest.fn(),
  findByIds: mockFindByIds,
  findByTitle: jest.fn(),
}));

const mockDashboard = {
  findDashboardsService: mockFindDashboardsService,
} as unknown as DashboardStart;

const ArtifactValueSpy = () => {
  const { watch } = useFormContext<FormValues>();
  return (
    <div data-test-subj="artifactValueSpy">{JSON.stringify(watch('dashboardArtifacts') ?? [])}</div>
  );
};

const createComposeFormWrapper = (
  defaultValues: FormValues = BASE_COMPOSE_VALUES,
  services: RuleFormServices = { ...createMockServices(), dashboard: mockDashboard }
) => {
  const queryClient = createTestQueryClient();

  return ({ children }: { children: React.ReactNode }) => {
    const form = useForm<FormValues>({ defaultValues });
    return (
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>
          <FormProvider {...form}>
            <RuleFormProvider services={services} meta={{ layout: 'flyout' }}>
              {children}
            </RuleFormProvider>
          </FormProvider>
        </QueryClientProvider>
      </IntlProvider>
    );
  };
};

describe('RelatedDashboardSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the related dashboards selector', () => {
    render(<RelatedDashboardSelector />, { wrapper: createComposeFormWrapper() });

    expect(screen.getByText('Related dashboards')).toBeTruthy();
    expect(screen.getByPlaceholderText('Link related dashboards for investigation')).toBeTruthy();
  });

  it('writes selected dashboards to artifacts', async () => {
    render(
      <>
        <RelatedDashboardSelector />
        <ArtifactValueSpy />
      </>,
      { wrapper: createComposeFormWrapper() }
    );

    const searchInput = screen.getByPlaceholderText('Link related dashboards for investigation');
    fireEvent.focus(searchInput);

    await waitFor(() => {
      expect(screen.getByText(DASHBOARD_TITLE)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('option', { name: DASHBOARD_TITLE }));

    await waitFor(() => {
      expect(screen.getByTestId('artifactValueSpy').textContent).toContain(DASHBOARD_ARTIFACT_TYPE);
      expect(screen.getByTestId('artifactValueSpy').textContent).toContain(DASHBOARD_ID);
    });
  });

  it('debounces dashboard searches after the initial load', async () => {
    render(<RelatedDashboardSelector />, { wrapper: createComposeFormWrapper() });

    const searchInput = screen.getByPlaceholderText('Link related dashboards for investigation');
    fireEvent.focus(searchInput);

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledTimes(1);
    });

    mockSearch.mockClear();
    await userEvent.type(searchInput, 'error');

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalled();
      expect(mockSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'error', per_page: 100 })
      );
    });
  });

  it('removes dashboard artifacts when the selection is cleared', async () => {
    render(
      <>
        <RelatedDashboardSelector />
        <ArtifactValueSpy />
      </>,
      {
        wrapper: createComposeFormWrapper({
          ...BASE_COMPOSE_VALUES,
          dashboardArtifacts: [
            { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: DASHBOARD_ID },
          ],
        }),
      }
    );

    await waitFor(() => {
      expect(screen.getByText(DASHBOARD_TITLE)).toBeTruthy();
    });

    const selectedOption = screen.getByText(DASHBOARD_TITLE);
    await userEvent.type(selectedOption, '{backspace}');

    await waitFor(() => {
      expect(screen.getByTestId('artifactValueSpy').textContent).toContain('[]');
    });
  });

  it('keeps unresolved dashboard artifacts and surfaces them as a deleted/missing state', async () => {
    render(
      <>
        <RelatedDashboardSelector />
        <ArtifactValueSpy />
      </>,
      {
        wrapper: createComposeFormWrapper({
          ...BASE_COMPOSE_VALUES,
          dashboardArtifacts: [
            { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: DASHBOARD_ID },
            {
              id: 'missing-dashboard-id',
              type: DASHBOARD_ARTIFACT_TYPE,
              value: MISSING_DASHBOARD_ID,
            },
          ],
        }),
      }
    );

    // Healthy dashboard resolves and shows in the combo box.
    await waitFor(() => {
      expect(screen.getByText(DASHBOARD_TITLE)).toBeTruthy();
    });

    // The unresolved dashboard is surfaced with an explicit deleted treatment...
    expect(await screen.findByTestId('missingDashboardsCallout')).toBeTruthy();
    expect(screen.getByText('Dashboard deleted')).toBeTruthy();

    // ...and is NOT silently pruned from form state.
    expect(screen.getByTestId('artifactValueSpy').textContent).toContain(MISSING_DASHBOARD_ID);
    expect(screen.getByTestId('artifactValueSpy').textContent).toContain(DASHBOARD_ID);
  });

  it('removes a missing dashboard artifact when its remove button is clicked', async () => {
    render(
      <>
        <RelatedDashboardSelector />
        <ArtifactValueSpy />
      </>,
      {
        wrapper: createComposeFormWrapper({
          ...BASE_COMPOSE_VALUES,
          dashboardArtifacts: [
            { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: DASHBOARD_ID },
            {
              id: 'missing-dashboard-id',
              type: DASHBOARD_ARTIFACT_TYPE,
              value: MISSING_DASHBOARD_ID,
            },
          ],
        }),
      }
    );

    const removeButton = await screen.findByTestId(
      `removeMissingDashboardButton-${MISSING_DASHBOARD_ID}`
    );
    await userEvent.click(removeButton);

    await waitFor(() => {
      const artifacts = screen.getByTestId('artifactValueSpy').textContent ?? '';
      expect(artifacts).not.toContain(MISSING_DASHBOARD_ID);
      expect(artifacts).toContain(DASHBOARD_ID);
    });
  });

  it('does not render when the dashboard contract is unavailable', () => {
    render(<RelatedDashboardSelector />, {
      wrapper: createComposeFormWrapper(BASE_COMPOSE_VALUES, {
        ...createMockServices(),
        dashboard: undefined,
      }),
    });

    expect(screen.queryByText('Related dashboards')).toBeNull();
  });
});
