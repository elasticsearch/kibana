/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { casesPluginMock } from '@kbn/cases-plugin/public/mocks';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import * as useUiSettingHook from '@kbn/kibana-react-plugin/public/ui_settings/use_ui_setting';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import { useBreadcrumbs, TagsList } from '@kbn/observability-shared-plugin/public';
import type { RuleTypeModel, ValidationResult } from '@kbn/triggers-actions-ui-plugin/public';
import { ruleTypeRegistryMock } from '@kbn/triggers-actions-ui-plugin/public/application/rule_type_registry.mock';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chance } from 'chance';
import React, { Fragment } from 'react';
import moment from 'moment';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { from } from 'rxjs';
import { useFetchAlertDetail } from '../../hooks/use_fetch_alert_detail';
import type { ConfigSchema } from '../../plugin';
import type { Subset } from '../../typings';
import { useKibana } from '../../utils/kibana_react';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import { render } from '../../utils/test_helper';
import { AlertDetails } from './alert_details';
import { alertDetail, alertWithNoData } from './mock/alert';
import { createTelemetryClientMock } from '../../services/telemetry/telemetry_client.mock';
import type { SavedObjectReference } from '@kbn/core/server';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
  useLocation: jest.fn(),
  useHistory: jest.fn(),
}));

jest.mock('../../utils/kibana_react');
jest.mock('@kbn/response-ops-rule-form/src/common');

const mockUseGetRuleTypesPermissions = jest.fn(() => ({
  authorizedToReadAnyRules: true,
  authorizedToReadRuleType: (): boolean => true,
}));
jest.mock('@kbn/alerts-ui-shared/src/common/hooks', () => ({
  ...jest.requireActual('@kbn/alerts-ui-shared/src/common/hooks'),
  useGetRuleTypesPermissions: () => mockUseGetRuleTypesPermissions(),
}));
const validationMethod = (): ValidationResult => ({ errors: {} });
const ruleType: RuleTypeModel = {
  id: 'logs.alert.document.count',
  iconClass: 'test',
  description: 'Testing',
  documentationUrl: 'https://...',
  requiresAppContext: false,
  validate: validationMethod,
  ruleParamsExpression: () => <Fragment />,
  alertDetailsAppSection: () => <Fragment />,
};

jest.mock('./hooks/use_add_suggested_dashboard', () => ({
  useAddSuggestedDashboards: () => ({
    onClickAddSuggestedDashboard: jest.fn(),
    addingDashboardId: undefined,
  }),
}));

jest.mock('./hooks/use_discover_url', () => ({
  useDiscoverUrl: () => ({
    discoverUrl: null,
  }),
}));

jest.mock('./hooks/use_related_dashboards', () => ({
  useRelatedDashboards: () => ({
    isLoadingSuggestedDashboards: false,
    suggestedDashboards: [
      {
        id: 'suggested-dashboard-1',
        title: 'Suggested Dashboard 1',
        description: 'A suggested dashboard for testing',
        tags: ['SuggestedTag', 'SecondTag'],
      },
    ],
    linkedDashboards: [
      {
        id: 'dashboard-1',
      },
    ],
  }),
}));

const ruleTypeRegistry = ruleTypeRegistryMock.create();

const useKibanaMock = useKibana as jest.Mock;

const mockObservabilityAIAssistant = observabilityAIAssistantPluginMock.createStartContract();

const spacesUnsubscribeMock = jest.fn();
const spacesSubscribeMock = jest.fn().mockReturnValue({ unsubscribe: spacesUnsubscribeMock });
const mockSpaces = {
  getActiveSpace$: jest.fn().mockReturnValue({
    subscribe: spacesSubscribeMock,
    pipe: () => ({
      subscribe: spacesSubscribeMock,
    }),
  }),
};

const mockConvertNameToReference = jest
  .fn()
  .mockImplementation((value: string) => ({ id: value, type: value }));

const myLocator = {
  ...sharePluginMock.createLocator(),
  getLocation: jest.fn().mockResolvedValue({ path: '' }),
};
const kibanaStartMockServices = kibanaStartMock.startContract().services;

