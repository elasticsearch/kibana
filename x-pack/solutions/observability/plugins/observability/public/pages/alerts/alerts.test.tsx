/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { usePerformanceContext } from '@kbn/ebt-tools';
import { EuiThemeProvider as ThemeProvider } from '@elastic/eui';
import { MAINTENANCE_WINDOW_FEATURE_ID } from '@kbn/maintenance-windows-plugin/common';
import { fetchActiveMaintenanceWindows } from '@kbn/alerts-ui-shared/src/maintenance_window_callout/api';
import { RUNNING_MAINTENANCE_WINDOW_1 } from '@kbn/alerts-ui-shared/src/maintenance_window_callout/mock';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { TimeBuckets } from '@kbn/data-plugin/common';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { BehaviorSubject } from 'rxjs';
import * as dataContext from '../../hooks/use_has_data';
import * as pluginContext from '../../hooks/use_plugin_context';
import type { ObservabilityPublicPluginsStart } from '../../plugin';
import { useGetAvailableRulesWithDescriptions } from '../../hooks/use_get_available_rules_with_descriptions';
import { createObservabilityRuleTypeRegistryMock } from '../../rules/observability_rule_type_registry_mock';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import { AlertsPage } from './alerts';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: jest.fn(),
}));

const mockUseKibanaReturnValue = kibanaStartMock.startContract();
const license$ = new BehaviorSubject(
  licensingMock.createLicense({
    license: { type: 'platinum', mode: 'platinum' },
  })
);
mockUseKibanaReturnValue.services.licensing.license$ = license$;
mockUseKibanaReturnValue.services.application.capabilities = {
  ...mockUseKibanaReturnValue.services.application.capabilities,
  [MAINTENANCE_WINDOW_FEATURE_ID]: {
    save: true,
    show: true,
  },
};
mockUseKibanaReturnValue.services.spaces.getActiveSpace = jest
  .fn()
  .mockImplementation(() =>
    Promise.resolve({ id: 'space-id', name: 'space-name', disabledFeatures: [] })
  );

const mockObservabilityAIAssistant = observabilityAIAssistantPluginMock.createStartContract();

jest.mock('../../utils/kibana_react', () => ({
  __esModule: true,
  useKibana: jest.fn(() => ({
    ...mockUseKibanaReturnValue,
    services: {
      ...mockUseKibanaReturnValue.services,
      observabilityAIAssistant: mockObservabilityAIAssistant,
    },
  })),
}));

const useLocationMock = useLocation as jest.Mock;

jest.mock('@kbn/ebt-tools');

const usePerformanceContextMock = usePerformanceContext as jest.Mock;
usePerformanceContextMock.mockReturnValue({ onPageReady: jest.fn() });

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  __esModule: true,
  useKibana: jest.fn(() => mockUseKibanaReturnValue),
}));
jest.mock('@kbn/observability-shared-plugin/public');
jest.mock('../../hooks/create_use_rules_link', () => ({
  createUseRulesLink: jest.fn(() => () => ({
    href: '/app/rules',
    onClick: jest.fn(),
  })),
}));
jest.spyOn(pluginContext, 'usePluginContext').mockImplementation(() => ({
  appMountParameters: {
    setHeaderActionMenu: () => {},
  } as unknown as AppMountParameters,
  config: {
    unsafe: {
      alertDetails: {
        apm: { enabled: false },
        uptime: { enabled: false },
      },
    },
    managedOtlpServiceUrl: '',
    aiAssistant: {
      enabled: false,
      feedback: {
        enabled: false,
      },
    },
  },
  observabilityRuleTypeRegistry: createObservabilityRuleTypeRegistryMock(),
  ObservabilityPageTemplate: KibanaPageTemplate,
  kibanaFeatures: [],
  core: {} as CoreStart,
  plugins: {} as ObservabilityPublicPluginsStart,
  hasAnyData: true,
  isAllRequestsComplete: true,
}));

jest.spyOn(dataContext, 'useHasData').mockImplementation(() => ({
  hasDataMap: {},
  hasAnyData: true,
  isAllRequestsComplete: true,
  onRefreshTimeRange: jest.fn(),
  forceUpdate: 'false',
}));

jest.mock('@kbn/alerts-ui-shared/src/maintenance_window_callout/api', () => ({
  fetchActiveMaintenanceWindows: jest.fn(() => Promise.resolve([])),
}));
const fetchActiveMaintenanceWindowsMock = fetchActiveMaintenanceWindows as jest.Mock;

jest.mock('../../hooks/use_time_buckets', () => ({
  useTimeBuckets: jest.fn(),
}));

