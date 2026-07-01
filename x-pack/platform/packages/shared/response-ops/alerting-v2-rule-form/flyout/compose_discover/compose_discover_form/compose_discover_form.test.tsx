/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DASHBOARD_ARTIFACT_TYPE, RUNBOOK_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClientProvider } from '@kbn/react-query';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { FormProvider, useForm } from 'react-hook-form';
import { ComposeDiscoverForm, getSteps } from '.';
import { RuleFormProvider, type RuleFormServices } from '../../../form/contexts';
import { createMockServices, createTestQueryClient } from '../../../test_utils';
import type { FormValues } from '../../../form/types';
import type { ComposeDiscoverState } from '../types';
import { createInitialState } from '../use_compose_discover_state';

jest.mock('./alert_condition_step', () => ({
  AlertConditionStep: () => <div data-test-subj="mockAlertConditionStep" />,
}));

jest.mock('../compose_discover_time_field_context', () => ({
  useComposeDiscoverTimeField: () => ({
    timeFieldOptions: [{ value: '@timestamp', text: '@timestamp' }],
    isTimeFieldResolved: true,
  }),
  ComposeDiscoverTimeFieldContextProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const createState = (overrides: Partial<ComposeDiscoverState> = {}): ComposeDiscoverState => ({
  ...createInitialState({ mode: 'create' }),
  ...overrides,
});

const BASE_COMPOSE_VALUES: FormValues = {
  kind: 'alert',
  metadata: { name: 'Test rule', enabled: true },
  timeField: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'composed', base: '', breach: { segment: '' } },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
  artifacts: [],
  runbookArtifacts: [],
  dashboardArtifacts: [],
};

const DASHBOARD_ID = 'dashboard-123';
const DASHBOARD_TITLE = 'Dashboard 123';

const mockFindByIds = jest.fn(async (ids: string[]) =>
  ids.map((id) =>
    id === DASHBOARD_ID
      ? { id, status: 'success', attributes: { title: DASHBOARD_TITLE } }
      : { id, status: 'error', notFound: true, error: new Error('not found') }
  )
);

const mockFindDashboardsService = jest.fn(async () => ({
  search: jest.fn(async () => ({ total: 0, dashboards: [] })),
  findById: jest.fn(),
  findByIds: mockFindByIds,
  findByTitle: jest.fn(),
}));

const mockDashboard = {
  findDashboardsService: mockFindDashboardsService,
} as unknown as DashboardStart;

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

const renderComposeDiscoverDetailsStep = (defaultValues: FormValues = BASE_COMPOSE_VALUES) =>
  render(
    <ComposeDiscoverForm
      state={createState({ step: 2 })}
      dispatch={jest.fn()}
      services={{ ...createMockServices(), dashboard: mockDashboard }}
      onRecoveryTypeChange={jest.fn()}
      onKindChange={jest.fn()}
      isEditing={false}
    />,
    { wrapper: createComposeFormWrapper(defaultValues) }
  );

describe('step validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('alertCondition.validate', () => {
    const alertStep = getSteps(false).steps.find((s) => s.id === 'alertCondition')!;

    it('returns true when queryCommitted and composed alert query is complete', async () => {
      const state = createState({ queryCommitted: true });
      const methods = {
        getValues: (field?: keyof FormValues) => {
          if (field === 'kind') return 'alert';
          if (field === 'query') {
            return {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: '| WHERE status == "error"' },
            };
          }
          return undefined;
        },
      } as unknown as UseFormReturn<FormValues>;

      expect(await alertStep.validate!(methods, state)).toBe(true);
    });

    it('returns false for a base-only alert persisted as a standalone query (no_where)', async () => {
      const state = createState({ queryCommitted: true });
      const methods = {
        getValues: (field?: keyof FormValues) => {
          if (field === 'kind') return 'alert';
          if (field === 'query') {
            return { format: 'standalone', breach: { query: 'FROM logs-*' } };
          }
          return undefined;
        },
      } as unknown as UseFormReturn<FormValues>;

      // Per #621/#623 an alert without an alert condition cannot advance.
      expect(await alertStep.validate!(methods, state)).toBe(false);
    });

    it('returns false for a composed alert with base but no breach segment in edit mode', async () => {
      const state = createState({ queryCommitted: true, mode: 'edit' });
      const methods = {
        getValues: (field?: keyof FormValues) => {
          if (field === 'kind') return 'alert';
          if (field === 'query') {
            return {
              format: 'composed',
              base: 'FROM logs-*',
              breach: { segment: '' },
            };
          }
          return undefined;
        },
      } as unknown as UseFormReturn<FormValues>;

      expect(await alertStep.validate!(methods, state)).toBe(false);
    });

    it('returns true for a signal rule with a non-empty standalone query', async () => {
      const state = createState({ queryCommitted: true });
      const methods = {
        getValues: (field?: keyof FormValues) => {
          if (field === 'kind') return 'signal';
          if (field === 'query') {
            return { format: 'standalone', breach: { query: 'FROM logs-*' } };
          }
          return undefined;
        },
      } as unknown as UseFormReturn<FormValues>;

      expect(await alertStep.validate!(methods, state)).toBe(true);
    });

    it('returns false when the composed alert query has no base (empty query)', async () => {
      const state = createState({ queryCommitted: true });
      const methods = {
        getValues: (field?: keyof FormValues) => {
          if (field === 'kind') return 'alert';
          if (field === 'query') {
            return { format: 'composed', base: '', breach: { segment: '' } };
          }
          return undefined;
        },
      } as unknown as UseFormReturn<FormValues>;

      expect(await alertStep.validate!(methods, state)).toBe(false);
    });

    it('returns false when queryCommitted is false', async () => {
      const state = createState({ queryCommitted: false });
      const methods = {} as UseFormReturn<FormValues>;

      expect(await alertStep.validate!(methods, state)).toBe(false);
    });
  });

  describe('details.validate', () => {
    const detailsStep = getSteps(false).steps.find((s) => s.id === 'details')!;

    it('delegates to methods.trigger with metadata.name', async () => {
      const state = createState();
      const methods = {
        trigger: jest.fn().mockResolvedValue(true),
      } as unknown as UseFormReturn<FormValues>;

      const result = await detailsStep.validate!(methods, state);

      expect(methods.trigger).toHaveBeenCalledWith(['metadata.name']);
      expect(result).toBe(true);
    });

    it('returns false when trigger rejects validation', async () => {
      const state = createState();
      const methods = {
        trigger: jest.fn().mockResolvedValue(false),
      } as unknown as UseFormReturn<FormValues>;

      const result = await detailsStep.validate!(methods, state);

      expect(result).toBe(false);
    });
  });

  describe('details.render', () => {
    it('renders runbook and related dashboard artifact fields', () => {
      renderComposeDiscoverDetailsStep();

      expect(screen.getByText('Artifacts')).toBeTruthy();
      expect(screen.getByText('Runbook')).toBeTruthy();
      expect(screen.getByTestId('addRunbookButton')).toBeTruthy();
      expect(screen.getByText('Related dashboards')).toBeTruthy();
      expect(screen.getByPlaceholderText('Link related dashboards for investigation')).toBeTruthy();
    });

    it('renders existing runbook and related dashboard artifacts', async () => {
      renderComposeDiscoverDetailsStep({
        ...BASE_COMPOSE_VALUES,
        runbookArtifacts: [
          {
            id: 'runbook-id',
            type: RUNBOOK_ARTIFACT_TYPE,
            value: 'Investigate failed transactions\nCheck service logs',
          },
        ],
        dashboardArtifacts: [
          { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: DASHBOARD_ID },
        ],
      });

      expect(screen.getByText('Investigate failed transactions')).toBeTruthy();
      expect(screen.getByLabelText('Edit Runbook')).toBeTruthy();
      expect(screen.getByLabelText('Delete Runbook')).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByText(DASHBOARD_TITLE)).toBeTruthy();
      });
      expect(mockFindByIds).toHaveBeenCalledWith([DASHBOARD_ID]);
    });
  });

  describe('step registry', () => {
    it('recoveryCondition has no validate function', () => {
      const recoveryStep = getSteps(true).steps.find((s) => s.id === 'recoveryCondition')!;
      expect(recoveryStep.validate).toBeUndefined();
    });
  });

  describe('notifications.validate', () => {
    const notificationsStep = getSteps(true).steps.find((s) => s.id === 'notifications')!;

    it('returns true when notifications are disabled', async () => {
      const state = createState({ mode: 'create' });
      const methods = {
        getValues: jest.fn().mockReturnValue(undefined),
      } as unknown as UseFormReturn<FormValues>;
      expect(await notificationsStep.validate!(methods, state)).toBe(true);
    });

    it('returns false when an existing-workflow action has no workflowId', async () => {
      const state = createState({ mode: 'create' });
      const methods = {
        getValues: jest.fn().mockReturnValue({
          workflows: [{ id: 'item-1', source: 'existing', workflowId: null }],
        }),
      } as unknown as UseFormReturn<FormValues>;
      expect(await notificationsStep.validate!(methods, state)).toBe(false);
    });

    it('returns true for a complete existing-workflow action', async () => {
      const state = createState({ mode: 'create' });
      const methods = {
        getValues: jest.fn().mockReturnValue({
          workflows: [{ id: 'item-1', source: 'existing', workflowId: 'wf-1' }],
        }),
      } as unknown as UseFormReturn<FormValues>;
      expect(await notificationsStep.validate!(methods, state)).toBe(true);
    });

    it('returns false for an inline action with no connector', async () => {
      const state = createState({ mode: 'create' });
      const methods = {
        getValues: jest.fn().mockReturnValue({
          workflows: [
            {
              id: 'item-1',
              source: 'inline',
              stepType: 'email',
              connectorId: null,
              params: '',
            },
          ],
        }),
      } as unknown as UseFormReturn<FormValues>;
      expect(await notificationsStep.validate!(methods, state)).toBe(false);
    });

    it('returns true when notifications.workflows is empty', async () => {
      const state = createState({ mode: 'create' });
      const methods = {
        getValues: jest.fn().mockReturnValue({ workflows: [] }),
      } as unknown as UseFormReturn<FormValues>;
      expect(await notificationsStep.validate!(methods, state)).toBe(true);
    });
  });

  it('includes the correct steps based on isAlert', () => {
    expect(getSteps(false).steps.map((step) => step.id)).toEqual(['alertCondition', 'details']);
    expect(getSteps(true).steps.map((step) => step.id)).toEqual([
      'alertCondition',
      'recoveryCondition',
      'details',
      'notifications',
    ]);
  });
});

