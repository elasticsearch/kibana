/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { of } from 'rxjs';
import type { CoreSetup } from '@kbn/core/server';
import { executor, getValidTimefieldSort, tryToParseAsDate } from './executor';
import type { ExecutorOptions } from './types';
import type { Comparator } from '../../../common/comparator_types';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { createSearchSourceMock } from '@kbn/data-plugin/common/search/search_source/mocks';
import type { ISearchStartSearchSource } from '@kbn/data-plugin/common';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';
import type { FetchEsQueryOpts } from './lib/fetch_es_query';
import type { FetchSearchSourceQueryOpts } from './lib/fetch_search_source_query';
import type { FetchEsqlQueryOpts } from './lib/fetch_esql_query';
import { ALERT_GROUPING } from '@kbn/rule-data-utils';

const logger = loggerMock.create();
const scopedClusterClientMock = elasticsearchServiceMock.createScopedClusterClient();
const createSearchSourceClientMock = () => {
  const searchSourceMock = createSearchSourceMock();
  searchSourceMock.fetch$ = jest.fn().mockImplementation(() => of({ rawResponse: { took: 5 } }));

  return {
    searchSourceMock,
    searchSourceClientMock: {
      create: jest.fn().mockReturnValue(searchSourceMock),
      createEmpty: jest.fn().mockReturnValue(searchSourceMock),
    } as unknown as ISearchStartSearchSource,
  };
};

const { searchSourceClientMock } = createSearchSourceClientMock();

const mockFetchEsQuery = jest.fn();
jest.mock('./lib/fetch_es_query', () => ({
  fetchEsQuery: (...args: [FetchEsQueryOpts]) => mockFetchEsQuery(...args),
}));
const mockFetchSearchSourceQuery = jest.fn();
jest.mock('./lib/fetch_search_source_query', () => ({
  fetchSearchSourceQuery: (...args: [FetchSearchSourceQueryOpts]) =>
    mockFetchSearchSourceQuery(...args),
}));
const mockFetchEsqlQuery = jest.fn();
jest.mock('./lib/fetch_esql_query', () => ({
  fetchEsqlQuery: (...args: [FetchEsqlQueryOpts]) => mockFetchEsqlQuery(...args),
}));

const mockGetRecoveredAlerts = jest.fn().mockReturnValue([]);
const mockSetLimitReached = jest.fn();
const mockReport = jest.fn();
const mockSetAlertData = jest.fn();
const mockGetAlertLimitValue = jest.fn().mockReturnValue(1000);

const mockAlertClient = {
  report: mockReport,
  getAlertLimitValue: mockGetAlertLimitValue,
  setAlertLimitReached: mockSetLimitReached,
  getRecoveredAlerts: mockGetRecoveredAlerts,
  setAlertData: mockSetAlertData,
};

const mockNow = jest.getRealSystemTime();

