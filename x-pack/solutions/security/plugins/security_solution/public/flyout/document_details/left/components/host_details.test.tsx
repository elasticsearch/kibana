/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useMisconfigurationPreview } from '@kbn/cloud-security-posture/src/hooks/use_misconfiguration_preview';
import { useVulnerabilitiesPreview } from '@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_preview';
import type { Anomalies } from '../../../../common/components/ml/types';
import { DocumentDetailsContext } from '../../shared/context';
import { TestProviders } from '../../../../common/mock';
import { HostDetails } from './host_details';
import { useMlCapabilities } from '../../../../common/components/ml/hooks/use_ml_capabilities';
import { mockAnomalies } from '../../../../common/components/ml/mock';
import { useObservedHost } from '../../../entity_details/host_right/hooks/use_observed_host';
import { useHostRelatedUsers } from '../../../../common/containers/related_entities/related_users';
import { RiskSeverity } from '../../../../../common/search_strategy';
import {
  HOST_DETAILS_TEST_ID,
  HOST_DETAILS_INFO_TEST_ID,
  HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID,
  HOST_DETAILS_LINK_TEST_ID,
  HOST_DETAILS_RELATED_USERS_LINK_TEST_ID,
  HOST_DETAILS_RELATED_USERS_IP_LINK_TEST_ID,
  HOST_DETAILS_MISCONFIGURATIONS_TEST_ID,
  HOST_DETAILS_VULNERABILITIES_TEST_ID,
  HOST_DETAILS_ALERT_COUNT_TEST_ID,
} from './test_ids';
import { EXPANDABLE_PANEL_CONTENT_TEST_ID } from '../../../../flyout_v2/shared/components/test_ids';
import { useRiskScore } from '../../../../entity_analytics/api/hooks/use_risk_score';
import { mockContextValue } from '../../shared/mocks/mock_context';
import { mockFlyoutApi } from '../../shared/mocks/mock_flyout_context';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { HostPreviewPanelKey } from '../../../entity_details/host_right';
import { HOST_PREVIEW_BANNER } from '../../../../flyout_v2/document/main/components/host_entity_overview';
import { UserPreviewPanelKey } from '../../../entity_details/user_right';
import { USER_PREVIEW_BANNER } from '../../../../flyout_v2/document/main/components/user_entity_overview';
import { NetworkPreviewPanelKey, NETWORK_PREVIEW_BANNER } from '../../../network_details';
import { useAlertsByStatus } from '../../../../overview/components/detection_response/alerts_by_status/use_alerts_by_status';
import { useDataView } from '../../../../data_view_manager/hooks/use_data_view';
import { getMockDataViewWithMatchedIndices } from '../../../../data_view_manager/mocks/mock_data_view';

jest.mock('@kbn/expandable-flyout');
jest.mock('@kbn/cloud-security-posture/src/hooks/use_misconfiguration_preview');
jest.mock('@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_preview');

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useLocation: jest.fn().mockReturnValue({ pathname: '' }) };
});

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');
  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

const from = '2022-07-28T08:20:18.966Z';
const to = '2022-07-28T08:20:18.966Z';
jest.mock('../../../../common/containers/use_global_time', () => {
  const actual = jest.requireActual('../../../../common/containers/use_global_time');
  return {
    ...actual,
    useGlobalTime: jest
      .fn()
      .mockReturnValue({ from, to, setQuery: jest.fn(), deleteQuery: jest.fn() }),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('uuid'),
}));

jest.mock('../../../../common/components/ml/hooks/use_ml_capabilities');
const mockUseMlUserPermissions = useMlCapabilities as jest.Mock;

const mockUseHasSecurityCapability = jest.fn().mockReturnValue(false);
jest.mock('../../../../helper_hooks', () => ({
  useHasSecurityCapability: () => mockUseHasSecurityCapability(),
}));

jest.mock('../../../../common/hooks/use_space_id', () => ({
  useSpaceId: () => 'default',
}));

jest.mock('../../../../common/components/ml/anomaly/anomaly_table_provider', () => ({
  AnomalyTableProvider: ({
    children,
  }: {
    children: (args: {
      anomaliesData: Anomalies;
      isLoadingAnomaliesData: boolean;
      jobNameById: Record<string, string | undefined>;
    }) => React.ReactNode;
  }) => children({ anomaliesData: mockAnomalies, isLoadingAnomaliesData: false, jobNameById: {} }),
}));

jest.mock('../../../entity_details/host_right/hooks/use_observed_host');
const mockUseObservedHost = useObservedHost as jest.Mock;

jest.mock('../../../../common/containers/related_entities/related_users');
const mockUseHostsRelatedUsers = useHostRelatedUsers as jest.Mock;

jest.mock('../../../../entity_analytics/api/hooks/use_risk_score');
const mockUseRiskScore = useRiskScore as jest.Mock;