const kibanaStartMockServicesWithLocator = {
  ...kibanaStartMockServices,
  share: {
    ...kibanaStartMockServices.share,
    url: { ...kibanaStartMockServices.share.url, locators: { get: jest.fn(() => myLocator) } },
  },
};

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    services: {
      ...kibanaStartMockServicesWithLocator,
      cases: casesPluginMock.createStartContract(),
      application: { currentAppId$: from('mockedApp') },
      http: {
        basePath: {
          prepend: jest.fn(),
        },
        get: jest.fn().mockReturnValue({ alertContext: [] }),
      },
      observabilityAIAssistant: mockObservabilityAIAssistant,
      theme: {},
      dashboard: {},
      spaces: mockSpaces,
      telemetryClient: createTelemetryClientMock(),
      savedObjectsTagging: {
        ui: {
          convertNameToReference: (value: string) => mockConvertNameToReference(value),
          components: {
            TagList: ({
              object,
            }: {
              object: {
                references: SavedObjectReference[];
              };
            }) => {
              return (
                <div data-test-subj="tagList">
                  {object.references.map(({ name }) => (
                    <div>{name}</div>
                  ))}
                </div>
              );
            },
          },
        },
      },
    },
  });
};

const MOCK_RULE_TYPE_ID = 'observability.rules.custom_threshold';

const MOCK_RULE = {
  id: 'ruleId',
  name: 'ruleName',
  ruleTypeId: MOCK_RULE_TYPE_ID,
  consumer: 'logs',
  params: {
    searchConfiguration: {
      index: 'index',
      query: {
        query: 'tags: tag1',
      },
    },
    criteria: [],
  },
  artifacts: {
    dashboards: [
      {
        id: 'dashboard-1',
      },
      {
        id: 'dashboard-2',
      },
    ],
  },
};
jest.mock('../../hooks/use_fetch_alert_detail');
jest.mock('../../hooks/use_fetch_rule', () => {
  return {
    useFetchRule: () => ({
      reloadRule: jest.fn(),
      rule: MOCK_RULE,
    }),
  };
});
jest.mock('@kbn/observability-shared-plugin/public');
jest.mock('@kbn/ebt-tools');

const usePerformanceContextMock = usePerformanceContext as jest.Mock;
const useFetchAlertDetailMock = useFetchAlertDetail as jest.Mock;
const useParamsMock = useParams as jest.Mock;
const useLocationMock = useLocation as jest.Mock;
const useHistoryMock = useHistory as jest.Mock;
const useBreadcrumbsMock = useBreadcrumbs as jest.Mock;
const TagsListMock = TagsList as jest.Mock;

usePerformanceContextMock.mockReturnValue({ onPageReady: jest.fn() });

const chance = new Chance();
const params = {
  alertId: chance.guid(),
};

const config: Subset<ConfigSchema> = {
  unsafe: {
    alertDetails: {
      uptime: { enabled: true },
    },
  },
};