describe('shell shared fields', () => {
  const renderShell = (
    stateOverrides: Partial<ComposeDiscoverState> = {},
    formOverrides: Partial<FormValues> = {}
  ) => {
    const services = { ...createMockServices(), dashboard: mockDashboard };
    return render(
      <ComposeDiscoverForm
        state={createState({ queryCommitted: true, ...stateOverrides })}
        dispatch={jest.fn()}
        services={services}
        onRecoveryTypeChange={jest.fn()}
        onKindChange={jest.fn()}
        isEditing={false}
      />,
      { wrapper: createComposeFormWrapper({ ...BASE_COMPOSE_VALUES, ...formOverrides }, services) }
    );
  };

  it('renders ModeSelect, AlertDelayField, ScheduleField, and LookbackWindowField on alert condition step', () => {
    renderShell({ step: 0 }, { kind: 'alert' });

    expect(screen.getByTestId('composeDiscoverModeSelect')).toBeInTheDocument();
    expect(screen.getByTestId('alertDelayFormRow')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Lookback Window')).toBeInTheDocument();
  });

  it('does not render AlertDelayField when kind is signal', () => {
    renderShell(
      { step: 0 },
      { kind: 'signal', query: { format: 'standalone', breach: { query: 'FROM logs-*' } } }
    );

    expect(screen.getByTestId('composeDiscoverModeSelect')).toBeInTheDocument();
    expect(screen.queryByTestId('alertDelayFormRow')).not.toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Lookback Window')).toBeInTheDocument();
  });

  it('does not render shared fields on non-alert-condition steps', () => {
    // step 2 = 'details' when isAlert=true (alertCondition -> recoveryCondition -> details)
    renderShell({ step: 2 });

    expect(screen.queryByTestId('composeDiscoverModeSelect')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alertDelayFormRow')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Lookback Window')).not.toBeInTheDocument();
  });

  it('disables ModeSelect when query is not committed', () => {
    renderShell({ step: 0, queryCommitted: false });

    expect(screen.getByTestId('composeDiscoverModeSelect')).toBeDisabled();
  });

  it('disables ModeSelect in edit mode', () => {
    const services = { ...createMockServices(), dashboard: mockDashboard };
    render(
      <ComposeDiscoverForm
        state={createState({ queryCommitted: true, step: 0 })}
        dispatch={jest.fn()}
        services={services}
        onRecoveryTypeChange={jest.fn()}
        onKindChange={jest.fn()}
        isEditing={true}
      />,
      { wrapper: createComposeFormWrapper({ ...BASE_COMPOSE_VALUES }, services) }
    );

    expect(screen.getByTestId('composeDiscoverModeSelect')).toBeDisabled();
  });

  it('enables ModeSelect in create mode when query is committed and sandbox is closed', () => {
    renderShell({ step: 0, queryCommitted: true, childOpen: false });

    expect(screen.getByTestId('composeDiscoverModeSelect')).not.toBeDisabled();
  });

  it('disables ModeSelect when sandbox is open', () => {
    renderShell({ step: 0, queryCommitted: true, childOpen: true });

    expect(screen.getByTestId('composeDiscoverModeSelect')).toBeDisabled();
  });
});