jest.mock(
  '../../../../overview/components/detection_response/alerts_by_status/use_alerts_by_status'
);
const mockAlertData = {
  open: {
    total: 2,
    severities: [
      { key: 'high', value: 1, label: 'High' },
      { key: 'low', value: 1, label: 'Low' },
    ],
  },
};

const timestamp = '2022-07-25T08:20:18.966Z';

const defaultProps = {
  hostName: 'test host',
  timestamp,
  scopeId: 'scopeId',
};

const mockObservedHostResult = {
  details: { host: { name: ['test host'] } },
  isLoading: false,
  firstSeen: { date: null, isLoading: false },
  lastSeen: { date: null, isLoading: false },
  entityRecord: null,
  refetchEntityStore: undefined,
  observedDetailsInspect: undefined,
  refetchObservedDetails: jest.fn(),
};

const mockRiskScoreResponse = {
  data: [
    {
      host: {
        name: 'test host',
        risk: { calculated_level: 'low', calculated_score_norm: 38 },
      },
    },
  ],
  isAuthorized: true,
};

const mockRelatedUsersResponse = {
  inspect: jest.fn(),
  refetch: jest.fn(),
  relatedUsers: [{ user: 'test user', ip: ['100.XXX.XXX'], risk: RiskSeverity.Low }],
  loading: false,
};

const renderHostDetails = (contextValue: DocumentDetailsContext) =>
  render(
    <TestProviders>
      <DocumentDetailsContext.Provider value={contextValue}>
        <HostDetails {...defaultProps} />
      </DocumentDetailsContext.Provider>
    </TestProviders>
  );

