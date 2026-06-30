/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { useAlertsLocalStorage } from './alerts_local_storage';
import type { Status } from '../../../../../common/api/detection_engine';
import { TestProviders } from '../../../../common/mock';
import { ChartPanels } from '.';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { LensEmbeddable } from '../../../../common/components/visualization_actions/lens_embeddable';
import { createResetGroupByFieldAction } from '../alerts_histogram_panel/helpers';

jest.mock('./alerts_local_storage');

jest.mock('../../../../common/components/visualization_actions/lens_embeddable');
jest.mock('../../../../common/components/page/use_refetch_by_session', () => ({
  useRefetchByRestartingSession: jest.fn().mockReturnValue({
    session: {
      current: {
        start: jest.fn(),
      },
    },
    searchSessionId: 'mockSearchSessionId',
    refetchByRestartingSession: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => {
  const originalModule = jest.requireActual('react-router-dom');

  return {
    ...originalModule,
    useParams: jest.fn(),
    useHistory: jest.fn(),
    useLocation: () => ({ pathname: '' }),
  };
});

jest.mock('../../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../../common/lib/kibana');

  return {
    ...original,
    useUiSetting$: () => ['0,0.[000]'],
    useKibana: () => ({
      services: {
        application: {
          navigateToUrl: jest.fn(),
        },
        storage: {
          get: jest.fn(),
          set: jest.fn(),
        },
      },
    }),
  };
});

const mockSetToggle = jest.fn();
const mockUseQueryToggle = useQueryToggle as jest.Mock;
jest.mock('../../../../common/containers/query_toggle');

const defaultAlertSettings = {
  alertViewSelection: 'trend',
  countTableStackBy0: 'kibana.alert.rule.name',
  countTableStackBy1: 'host.name',
  isTreemapPanelExpanded: true,
  groupBySelection: 'host.name',
  riskChartStackBy0: 'kibana.alert.rule.name',
  riskChartStackBy1: 'host.name',
  setAlertViewSelection: jest.fn(),
  setCountTableStackBy0: jest.fn(),
  setCountTableStackBy1: jest.fn(),
  setGroupBySelection: jest.fn(),
  setIsTreemapPanelExpanded: jest.fn(),
  setRiskChartStackBy0: jest.fn(),
  setRiskChartStackBy1: jest.fn(),
  setTrendChartStackBy: jest.fn(),
  trendChartStackBy: 'kibana.alert.rule.name',
};

const defaultProps = {
  addFilter: jest.fn(),
  alertsDefaultFilters: [
    {
      meta: {
        alias: null,
        negate: true,
        disabled: false,
        type: 'exists',
        key: 'kibana.alert.building_block_type',
        value: 'exists',
      },
      query: {
        exists: {
          field: 'kibana.alert.building_block_type',
        },
      },
    },
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
        type: 'phrase',
        key: 'kibana.alert.workflow_status',
        params: {
          query: 'open',
        },
      },
      query: {
        term: {
          'kibana.alert.workflow_status': 'open',
        },
      },
    },
  ],
  filterGroup: 'open' as Status,
  isLoadingIndexPattern: false,
  query: {
    query: '',
    language: 'kuery',
  },
  runtimeMappings: {},
  signalIndexName: '.alerts-security.alerts-default',
  showBuildingBlockAlerts: false,
  showOnlyThreatIndicatorAlerts: false,
  updateDateRangeCallback: jest.fn(),
};

const resetGroupByFields = () => {
  const menuButton = screen.getByTestId('chart-settings-popover-button');
  fireEvent.click(menuButton);

  const resetMenuItem = screen.getByTestId('reset-group-by');
  fireEvent.click(resetMenuItem);
};