describe('es_query executor', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const defaultProps = {
    size: 3,
    timeWindowSize: 5,
    timeWindowUnit: 'm',
    threshold: [],
    thresholdComparator: '>=' as Comparator,
    esQuery: '{ "query": "test-query" }',
    index: ['test-index'],
    timeField: '',
    searchType: 'esQuery',
    excludeHitsFromPreviousRun: true,
    aggType: 'count',
    groupBy: 'all',
    searchConfiguration: {},
    esqlQuery: { esql: 'test-query' },
  };

  describe('executor', () => {
    const services = {
      scopedClusterClient: scopedClusterClientMock,
      savedObjectsClient: {
        get: () => ({ attributes: { consumer: 'alerts' } }),
      },
      getSearchSourceClient: jest.fn().mockResolvedValue(searchSourceClientMock),
      alertsClient: mockAlertClient,
      alertWithLifecycle: jest.fn(),
      logger,
      shouldWriteAlerts: () => true,
      getDataViews: jest.fn(),
    };
    const coreMock = {
      http: { basePath: { publicBaseUrl: 'https://localhost:5601' } },
    } as CoreSetup;
    const defaultExecutorOptions = {
      params: defaultProps,
      services,
      rule: { id: 'test-rule-id', name: 'test-rule-name' },
      state: { latestTimestamp: undefined },
      spaceId: 'default',
      logger,
      getTimeRange: () => {
        const date = new Date(Date.now()).toISOString();
        return { dateStart: date, dateEnd: date };
      },
    } as unknown as ExecutorOptions<EsQueryRuleParams>;

    it('should throw error for invalid comparator', async () => {
      await expect(() =>
        executor(
          coreMock,
          {
            ...defaultExecutorOptions,
            // @ts-expect-error
            params: { ...defaultProps, thresholdComparator: '?' },
          },
          []
        )
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"invalid thresholdComparator specified: ?"`);
    });

    it('should call fetchEsQuery if searchType is esQuery', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
      });
      await executor(coreMock, defaultExecutorOptions, []);
      expect(mockFetchEsQuery).toHaveBeenCalledWith({
        ruleId: 'test-rule-id',
        name: 'test-rule-name',
        alertLimit: 1000,
        params: defaultProps,
        spacePrefix: '',
        timestamp: undefined,
        services: {
          scopedClusterClient: scopedClusterClientMock,
          logger,
        },
        dateStart: new Date().toISOString(),
        dateEnd: new Date().toISOString(),
        sourceFields: [],
      });
      expect(mockFetchSearchSourceQuery).not.toHaveBeenCalled();
    });

    it('should call fetchSearchSourceQuery if searchType is searchSource', async () => {
      mockFetchSearchSourceQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          params: { ...defaultProps, searchType: 'searchSource' },
        },
        []
      );
      expect(mockFetchSearchSourceQuery).toHaveBeenCalledWith({
        ruleId: 'test-rule-id',
        alertLimit: 1000,
        params: { ...defaultProps, searchType: 'searchSource' },
        latestTimestamp: undefined,
        services: {
          getSearchSourceClient: expect.any(Function),
          getDataViews: expect.any(Function),
          logger,
          share: undefined,
        },
        spacePrefix: '',
        dateStart: new Date().toISOString(),
        dateEnd: new Date().toISOString(),
        sourceFields: [],
      });
      expect(mockFetchEsQuery).not.toHaveBeenCalled();
    });

    it('should call fetchEsqlQuery if searchType is esqlQuery', async () => {
      mockFetchEsqlQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          params: { ...defaultProps, searchType: 'esqlQuery' },
        },
        []
      );
      expect(mockFetchEsqlQuery).toHaveBeenCalledWith({
        ruleId: 'test-rule-id',
        alertLimit: 1000,
        params: { ...defaultProps, searchType: 'esqlQuery' },
        services: {
          scopedClusterClient: scopedClusterClientMock,
          logger,
          share: undefined,
        },
        spacePrefix: '',
        dateStart: new Date().toISOString(),
        dateEnd: new Date().toISOString(),
        sourceFields: [],
      });
      expect(mockFetchEsQuery).not.toHaveBeenCalled();
      expect(mockFetchSearchSourceQuery).not.toHaveBeenCalled();
    });

    it('should not create alert if compare function returns false for ungrouped alert', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: { ...defaultProps, threshold: [500], thresholdComparator: '>=' as Comparator },
        },
        []
      );

      expect(mockReport).not.toHaveBeenCalled();
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should create alert if compare function returns true for ungrouped alert', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: { ...defaultProps, threshold: [200], thresholdComparator: '>=' as Comparator },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenNthCalledWith(1, {
        actionGroup: 'query matched',
        context: {
          conditions: 'Number of matching documents is greater than or equal to 200',
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message: 'Document count is 491 in the last 5m. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' matched query",
          value: 491,
        },
        id: 'query matched',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents is greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '491',
          'kibana.alert.reason':
            'Document count is 491 in the last 5m. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' matched query",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should create alert if compare function returns true for ungrouped alert for multi threshold param', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200, 500],
            thresholdComparator: 'between' as Comparator,
          },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenNthCalledWith(1, {
        actionGroup: 'query matched',
        context: {
          conditions: 'Number of matching documents is between 200 and 500',
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message: 'Document count is 491 in the last 5m. Alert when between 200 and 500.',
          title: "rule 'test-rule-name' matched query",
          value: 491,
        },
        id: 'query matched',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents is between 200 and 500',
          'kibana.alert.evaluation.threshold': null,
          'kibana.alert.evaluation.value': '491',
          'kibana.alert.reason':
            'Document count is 491 in the last 5m. Alert when between 200 and 500.',
          'kibana.alert.title': "rule 'test-rule-name' matched query",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should create as many alerts as number of results in parsedResults for grouped alert', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'host-1',
              groups: [{ field: 'host.name', value: 'host-1' }],
              count: 291,
              hits: [],
              groupingObject: {
                ['host.name']: 'host-1',
              },
            },
            {
              group: 'host-2',
              groups: [{ field: 'host.name', value: 'host-2' }],
              count: 477,
              hits: [],
              groupingObject: {
                ['host.name']: 'host-2',
              },
            },
            {
              group: 'host-3',
              groups: [{ field: 'host.name', value: 'host-3' }],
              count: 999,
              hits: [],
              groupingObject: {
                ['host.name']: 'host-3',
              },
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200],
            thresholdComparator: '>=' as Comparator,
            groupBy: 'top',
            termSize: 10,
            termField: 'host.name',
          },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(3);
      expect(mockReport).toHaveBeenNthCalledWith(1, {
        actionGroup: 'query matched',
        context: {
          conditions:
            'Number of matching documents for group "host-1" is greater than or equal to 200',
          date: new Date(mockNow).toISOString(),
          grouping: {
            host: {
              name: 'host-1',
            },
          },
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 291 in the last 5m for host-1. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' matched query for group host-1",
          value: 291,
        },
        id: 'host-1',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'host.name': 'host-1',
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-1" is greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '291',
          'kibana.alert.reason':
            'Document count is 291 in the last 5m for host-1. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' matched query for group host-1",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          'kibana.alert.grouping': { host: { name: 'host-1' } },
        },
      });
      expect(mockReport).toHaveBeenNthCalledWith(2, {
        actionGroup: 'query matched',
        context: {
          conditions:
            'Number of matching documents for group "host-2" is greater than or equal to 200',
          date: new Date(mockNow).toISOString(),
          grouping: {
            host: {
              name: 'host-2',
            },
          },
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 477 in the last 5m for host-2. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' matched query for group host-2",
          value: 477,
        },
        id: 'host-2',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'host.name': 'host-2',
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-2" is greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '477',
          'kibana.alert.reason':
            'Document count is 477 in the last 5m for host-2. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' matched query for group host-2",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          'kibana.alert.grouping': { host: { name: 'host-2' } },
        },
      });
      expect(mockReport).toHaveBeenNthCalledWith(3, {
        actionGroup: 'query matched',
        context: {
          conditions:
            'Number of matching documents for group "host-3" is greater than or equal to 200',
          date: new Date(mockNow).toISOString(),
          grouping: {
            host: {
              name: 'host-3',
            },
          },
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 999 in the last 5m for host-3. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' matched query for group host-3",
          value: 999,
        },
        id: 'host-3',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'host.name': 'host-3',
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-3" is greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '999',
          'kibana.alert.reason':
            'Document count is 999 in the last 5m for host-3. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' matched query for group host-3",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          'kibana.alert.grouping': { host: { name: 'host-3' } },
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should create alert if there are hits for ESQL alert', async () => {
      mockFetchEsqlQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 198,
              hits: [],
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          params: {
            ...defaultProps,
            searchType: 'esqlQuery',
            threshold: [0],
            thresholdComparator: '>=' as Comparator,
          },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenNthCalledWith(1, {
        actionGroup: 'query matched',
        context: {
          conditions: 'Query matched documents',
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message: 'Document count is 198 in the last 5m. Alert when greater than or equal to 0.',
          title: "rule 'test-rule-name' matched query",
          value: 198,
        },
        id: 'query matched',
        payload: {
          'kibana.alert.evaluation.conditions': 'Query matched documents',
          'kibana.alert.evaluation.threshold': 0,
          'kibana.alert.evaluation.value': '198',
          'kibana.alert.reason':
            'Document count is 198 in the last 5m. Alert when greater than or equal to 0.',
          'kibana.alert.title': "rule 'test-rule-name' matched query",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should set limit as reached if results are truncated', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'host-1',
              count: 291,
              hits: [],
            },
            {
              group: 'host-2',
              count: 477,
              hits: [],
            },
            {
              group: 'host-3',
              count: 999,
              hits: [],
            },
          ],
          truncated: true,
        },
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200],
            thresholdComparator: '>=' as Comparator,
            groupBy: 'top',
            termSize: 10,
            termField: 'host.name',
          },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(3);
      expect(mockReport).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'host-1' }));
      expect(mockReport).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'host-2' }));
      expect(mockReport).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'host-3' }));
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(true);
    });

    it('should correctly handle recovered alerts for ungrouped alert', async () => {
      mockGetRecoveredAlerts.mockReturnValueOnce([
        {
          alert: {
            getId: () => 'query matched',
          },
        },
      ]);
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'all documents',
              count: 491,
              hits: [],
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: { ...defaultProps, threshold: [500], thresholdComparator: '>=' as Comparator },
        },
        []
      );

      expect(mockReport).not.toHaveBeenCalled();
      expect(mockSetAlertData).toHaveBeenCalledTimes(1);
      expect(mockSetAlertData).toHaveBeenNthCalledWith(1, {
        id: 'query matched',
        context: {
          conditions: 'Number of matching documents is NOT greater than or equal to 500',
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message: 'Document count is 0 in the last 5m. Alert when greater than or equal to 500.',
          title: "rule 'test-rule-name' recovered",
          value: 0,
          sourceFields: {},
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents is NOT greater than or equal to 500',
          'kibana.alert.evaluation.threshold': 500,
          'kibana.alert.evaluation.value': '0',
          'kibana.alert.reason':
            'Document count is 0 in the last 5m. Alert when greater than or equal to 500.',
          'kibana.alert.title': "rule 'test-rule-name' recovered",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should correctly handle recovered alerts for grouped alerts', async () => {
      mockGetRecoveredAlerts.mockReturnValueOnce([
        {
          alert: {
            getId: () => 'host-1',
          },
          hit: {
            [ALERT_GROUPING]: {
              host: {
                name: 'host-1',
              },
            },
          },
        },
        {
          alert: {
            getId: () => 'host-2',
          },
          hit: {
            [ALERT_GROUPING]: {
              host: {
                name: 'host-2',
              },
            },
          },
        },
      ]);
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: { results: [], truncated: false },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200],
            thresholdComparator: '>=' as Comparator,
            groupBy: 'top',
            termSize: 10,
            termField: 'host.name',
          },
        },
        []
      );

      expect(mockReport).not.toHaveBeenCalled();
      expect(mockSetAlertData).toHaveBeenCalledTimes(2);
      expect(mockSetAlertData).toHaveBeenNthCalledWith(1, {
        id: 'host-1',
        context: {
          conditions: `Number of matching documents for group "host-1" is NOT greater than or equal to 200`,
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 0 in the last 5m for host-1. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' recovered",
          value: 0,
          sourceFields: {},
          grouping: {
            host: {
              name: 'host-1',
            },
          },
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-1" is NOT greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '0',
          'kibana.alert.reason':
            'Document count is 0 in the last 5m for host-1. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' recovered",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetAlertData).toHaveBeenNthCalledWith(2, {
        id: 'host-2',
        context: {
          conditions: `Number of matching documents for group "host-2" is NOT greater than or equal to 200`,
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 0 in the last 5m for host-2. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' recovered",
          value: 0,
          sourceFields: {},
          grouping: {
            host: {
              name: 'host-2',
            },
          },
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-2" is NOT greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '0',
          'kibana.alert.reason':
            'Document count is 0 in the last 5m for host-2. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' recovered",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should correctly handle recovered alerts for ESQL alert', async () => {
      mockGetRecoveredAlerts.mockReturnValueOnce([
        {
          alert: {
            getId: () => 'query matched',
          },
        },
      ]);
      mockFetchEsqlQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          params: {
            ...defaultProps,
            searchType: 'esqlQuery',
            threshold: [0],
            thresholdComparator: '>' as Comparator,
          },
        },
        []
      );

      expect(mockReport).not.toHaveBeenCalled();
      expect(mockSetAlertData).toHaveBeenCalledTimes(1);
      expect(mockSetAlertData).toHaveBeenNthCalledWith(1, {
        id: 'query matched',
        context: {
          conditions: 'Query did NOT match documents',
          date: new Date(mockNow).toISOString(),
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message: 'Document count is 0 in the last 5m. Alert when greater than 0.',
          title: "rule 'test-rule-name' recovered",
          value: 0,
          sourceFields: {},
        },
        payload: {
          'kibana.alert.evaluation.conditions': 'Query did NOT match documents',
          'kibana.alert.evaluation.threshold': 0,
          'kibana.alert.evaluation.value': '0',
          'kibana.alert.reason': 'Document count is 0 in the last 5m. Alert when greater than 0.',
          'kibana.alert.title': "rule 'test-rule-name' recovered",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });

    it('should populate sourceFields in recovery context from persisted alert document', async () => {
      mockGetRecoveredAlerts.mockReturnValueOnce([
        {
          alert: {
            getId: () => 'host-1',
          },
          hit: {
            [ALERT_GROUPING]: { host: { name: 'host-1' } },
            'host.hostname': ['host-1'],
            'host.id': ['1'],
            'host.name': ['host-1'],
          },
        },
      ]);
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: { results: [], truncated: false },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });

      const candidateSourceFields = [
        { label: 'host.hostname', searchPath: 'host.hostname.keyword' },
        { label: 'host.id', searchPath: 'host.id.keyword' },
        { label: 'host.name', searchPath: 'host.name.keyword' },
      ];

      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200],
            thresholdComparator: '>=' as Comparator,
            groupBy: 'top',
            termSize: 10,
            termField: 'host.name',
          },
        },
        candidateSourceFields
      );

      expect(mockReport).not.toHaveBeenCalled();
      expect(mockSetAlertData).toHaveBeenCalledTimes(1);
      expect(mockSetAlertData).toHaveBeenNthCalledWith(1, {
        id: 'host-1',
        context: expect.objectContaining({
          sourceFields: {
            'host.hostname': ['host-1'],
            'host.id': ['1'],
            'host.name': ['host-1'],
          },
          grouping: { host: { name: 'host-1' } },
        }),
        payload: expect.any(Object),
      });
    });

    it('should correctly handle alerts with sourceFields', async () => {
      mockFetchEsQuery.mockResolvedValueOnce({
        parsedResults: {
          results: [
            {
              group: 'host-1',
              count: 291,
              hits: [],
              sourceFields: {
                'host.hostname': ['host-1'],
                'host.id': ['1'],
                'host.name': ['host-1'],
              },
              groupingObject: {
                host: {
                  name: 'host-1',
                },
              },
            },
          ],
          truncated: false,
        },
        link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
      });
      await executor(
        coreMock,
        {
          ...defaultExecutorOptions,
          // @ts-expect-error
          params: {
            ...defaultProps,
            threshold: [200],
            thresholdComparator: '>=' as Comparator,
            groupBy: 'top',
            termSize: 10,
            termField: 'host.name',
          },
        },
        []
      );

      expect(mockReport).toHaveBeenCalledTimes(1);
      expect(mockReport).toHaveBeenNthCalledWith(1, {
        actionGroup: 'query matched',
        context: {
          conditions:
            'Number of matching documents for group "host-1" is greater than or equal to 200',
          date: new Date(mockNow).toISOString(),
          grouping: {
            host: {
              name: 'host-1',
            },
          },
          hits: [],
          link: 'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          message:
            'Document count is 291 in the last 5m for host-1. Alert when greater than or equal to 200.',
          title: "rule 'test-rule-name' matched query for group host-1",
          value: 291,
          sourceFields: {
            'host.hostname': ['host-1'],
            'host.id': ['1'],
            'host.name': ['host-1'],
          },
        },
        id: 'host-1',
        state: {
          dateEnd: new Date(mockNow).toISOString(),
          dateStart: new Date(mockNow).toISOString(),
          latestTimestamp: undefined,
        },
        payload: {
          'kibana.alert.evaluation.conditions':
            'Number of matching documents for group "host-1" is greater than or equal to 200',
          'kibana.alert.evaluation.threshold': 200,
          'kibana.alert.evaluation.value': '291',
          'kibana.alert.grouping': { host: { name: 'host-1' } },
          'kibana.alert.reason':
            'Document count is 291 in the last 5m for host-1. Alert when greater than or equal to 200.',
          'kibana.alert.title': "rule 'test-rule-name' matched query for group host-1",
          'kibana.alert.url':
            'https://localhost:5601/app/management/insightsAndAlerting/triggersActions/rule/test-rule-id',
          'host.hostname': ['host-1'],
          'host.id': ['1'],
          'host.name': ['host-1'],
        },
      });
      expect(mockSetLimitReached).toHaveBeenCalledTimes(1);
      expect(mockSetLimitReached).toHaveBeenCalledWith(false);
    });
  });

  describe('tryToParseAsDate', () => {
    it.each<[string | number]>([['2019-01-01T00:00:00.000Z'], [1546300800000]])(
      'should parse as date correctly',
      (value) => {
        expect(tryToParseAsDate(value)).toBe('2019-01-01T00:00:00.000Z');
      }
    );
    it.each<[string | null | undefined]>([[null], ['invalid date'], [undefined]])(
      'should not parse as date',
      (value) => {
        expect(tryToParseAsDate(value)).toBe(undefined);
      }
    );
  });

  describe('getValidTimefieldSort', () => {
    it('should return valid time field', () => {
      const result = getValidTimefieldSort([
        null,
        'invalid date',
        '2018-12-31T19:00:00.000Z',
        1546282800000,
      ]);
      expect(result).toEqual('2018-12-31T19:00:00.000Z');
    });
  });
});