describe('<HostDetails />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
    mockUseMlUserPermissions.mockReturnValue({ isPlatinumOrTrialLicense: false, capabilities: {} });
    mockUseObservedHost.mockReturnValue(mockObservedHostResult);
    mockUseRiskScore.mockReturnValue(mockRiskScoreResponse);
    mockUseHostsRelatedUsers.mockReturnValue(mockRelatedUsersResponse);
    (useMisconfigurationPreview as jest.Mock).mockReturnValue({});
    (useVulnerabilitiesPreview as jest.Mock).mockReturnValue({});
    (useAlertsByStatus as jest.Mock).mockReturnValue({ isLoading: false, items: {} });
    jest
      .mocked(useDataView)
      .mockReturnValue({ dataView: getMockDataViewWithMatchedIndices(['index']), status: 'ready' });
  });

  it('should render host details correctly', () => {
    const { getByTestId } = renderHostDetails(mockContextValue);
    expect(getByTestId(EXPANDABLE_PANEL_CONTENT_TEST_ID(HOST_DETAILS_TEST_ID))).toBeInTheDocument();
    expect(getByTestId(HOST_DETAILS_LINK_TEST_ID)).toBeInTheDocument();
  });

  it('should render host name as clicable link', () => {
    const { getByTestId } = renderHostDetails(mockContextValue);
    expect(getByTestId(HOST_DETAILS_LINK_TEST_ID)).toBeInTheDocument();

    getByTestId(HOST_DETAILS_LINK_TEST_ID).click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: HostPreviewPanelKey,
      params: {
        hostName: defaultProps.hostName,
        scopeId: defaultProps.scopeId,
        banner: HOST_PREVIEW_BANNER,
      },
    });
  });

  describe('Host overview', () => {
    it('should render the HostOverview with correct dates and indices', () => {
      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(mockUseObservedHost).toHaveBeenCalledWith('test host', 'scopeId', undefined);
      expect(getByTestId(HOST_DETAILS_INFO_TEST_ID)).toBeInTheDocument();
    });

    it('should render host risk score when authorized', () => {
      mockUseMlUserPermissions.mockReturnValue({
        isPlatinumOrTrialLicense: true,
        capabilities: {},
      });
      mockUseRiskScore.mockReturnValue({ data: [], isAuthorized: true });

      const { getByText } = renderHostDetails(mockContextValue);
      expect(getByText('Host risk score')).toBeInTheDocument();
    });

    it('should not render host risk score when unauthorized', () => {
      mockUseRiskScore.mockReturnValue({ data: [], isAuthorized: false });
      const { queryByText } = renderHostDetails(mockContextValue);
      expect(queryByText('Host risk score')).not.toBeInTheDocument();
    });
  });

  describe('Related users', () => {
    it('renders related users table when attack cell actions are used without DocumentDetailsContext', () => {
      const { getByTestId } = render(
        <TestProviders>
          <HostDetails {...defaultProps} isAttackDetails={true} />
        </TestProviders>
      );
      expect(getByTestId(HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID)).toBeInTheDocument();
      expect(getByTestId(HOST_DETAILS_RELATED_USERS_LINK_TEST_ID)).toBeInTheDocument();
    });

    it('should render the related user table with correct dates and indices', () => {
      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(mockUseHostsRelatedUsers).toBeCalledWith({
        entityId: undefined,
        from: timestamp,
        hostName: defaultProps.hostName,
        indexNames: ['entities-latest-default'],
        skip: false,
      });
      expect(getByTestId(HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID)).toBeInTheDocument();
      expect(getByTestId(HOST_DETAILS_RELATED_USERS_LINK_TEST_ID)).toBeInTheDocument();
    });

    it('should render user risk score column when license and capabilities are valid', () => {
      mockUseMlUserPermissions.mockReturnValue({
        isPlatinumOrTrialLicense: true,
        capabilities: {},
      });
      mockUseHasSecurityCapability.mockReturnValue(true);

      const { queryAllByRole } = renderHostDetails(mockContextValue);
      expect(queryAllByRole('columnheader').length).toBe(3);
      expect(queryAllByRole('row')[1].textContent).toContain('test user');
      expect(queryAllByRole('row')[1].textContent).toContain('Low');
    });

    it('should not render host risk score column when user has no entity-risk capability', () => {
      mockUseMlUserPermissions.mockReturnValue({
        isPlatinumOrTrialLicense: true,
        capabilities: {},
      });
      mockUseHasSecurityCapability.mockReturnValue(false);

      const { queryAllByRole } = renderHostDetails(mockContextValue);
      expect(queryAllByRole('columnheader').length).toBe(2);
    });

    it('should not render host risk score column when license is not valid', () => {
      const { queryAllByRole } = renderHostDetails(mockContextValue);
      expect(queryAllByRole('columnheader').length).toBe(2);
    });

    it('should render empty table if no related user is returned', () => {
      mockUseHostsRelatedUsers.mockReturnValue({
        ...mockRelatedUsersResponse,
        relatedUsers: [],
        loading: false,
      });

      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(getByTestId(HOST_DETAILS_RELATED_USERS_TABLE_TEST_ID).textContent).toContain(
        'No users identified'
      );
    });

    it('should render user name as clicable link', () => {
      const { getAllByTestId } = renderHostDetails(mockContextValue);
      expect(getAllByTestId(HOST_DETAILS_RELATED_USERS_LINK_TEST_ID).length).toBe(1);

      getAllByTestId(HOST_DETAILS_RELATED_USERS_LINK_TEST_ID)[0].click();
      expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
        id: UserPreviewPanelKey,
        params: {
          contextID: defaultProps.scopeId,
          userName: 'test user',
          scopeId: defaultProps.scopeId,
          banner: USER_PREVIEW_BANNER,
          entityId: undefined,
        },
      });

      getAllByTestId(HOST_DETAILS_RELATED_USERS_IP_LINK_TEST_ID)[0].click();
      expect(mockFlyoutApi.openPreviewPanel).toHaveBeenNthCalledWith(2, {
        id: NetworkPreviewPanelKey,
        params: {
          ip: '100.XXX.XXX',
          flowTarget: 'source',
          scopeId: defaultProps.scopeId,
          banner: NETWORK_PREVIEW_BANNER,
        },
      });
    });
  });

  describe('distribution bar insights', () => {
    it('should not render if no data is available', () => {
      const { queryByTestId } = renderHostDetails(mockContextValue);
      expect(queryByTestId(HOST_DETAILS_MISCONFIGURATIONS_TEST_ID)).not.toBeInTheDocument();
      expect(queryByTestId(HOST_DETAILS_VULNERABILITIES_TEST_ID)).not.toBeInTheDocument();
      expect(queryByTestId(HOST_DETAILS_ALERT_COUNT_TEST_ID)).not.toBeInTheDocument();
    });

    it('should render alert count when data is available', () => {
      (useAlertsByStatus as jest.Mock).mockReturnValue({
        isLoading: false,
        items: mockAlertData,
      });

      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(getByTestId(HOST_DETAILS_ALERT_COUNT_TEST_ID)).toBeInTheDocument();
    });

    it('should render misconfiguration when data is available', () => {
      (useMisconfigurationPreview as jest.Mock).mockReturnValue({
        data: { count: { passed: 1, failed: 2 } },
      });

      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(getByTestId(HOST_DETAILS_MISCONFIGURATIONS_TEST_ID)).toBeInTheDocument();
    });

    it('should render vulnerabilities when data is available', () => {
      (useVulnerabilitiesPreview as jest.Mock).mockReturnValue({
        data: { count: { CRITICAL: 0, HIGH: 1, MEDIUM: 1, LOW: 0, UNKNOWN: 0 } },
      });

      const { getByTestId } = renderHostDetails(mockContextValue);
      expect(getByTestId(HOST_DETAILS_VULNERABILITIES_TEST_ID)).toBeInTheDocument();
    });
  });
});
