/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ComponentProps } from 'react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { mountWithIntl, nextTick } from '@kbn/test-jest-helpers';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { allCasesPermissions, noCasesPermissions } from '@kbn/observability-shared-plugin/public';
import { noop } from 'lodash';
import type { EuiDataGridCellValueElementProps } from '@elastic/eui/src/components/datagrid/data_grid_types';
import { waitFor, act } from '@testing-library/react';
import { Router } from '@kbn/shared-ux-router';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import { createTelemetryClientMock } from '../../services/telemetry/telemetry_client.mock';
import { AlertActions } from './alert_actions';
import { inventoryThresholdAlertEs } from '../../rules/fixtures/example_alerts';
import { RULE_DETAILS_PAGE_ID } from '../../pages/rule_details/constants';
import * as pluginContext from '../../hooks/use_plugin_context';
import type { ConfigSchema, ObservabilityPublicPluginsStart } from '../../plugin';
import { createMemoryHistory } from 'history';
import type { ObservabilityRuleTypeRegistry } from '../../rules/create_observability_rule_type_registry';
import type { GetObservabilityAlertsTableProp } from '../..';
import { AlertsTableContextProvider } from '@kbn/response-ops-alerts-table/contexts/alerts_table_context';
import type {
  AdditionalContext,
  AlertDetailsNavigation,
  RenderContext,
} from '@kbn/response-ops-alerts-table/types';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

const mockUseGetRuleTypesPermissions = jest.fn(() => ({
  authorizedToReadRuleType: (_ruleTypeId: string, _consumer?: string): boolean => true,
  authorizedToCreateAnyRules: false,
}));
jest.mock('@kbn/alerts-ui-shared/src/common/hooks', () => ({
  ...jest.requireActual('@kbn/alerts-ui-shared/src/common/hooks'),
  useGetRuleTypesPermissions: () => mockUseGetRuleTypesPermissions(),
}));

const refresh = jest.fn();
const caseHooksReturnedValue = {
  open: () => {
    refresh();
  },
  close: jest.fn(),
};

const mockTelemetryClient = createTelemetryClientMock();
const mockKibana = {
  ...kibanaStartMock.startContract(),
  services: {
    ...kibanaStartMock.startContract().services,
    telemetryClient: mockTelemetryClient,
  },
};
mockKibana.services.cases.hooks.useCasesAddToNewCaseFlyout.mockReturnValue(caseHooksReturnedValue);

mockKibana.services.cases.hooks.useCasesAddToExistingCaseModal.mockReturnValue(
  caseHooksReturnedValue
);

mockKibana.services.cases.helpers.canUseCases.mockReturnValue(allCasesPermissions());
const mockLicensing = licensingMock.createStart();

const { ObservabilityAIAssistantContextualInsight } =
  observabilityAIAssistantPluginMock.createStartContract();

const prependMock = jest.fn().mockImplementation((args) => args);
mockKibana.services.http.basePath.prepend = prependMock;
mockKibana.services.application.getUrlForApp.mockImplementation(
  (appId: string, { path }: { path?: string } = {}) => `/app/${appId}${path ? `${path}` : ''}`
);

const config: ConfigSchema = {
  unsafe: {
    alertDetails: {
      uptime: { enabled: false },
    },
  },
  managedOtlpServiceUrl: '',
};

const getFormatterMock = jest.fn();
const createRuleTypeRegistryMock = () => ({
  getFormatter: getFormatterMock,
  registerFormatter: () => {},
  list: () => ['ruleType1', 'ruleType2'],
});

export const createObservabilityRuleTypeRegistryMock = () =>
  createRuleTypeRegistryMock() as ObservabilityRuleTypeRegistry &
    ReturnType<typeof createRuleTypeRegistryMock>;