jest.mock('../../hooks/use_has_data', () => ({
  useHasData: jest.fn(),
}));

const { useTimeBuckets } = jest.requireMock('../../hooks/use_time_buckets');
const { useHasData } = jest.requireMock('../../hooks/use_has_data');

jest.mock('../../hooks/use_get_available_rules_with_descriptions');

jest.mock('@kbn/triggers-actions-ui-plugin/public');

jest.mock('@kbn/alerts-ui-shared/src/common/hooks', () => ({
  ...jest.requireActual('@kbn/alerts-ui-shared/src/common/hooks'),
  useGetRuleTypesPermissions: jest.fn(() => ({
    authorizedToReadAnyRules: true,
    authorizedToReadRuleType: () => true,
  })),
}));

const ruleDescriptions = [
  {
    id: 'observability.rules.custom_threshold',
    name: 'Custom threshold',
    description: 'Alert when any Observability data type reaches or exceeds a given value.',
  },
];
const useGetAvailableRulesWithDescriptionsMock = useGetAvailableRulesWithDescriptions as jest.Mock;
useGetAvailableRulesWithDescriptionsMock.mockReturnValue(ruleDescriptions);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      cacheTime: 0,
    },
  },
});
function AllTheProviders({ children }: { children: any }) {
  return (
    <ThemeProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </IntlProvider>
    </ThemeProvider>
  );
}

describe('AlertsPage with all capabilities', () => {
  const timeBuckets = new TimeBuckets({
    'histogram:maxBars': 12,
    'histogram:barTarget': 10,
    dateFormat: 'MMM D, YYYY @ HH:mm:ss.SSS',
    'dateFormat:scaled': [
      ['', 'HH:mm:ss.SSS'],
      ['PT1S', 'HH:mm:ss'],
      ['PT1M', 'HH:mm'],
      ['PT1H', 'YYYY-MM-DD HH:mm'],
      ['P1DT', 'YYYY-MM-DD'],
      ['P1YT', 'YYYY'],
    ],
  });

  async function setup() {
    return render(<AlertsPage />, { wrapper: AllTheProviders });
  }

  beforeAll(() => {
    fetchActiveMaintenanceWindowsMock.mockResolvedValue([]);
    useHasData.mockReturnValue({
      hasDataMap: {
        apm: { hasData: true, status: 'success' },
        synthetics: { hasData: true, status: 'success' },
        infra_logs: { hasData: undefined, status: 'success' },
        infra_metrics: { hasData: true, status: 'success' },
        ux: { hasData: undefined, status: 'success' },
        alert: { hasData: false, status: 'success' },
      },
      hasAnyData: true,
      isAllRequestsComplete: true,
      onRefreshTimeRange: () => {},
      forceUpdate: '',
    });
  });

  beforeEach(() => {
    fetchActiveMaintenanceWindowsMock.mockClear();
    license$.next(
      licensingMock.createLicense({
        license: { type: 'platinum', mode: 'platinum' },
      })
    );
    useTimeBuckets.mockReturnValue(timeBuckets);
    useLocationMock.mockReturnValue({ pathname: '/alerts', search: '', state: '', hash: '' });
  });

  it('should render an alerts page template', async () => {
    const wrapper = await setup();
    await waitFor(() => {
      expect(wrapper.getByText('Alerts')).toBeInTheDocument();
    });
  });

  it('renders MaintenanceWindowCallout if one exists', async () => {
    fetchActiveMaintenanceWindowsMock.mockResolvedValue([
      {
        ...RUNNING_MAINTENANCE_WINDOW_1,
        categoryIds: ['observability'],
      },
    ]);
    const wrapper = await setup();

    await waitFor(() => {
      expect(wrapper.getByTestId('maintenanceWindowCallout')).toBeInTheDocument();
      expect(fetchActiveMaintenanceWindowsMock).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fetch maintenance windows on a basic license', async () => {
    license$.next(
      licensingMock.createLicense({
        license: { type: 'basic', mode: 'basic' },
      })
    );

    await setup();

    await waitFor(() => {
      expect(fetchActiveMaintenanceWindowsMock).not.toHaveBeenCalled();
    });
  });

  describe('Manage rules link', () => {
    it('should direct to unified rules page', async () => {
      let wrapper;
      await act(async () => {
        wrapper = await setup();
      });

      await waitFor(() => {
        const manageRulesLink = wrapper!.getByTestId('manageRulesPageButton');
        expect(manageRulesLink).toBeInTheDocument();
        expect(manageRulesLink.getAttribute('href')).toBe('/app/rules');
      });
    });
  });
});