describe('ChartPanels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: mockSetToggle });

    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
    });
  });

  test('when toggle is true, renders the chart selector tabs', async () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: mockSetToggle });
    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chart-select-tabs')).toBeInTheDocument();
    });
  });

  test('when toggle is false, renders the chart collapse', async () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: mockSetToggle });
    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chart-collapse')).toBeInTheDocument();
    });
  });

  test('it renders the trend loading spinner when data is loading and `alertViewSelection` is trend', async () => {
    render(
      <TestProviders>
        <ChartPanels {...defaultProps} isLoadingIndexPattern={true} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('trendLoadingSpinner')).toBeInTheDocument();
    });
  });

  test('it renders the alert histogram panel when `alertViewSelection` is trend', async () => {
    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('alerts-histogram-panel')).toBeInTheDocument();
    });
  });

  describe(`'Reset group by fields' context menu action`, () => {
    describe('Group by', () => {
      test(`it resets the 'Group by' field to the default value, even if the user has triggered validation errors, when 'alertViewSelection' is 'treemap'`, async () => {
        (useAlertsLocalStorage as jest.Mock).mockReturnValue({
          ...defaultAlertSettings,
          alertViewSelection: 'treemap',
        });

        const defaultValue = 'kibana.alert.rule.name';
        const invalidValue = 'an invalid value';

        render(
          <TestProviders>
            <ChartPanels {...defaultProps} />
          </TestProviders>
        );

        const initialInput = screen.getAllByTestId('comboBoxSearchInput')[0];
        expect(initialInput).toHaveValue(defaultValue);

        // update the EuiComboBox input to an invalid value:
        fireEvent.change(initialInput, { target: { value: invalidValue } });

        const afterInvalidInput = screen.getAllByTestId('comboBoxSearchInput')[0];
        expect(afterInvalidInput).toHaveValue(invalidValue); // the 'Group by' EuiComboBox is now in the "error state"
        expect(afterInvalidInput).toBeInvalid();

        resetGroupByFields(); // invoke the `Reset group by fields` context menu action

        await waitFor(() => {
          const afterReset = screen.getAllByTestId('comboBoxSearchInput')[0];
          expect(afterReset).toHaveValue(defaultValue); // back to the default
        });
      });

      describe.each([['trend'], ['table']])(`when 'alertViewSelection' is '%s'`, (view) => {
        test(`it has resets the 'Group by' field as an extra action`, async () => {
          (useAlertsLocalStorage as jest.Mock).mockReturnValue({
            ...defaultAlertSettings,
            alertViewSelection: view,
          });

          const mockResetGroupByFieldsAction = [
            createResetGroupByFieldAction({ callback: jest.fn(), order: 5 }),
          ];

          const testProps = {
            ...defaultProps,
            extraActions: mockResetGroupByFieldsAction,
          };

          render(
            <TestProviders>
              <ChartPanels {...testProps} />
            </TestProviders>
          );

          await waitFor(() => {
            expect(
              (LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].extraActions.length
            ).toEqual(1);
            expect(
              (LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].extraActions[0].id
            ).toEqual('resetGroupByField');
          });
        });
      });

      describe.each([
        ['trend', 'kibana.alert.rule.name'],
        ['table', 'kibana.alert.rule.name'],
      ])(`when 'alertViewSelection' is '%s'`, (view, defaultGroupBy) => {
        test(`it has resets the 'Group by' field as an extra action, with default value ${defaultGroupBy}`, async () => {
          (useAlertsLocalStorage as jest.Mock).mockReturnValue({
            ...defaultAlertSettings,
            alertViewSelection: view,
          });

          const mockResetGroupByFieldsAction = [
            createResetGroupByFieldAction({ callback: jest.fn(), order: 5 }),
          ];

          const testProps = {
            ...defaultProps,
            extraActions: mockResetGroupByFieldsAction,
          };

          render(
            <TestProviders>
              <ChartPanels {...testProps} />
            </TestProviders>
          );

          await waitFor(() => {
            expect(
              (LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].extraActions.length
            ).toEqual(1);
            expect(
              (LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].extraActions[0].id
            ).toEqual('resetGroupByField');
            expect((LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].stackByField).toEqual(
              defaultGroupBy
            );
          });
        });
      });
    });

    describe('Group by top', () => {
      test(`it resets the 'Group by top' field to the default value, even if the user has triggered validation errors, when 'alertViewSelection' is 'treemap'`, async () => {
        (useAlertsLocalStorage as jest.Mock).mockReturnValue({
          ...defaultAlertSettings,
          alertViewSelection: 'treemap',
        });

        const defaultValue = 'host.name';
        const invalidValue = 'an-invalid-value';

        render(
          <TestProviders>
            <ChartPanels {...defaultProps} />
          </TestProviders>
        );

        const initialInput = screen.getAllByTestId('comboBoxSearchInput')[1];
        expect(initialInput).toHaveValue(defaultValue);

        // update the EuiComboBox input to an invalid value:
        fireEvent.change(initialInput, { target: { value: invalidValue } });

        const afterInvalidInput = screen.getAllByTestId('comboBoxSearchInput')[1];
        expect(afterInvalidInput).toHaveValue(invalidValue); // the 'Group by top' EuiComboBox is now in the "error state"
        expect(afterInvalidInput).toBeInvalid();

        resetGroupByFields(); // invoke the `Reset group by fields` context menu action

        await waitFor(() => {
          const afterReset = screen.getAllByTestId('comboBoxSearchInput')[1];
          expect(afterReset).toHaveValue(defaultValue); // back to the default
        });
      });

      test(`it renders the 'Group by top' field to the default value, when 'alertViewSelection' is 'table'`, async () => {
        (useAlertsLocalStorage as jest.Mock).mockReturnValue({
          ...defaultAlertSettings,
          alertViewSelection: 'table',
        });

        const defaultValue = 'host.name';

        render(
          <TestProviders>
            <ChartPanels {...defaultProps} />
          </TestProviders>
        );

        await waitFor(() => {
          expect(
            (LensEmbeddable as unknown as jest.Mock).mock.calls[0][0].extraOptions.breakdownField
          ).toEqual(defaultValue);
        });
      });
    });
  });

  test('it renders the table loading spinner when data is loading and `alertViewSelection` is table', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'table',
    });

    render(
      <TestProviders>
        <ChartPanels {...defaultProps} isLoadingIndexPattern={true} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tableLoadingSpinner')).toBeInTheDocument();
    });
  });

  test('it renders the alerts count panel when `alertViewSelection` is table', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'table',
    });

    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('alertsCountPanel')).toBeInTheDocument();
    });
  });

  test('it renders the treemap loading spinner when data is loading and `alertViewSelection` is treemap', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'treemap',
    });

    render(
      <TestProviders>
        <ChartPanels {...defaultProps} isLoadingIndexPattern={true} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('treemapLoadingSpinner')).toBeInTheDocument();
    });
  });

  test('it renders the treemap panel when `alertViewSelection` is treemap', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'treemap',
    });

    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('treemapPanel')).toBeInTheDocument();
    });
  });

  test('it renders the charts loading spinner when data is loading and `alertViewSelection` is charts', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'charts',
    });
    render(
      <TestProviders>
        <ChartPanels {...defaultProps} isLoadingIndexPattern={true} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chartsLoadingSpinner')).toBeInTheDocument();
    });
  });

  test('it renders the charts panel when `alertViewSelection` is charts', async () => {
    (useAlertsLocalStorage as jest.Mock).mockReturnValue({
      ...defaultAlertSettings,
      alertViewSelection: 'charts',
    });

    render(
      <TestProviders>
        <ChartPanels {...defaultProps} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('chartPanels')).toBeInTheDocument();
    });
  });
});
