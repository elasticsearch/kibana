/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAlertDetailsContextHandler } from '.';
import { getLogRateAnalysisForAlert } from '../get_log_rate_analysis_for_alert';
import { getLogCategories } from '../get_log_categories';
import { getServiceNameFromSignals } from './get_service_name_from_signals';
import { getContainerIdFromSignals } from './get_container_id_from_signals';
import { getApmEventClient } from '../../../lib/helpers/get_apm_event_client';
import { getApmAlertsClient } from '../../../lib/helpers/get_apm_alerts_client';
import { getMlClient } from '../../../lib/helpers/get_ml_client';
import { getRandomSampler } from '../../../lib/helpers/get_random_sampler';
import { getExitSpanChangePoints, getServiceChangePoints } from '../get_changepoints';
import { getAnomalies } from '../get_apm_service_summary/get_anomalies';

jest.mock('../get_log_rate_analysis_for_alert');
jest.mock('../get_log_categories');
jest.mock('./get_service_name_from_signals');
jest.mock('./get_container_id_from_signals');
jest.mock('../../../lib/helpers/get_apm_event_client');
jest.mock('../../../lib/helpers/get_apm_alerts_client');
jest.mock('../../../lib/helpers/get_ml_client');
jest.mock('../../../lib/helpers/get_random_sampler');
jest.mock('../get_apm_service_summary');
jest.mock('../get_apm_downstream_dependencies');
jest.mock('../get_changepoints');
jest.mock('../get_apm_service_summary/get_anomalies');
jest.mock('./get_apm_errors');

const mockLogRateAnalysis = jest.mocked(getLogRateAnalysisForAlert);
const mockLogCategories = jest.mocked(getLogCategories);
const mockGetServiceName = jest.mocked(getServiceNameFromSignals);
const mockGetContainerId = jest.mocked(getContainerIdFromSignals);

function buildMocks() {
  (getApmEventClient as jest.Mock).mockResolvedValue({});
  (getApmAlertsClient as jest.Mock).mockResolvedValue({});
  (getMlClient as jest.Mock).mockResolvedValue({});
  (getRandomSampler as jest.Mock).mockResolvedValue({});
  (getExitSpanChangePoints as jest.Mock).mockResolvedValue([]);
  (getServiceChangePoints as jest.Mock).mockResolvedValue([]);
  (getAnomalies as jest.Mock).mockResolvedValue([]);

  mockLogRateAnalysis.mockResolvedValue({ logRateAnalysisType: 'spike', significantItems: [] });
  mockLogCategories.mockResolvedValue({ logCategories: [], entities: [] });
}

const mockApmCore = {
  start: jest.fn().mockResolvedValue({}),
} as any;

const mockResourcePlugins = {
  observability: {
    setup: {
      getScopedAnnotationsClient: jest.fn().mockResolvedValue(undefined),
    },
  },
  alerting: {
    start: jest.fn().mockResolvedValue({ getRulesClientWithRequest: jest.fn() }),
  },
  ruleRegistry: {
    start: jest.fn().mockResolvedValue({ getRacClientWithRequest: jest.fn() }),
  },
  logsDataAccess: {
    start: jest.fn().mockResolvedValue({
      services: {
        logSourcesServiceFactory: {
          getScopedLogSourcesService: jest.fn().mockResolvedValue({}),
        },
      },
    }),
  },
  apmDataAccess: {
    setup: { getApmIndices: jest.fn().mockResolvedValue({}) },
  },
} as any;

const mockRequestContext = {
  core: Promise.resolve({
    elasticsearch: { client: { asCurrentUser: {} } },
    savedObjects: { client: {} },
  }),
  licensing: {},
  request: {},
} as any;

const baseQuery = {
  alert_started_at: '2024-01-01T00:00:00.000Z',
  'service.environment': undefined,
  'host.name': undefined,
  'kubernetes.pod.name': undefined,
  alert_rule_parameter_time_size: undefined,
  alert_rule_parameter_time_unit: undefined,
  'transaction.type': undefined,
  'transaction.name': undefined,
} as any;

const mockLogger = { error: jest.fn() } as any;

describe('getAlertDetailsContextHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildMocks();
    mockGetServiceName.mockResolvedValue(undefined);
    mockGetContainerId.mockResolvedValue(undefined);
  });

  describe('when no entity context is present', () => {
    it('does not invoke getLogRateAnalysisForAlert or getLogCategories', async () => {
      const handler = getAlertDetailsContextHandler(mockApmCore, mockResourcePlugins, mockLogger);

      await handler(mockRequestContext, {
        ...baseQuery,
        'host.name': undefined,
        'kubernetes.pod.name': undefined,
      });

      expect(mockLogRateAnalysis).not.toHaveBeenCalled();
      expect(mockLogCategories).not.toHaveBeenCalled();
    });
  });

  describe('when at least one entity is present', () => {
    it('invokes both getLogRateAnalysisForAlert and getLogCategories', async () => {
      const handler = getAlertDetailsContextHandler(mockApmCore, mockResourcePlugins, mockLogger);

      await handler(mockRequestContext, {
        ...baseQuery,
        'host.name': 'my-host',
      });

      expect(mockLogRateAnalysis).toHaveBeenCalledTimes(1);
      expect(mockLogCategories).toHaveBeenCalledTimes(1);
    });
  });
});