describe('Alert details', () => {
  jest
    .spyOn(useUiSettingHook, 'useUiSetting')
    .mockImplementation(() => 'MMM D, YYYY @ HH:mm:ss.SSS');

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadAnyRules: true,
      authorizedToReadRuleType: () => true,
    });
    useParamsMock.mockReturnValue(params);
    useLocationMock.mockReturnValue({ pathname: '/alerts/uuid', search: '', state: '', hash: '' });
    useHistoryMock.mockReturnValue({ replace: jest.fn() });
    useBreadcrumbsMock.mockReturnValue([]);
    TagsListMock.mockReturnValue(<div data-test-subj="TagsList" />);
    ruleTypeRegistry.list.mockReturnValue([ruleType]);
    ruleTypeRegistry.get.mockReturnValue(ruleType);
    ruleTypeRegistry.has.mockReturnValue(true);
    mockKibana();
  });

  const renderComponent = () =>
    render(
      <IntlProvider locale="en">
        <AlertDetails />
      </IntlProvider>,
      config
    );

  it('should show the alert detail page with all necessary components', async () => {
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    expect(alertDetails.queryByTestId('alertDetails')).toBeTruthy();
    expect(alertDetails.queryByTestId('alertDetailsError')).toBeFalsy();
    expect(alertDetails.queryByTestId(MOCK_RULE_TYPE_ID)).toBeTruthy();
    expect(alertDetails.queryByTestId('alertDetailsTabbedContent')).toBeTruthy();
    expect(alertDetails.queryByTestId('alert-summary-container')).toBeFalsy();
    expect(alertDetails.queryByTestId('overviewTab')).toBeTruthy();
    expect(alertDetails.queryByTestId('metadataTab')).toBeTruthy();
    expect(alertDetails.queryByTestId('relatedAlertsTab')).toBeTruthy();
  });

  it('should hide the Investigation guide and Related dashboards tabs when unauthorized to read the alert rule type', async () => {
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadAnyRules: false,
      authorizedToReadRuleType: () => false,
    });
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    expect(alertDetails.queryByTestId('investigationGuideTab')).toBeFalsy();
    expect(alertDetails.queryByTestId('relatedDashboardsTab')).toBeFalsy();
    // Non-rule-dependent tabs remain visible
    expect(alertDetails.queryByTestId('overviewTab')).toBeTruthy();
    expect(alertDetails.queryByTestId('metadataTab')).toBeTruthy();
    expect(alertDetails.queryByTestId('relatedAlertsTab')).toBeTruthy();
  });

  it('should fall back to the generic overview when unauthorized to read the alert rule type', async () => {
    mockUseGetRuleTypesPermissions.mockReturnValue({
      authorizedToReadAnyRules: true,
      authorizedToReadRuleType: () => false,
    });
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    // The generic overview renders instead of the customized rule-dependent section
    expect(alertDetails.queryByTestId('overviewTabPanel')).toBeTruthy();
  });

  it('should show Metadata tab', async () => {
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    expect(alertDetails.queryByTestId('alertDetailsTabbedContent')?.textContent).toContain(
      'Metadata'
    );
    await userEvent.click(alertDetails.getByText('Metadata'));
    expect(alertDetails.queryByTestId('metadataTabPanel')).toBeTruthy();
    expect(alertDetails.queryByTestId('metadataTabPanel')?.textContent).toContain(
      'kibana.alert.status'
    );
  });

  it('should show error loading the alert details', async () => {
    useFetchAlertDetailMock.mockReturnValue([false, alertWithNoData]);

    const alertDetails = renderComponent();

    expect(alertDetails.queryByTestId('alertDetailsError')).toBeTruthy();
    expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy();
    expect(alertDetails.queryByTestId('alertDetails')).toBeFalsy();
  });

  it('should show loading spinner', async () => {
    useFetchAlertDetailMock.mockReturnValue([true, alertWithNoData]);

    const alertDetails = renderComponent();

    expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeTruthy();
    expect(alertDetails.queryByTestId('alertDetailsError')).toBeFalsy();
    expect(alertDetails.queryByTestId('alertDetails')).toBeFalsy();
  });

  it('should navigate to Related Dashboards tab and display linked and suggested dashboards', async () => {
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    // Find and click the Related Dashboards tab
    const relatedDashboardsTab = alertDetails.getByText(/Related dashboards/);
    expect(relatedDashboardsTab).toBeTruthy();
    expect(relatedDashboardsTab.textContent).toContain('2');

    // Click on the Related Dashboards tab
    await userEvent.click(relatedDashboardsTab);

    // Check that linked dashboards section is displayed
    expect(alertDetails.queryByTestId('linked-dashboards')).toBeTruthy();

    // Check that suggested dashboards section is displayed
    expect(alertDetails.queryByTestId('suggested-dashboards')).toBeTruthy();

    // Verify the suggested dashboard from our mock is displayed
    expect(alertDetails.queryByText('Suggested Dashboard 1')).toBeTruthy();
    expect(alertDetails.queryByText('A suggested dashboard for testing')).toBeTruthy();
    expect(
      alertDetails.queryByTestId('addSuggestedDashboard_alertDetailsPage_custom_threshold')
    ).toBeTruthy();

    // Verify that tags are displayed
    expect(mockConvertNameToReference).toHaveBeenNthCalledWith(1, 'SuggestedTag');
    expect(mockConvertNameToReference).toHaveBeenNthCalledWith(2, 'SecondTag');
    expect(alertDetails.queryByTestId('tagList')).toBeTruthy();
  });

  it('should build dashboard link with the correct time range when clicking on a suggested dashboard', async () => {
    useFetchAlertDetailMock.mockReturnValue([false, alertDetail]);

    const alertDetails = renderComponent();

    await waitFor(() => expect(alertDetails.queryByTestId('centerJustifiedSpinner')).toBeFalsy());

    // Navigate to Related Dashboards tab
    await userEvent.click(alertDetails.getByText(/Related dashboards/));
    expect(myLocator.getRedirectUrl).toHaveBeenCalledWith({
      dashboardId: 'suggested-dashboard-1',
      time_range: {
        from: moment(alertDetail.formatted.start).subtract(30, 'minutes').toISOString(),
        to: moment(alertDetail.formatted.start).add(30, 'minutes').toISOString(),
      },
    });
  });
});