jest.spyOn(pluginContext, 'usePluginContext').mockImplementation(() => ({
  appMountParameters: {} as AppMountParameters,
  core: {} as CoreStart,
  config,
  plugins: {} as ObservabilityPublicPluginsStart,
  observabilityRuleTypeRegistry: createObservabilityRuleTypeRegistryMock(),
  ObservabilityPageTemplate: KibanaPageTemplate,
  ObservabilityAIAssistantContextualInsight,
}));
jest.spyOn(pluginContext, 'usePluginContext').mockImplementation(() => ({
  appMountParameters: {} as AppMountParameters,
  core: {} as CoreStart,
  config,
  plugins: {} as ObservabilityPublicPluginsStart,
  observabilityRuleTypeRegistry: createObservabilityRuleTypeRegistryMock(),
  ObservabilityPageTemplate: KibanaPageTemplate,
  ObservabilityAIAssistantContextualInsight,
}));

describe('ObservabilityActions component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFormatterMock.mockReturnValue(jest.fn().mockReturnValue('a reason'));
    mockTelemetryClient.reportAlertAddedToCase.mockClear();
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadRuleType: () => true,
      authorizedToCreateAnyRules: false,
    });
  });

  const setup = async (pageId: string) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    const alertDetailsNavigation: AlertDetailsNavigation = {
      appId: 'observability',
      getPath: (alertId: string) => `/alerts/${encodeURIComponent(alertId)}`,
    };

    const props: Pick<
      ComponentProps<GetObservabilityAlertsTableProp<'renderActionsCell'>>,
      | 'tableId'
      | 'config'
      | 'alert'
      | 'ecsAlert'
      | 'nonEcsData'
      | 'rowIndex'
      | 'cveProps'
      | 'clearSelection'
      | 'observabilityRuleTypeRegistry'
      | 'refresh'
      | 'alertDetailsNavigation'
    > = {
      tableId: pageId,
      config,
      alert: inventoryThresholdAlertEs,
      ecsAlert: [],
      nonEcsData: [],
      rowIndex: 1,
      cveProps: {} as unknown as EuiDataGridCellValueElementProps,
      clearSelection: noop,
      observabilityRuleTypeRegistry: createObservabilityRuleTypeRegistryMock(),
      refresh,
      alertDetailsNavigation,
    };

    const services = {
      http: mockKibana.services.http,
      data: mockKibana.services.data,
      notifications: mockKibana.services.notifications,
      application: mockKibana.services.application,
      settings: mockKibana.services.settings,
      cases: mockKibana.services.cases,
      licensing: mockLicensing,
      fieldFormats: fieldFormatsMock,
    };

    const context = {
      services,
    } as unknown as RenderContext<AdditionalContext>;

    const wrapper = mountWithIntl(
      <Router history={createMemoryHistory()}>
        <KibanaContextProvider services={mockKibana.services}>
          <AlertsTableContextProvider value={context}>
            <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
              <AlertActions
                {...(props as unknown as ComponentProps<
                  GetObservabilityAlertsTableProp<'renderActionsCell'>
                >)}
                services={services}
              />
            </QueryClientProvider>
          </AlertsTableContextProvider>
        </KibanaContextProvider>
      </Router>
    );
    await act(async () => {
      await nextTick();
      wrapper.update();
    });

    return wrapper;
  };

  it('should hide "View rule details" menu item for rule page id', async () => {
    const wrapper = await setup(RULE_DETAILS_PAGE_ID);
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj~="viewRuleDetails"]').hostNodes().length).toBe(0);
    });
  });

  it('should show "View rule details" menu item', async () => {
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj~="viewRuleDetails"]').hostNodes().length).toBe(1);
    });
  });

  it('should hide "View rule details" menu item when unauthorized to read the rule type', async () => {
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadRuleType: () => false,
      authorizedToCreateAnyRules: false,
    });
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj~="viewRuleDetails"]').hostNodes().length).toBe(0);
    });
  });

  it('"View alert details" menu item should open alert details page', async () => {
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj~="viewAlertDetailsPage"]').hostNodes().length).toBe(1);
      expect(wrapper.find('[data-test-subj~="viewAlertDetailsFlyout"]').exists()).toBeFalsy();
    });
  });

  it('should create a valid link for rule details page', async () => {
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj~="viewRuleDetails"]').hostNodes().length).toBe(1);
      expect(wrapper.find('[data-test-subj~="viewRuleDetails"]').hostNodes().prop('href')).toBe(
        '/app/rules/rule/06f53080-0f91-11ed-9d86-013908b232ef'
      );
    });
  });

  it('should refresh when adding an alert to a new case', async () => {
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(wrapper.find('[data-test-subj="add-to-new-case-action"]').hostNodes().length).toBe(1);

      wrapper.find('[data-test-subj="add-to-new-case-action"]').hostNodes().simulate('click');
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('should refresh when when calling onSuccess of useCasesAddToNewCaseFlyout', async () => {
    await setup('nothing');

    // @ts-expect-error: The object will always be defined
    mockKibana.services.cases.hooks.useCasesAddToNewCaseFlyout.mock.calls[0][0].onSuccess();

    expect(refresh).toHaveBeenCalled();
  });

  it('should report telemetry when adding alert to a new case', async () => {
    await setup('nothing');

    // @ts-expect-error: The object will always be defined
    mockKibana.services.cases.hooks.useCasesAddToNewCaseFlyout.mock.calls[0][0].onSuccess();

    expect(mockTelemetryClient.reportAlertAddedToCase).toHaveBeenCalledWith(
      true,
      'nothing',
      expect.anything()
    );
  });

  it('should refresh when adding an alert to an existing case', async () => {
    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');
    await waitFor(() => {
      expect(
        wrapper.find('[data-test-subj="add-to-existing-case-action"]').hostNodes().length
      ).toBe(1);

      wrapper.find('[data-test-subj="add-to-existing-case-action"]').hostNodes().simulate('click');
      expect(refresh).toHaveBeenCalled();
    });
  });

  it('should refresh when calling onSuccess of useCasesAddToExistingCaseModal', async () => {
    await setup('nothing');

    // @ts-expect-error: The object will always be defined
    mockKibana.services.cases.hooks.useCasesAddToExistingCaseModal.mock.calls[0][0].onSuccess();

    expect(refresh).toHaveBeenCalled();
  });

  it('should report telemetry when adding alert to an existing case', async () => {
    await setup('nothing');

    // @ts-expect-error: The object will always be defined
    mockKibana.services.cases.hooks.useCasesAddToExistingCaseModal.mock.calls[0][0].onSuccess();

    expect(mockTelemetryClient.reportAlertAddedToCase).toHaveBeenCalledWith(
      false,
      'nothing',
      expect.anything()
    );
  });

  it('should hide the case actions without permissions', async () => {
    mockKibana.services.cases.helpers.canUseCases.mockReturnValue(noCasesPermissions());

    const wrapper = await setup('nothing');
    wrapper.find('[data-test-subj="alertsTableRowActionMore"]').hostNodes().simulate('click');

    expect(wrapper.find('[data-test-subj="add-to-new-case-action"]').hostNodes().length).toBe(0);
    expect(wrapper.find('[data-test-subj="add-to-existing-case-action"]').hostNodes().length).toBe(
      0
    );
  });

  it('should show a valid url when clicking  "View in app"', async () => {
    getFormatterMock.mockReturnValue(
      jest.fn().mockReturnValue({
        reason: 'a reason',
        link: 'http://localhost:5620/app/o11y/log-explorer',
        hasBasePath: false,
      })
    );
    const wrapper = await setup(RULE_DETAILS_PAGE_ID);

    expect(
      wrapper.find('[data-test-subj="o11yAlertActionsButton"]').first().getElement().props.onClick
    ).toBeDefined();

    prependMock.mockClear();

    await waitFor(() => {
      wrapper.find('[data-test-subj="o11yAlertActionsButton"]').first().simulate('mouseover');
      expect(prependMock).toBeCalledTimes(1);
    });
  });
});
