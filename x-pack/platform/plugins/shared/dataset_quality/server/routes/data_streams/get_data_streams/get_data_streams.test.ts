/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import { dataStreamService, datasetQualityPrivileges } from '../../../services';

import { getDataStreams } from '.';

const mockGetMockMatchingDataStreams = jest.fn().mockImplementation(() => MATCHING_DATA_STREAMS);
const mockGetDatasetPrivileges = jest.fn().mockImplementation(() => ({
  datasetsPrivilages: {
    'logs-*-*': {
      canRead: true,
      canMonitor: true,
      canReadFailureStore: true,
    },
    'metrics-*-*': {
      canRead: true,
      canMonitor: true,
      canReadFailureStore: true,
    },
  },
}));
const mockGetMockDataStreamPrivileges = jest.fn().mockImplementation(() => DATA_STREAMS_PRIVILEGES);

describe('getDataStreams', () => {
  beforeAll(() => {
    // Mock dataStreamService
    jest
      .spyOn(dataStreamService, 'getMatchingDataStreams')
      .mockImplementation(mockGetMockMatchingDataStreams);
    jest
      .spyOn(datasetQualityPrivileges, 'getDatasetPrivileges')
      .mockImplementation(mockGetDatasetPrivileges);
    jest
      .spyOn(datasetQualityPrivileges, 'getHasIndexPrivileges')
      .mockImplementation(mockGetMockDataStreamPrivileges);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Passes the correct parameters to the DataStreamService', async () => {
    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const result = await getDataStreams({
      esClient: esClientMock,
      types: ['logs', 'metrics'],
      uncategorisedOnly: true,
      isSecurityEnabled: true,
    });
    expect(dataStreamService.getMatchingDataStreams).toHaveBeenCalledWith(
      expect.anything(),
      'logs-*-*,metrics-*-*'
    );

    expect(result.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).toBe(true);
    expect(result.datasetUserPrivileges.datasetsPrivilages['metrics-*-*'].canMonitor).toBe(true);
  });

  it('Passes datasetQuery parameter to the DataStreamService', async () => {
    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const result = await getDataStreams({
      esClient: esClientMock,
      datasetQuery: 'logs-nginx-*',
      uncategorisedOnly: true,
      isSecurityEnabled: true,
    });
    expect(dataStreamService.getMatchingDataStreams).toHaveBeenCalledWith(
      expect.anything(),
      'logs-nginx-*'
    );

    expect(result.datasetUserPrivileges.datasetsPrivilages['logs-*-*'].canMonitor).toBe(true);
  });

  it('requests only monitor (not view_index_metadata) per stream and maps canMonitor from it', async () => {
    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const result = await getDataStreams({
      esClient: esClientMock,
      types: ['logs'],
      uncategorisedOnly: false,
      isSecurityEnabled: true,
    });

    expect(datasetQualityPrivileges.getHasIndexPrivileges).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.arrayContaining(['monitor']),
      true
    );
    expect(datasetQualityPrivileges.getHasIndexPrivileges).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.not.arrayContaining(['view_index_metadata']),
      true
    );

    result.dataStreams.forEach((stream) => {
      expect(stream.userPrivileges.canMonitor).toBe(true);
    });
  });

  it('sets canMonitor false when monitor privilege is absent', async () => {
    mockGetMockDataStreamPrivileges.mockResolvedValueOnce(
      Object.fromEntries(MATCHING_DATA_STREAMS.map(({ name }) => [name, { monitor: false }]))
    );

    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const result = await getDataStreams({
      esClient: esClientMock,
      types: ['logs'],
      uncategorisedOnly: false,
      isSecurityEnabled: true,
    });

    result.dataStreams.forEach((stream) => {
      expect(stream.userPrivileges.canMonitor).toBe(false);
    });
  });

  it('Returns data streams even when wildcard canMonitor is false', async () => {
    mockGetDatasetPrivileges.mockResolvedValueOnce({
      datasetsPrivilages: {
        'logs-*-*': {
          canRead: true,
          canMonitor: false,
          canReadFailureStore: false,
        },
      },
    });

    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const result = await getDataStreams({
      esClient: esClientMock,
      types: ['logs'],
      uncategorisedOnly: false,
      isSecurityEnabled: true,
    });

    expect(result.dataStreams.length).toBe(5);
    expect(dataStreamService.getMatchingDataStreams).toHaveBeenCalled();
  });

  describe('uncategorized only option', () => {
    it('Returns the correct number of results when true', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        types: ['logs'],
        uncategorisedOnly: true,
        isSecurityEnabled: true,
      });
      expect(results.dataStreams.length).toBe(1);
    });
    it('Returns the correct number of results when false', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        types: ['logs'],
        uncategorisedOnly: false,
        isSecurityEnabled: true,
      });
      expect(results.dataStreams.length).toBe(5);
    });
  });
});

const MATCHING_DATA_STREAMS = [
  {
    name: 'logs-elastic_agent-default',
    timestamp_field: { name: '@timestamp' },
    indices: [
      {
        index_name: '.ds-logs-elastic_agent-default-2023.05.17-000001',
        index_uuid: 'EcqQR36PTNCKVnfAftq_Rw',
      },
    ],
    generation: 1,
    _meta: { managed_by: 'fleet', managed: true, package: { name: 'elastic_agent' } },
    status: 'YELLOW',
    template: 'logs-elastic_agent',
    ilm_policy: 'logs',
    hidden: false,
    system: false,
    allow_custom_routing: false,
    replicated: false,
  },
  {
    name: 'logs-elastic_agent.filebeat-default',
    timestamp_field: { name: '@timestamp' },
    indices: [
      {
        index_name: '.ds-logs-elastic_agent.filebeat-default-2023.05.17-000001',
        index_uuid: 'v5uEn55TRrurU3Bf4CBtzw',
      },
    ],
    generation: 1,
    _meta: { managed_by: 'fleet', managed: true, package: { name: 'elastic_agent' } },
    status: 'YELLOW',
    template: 'logs-elastic_agent.filebeat',
    ilm_policy: 'logs',
    hidden: false,
    system: false,
    allow_custom_routing: false,
    replicated: false,
  },
  {
    name: 'logs-elastic_agent.fleet_server-default',
    timestamp_field: { name: '@timestamp' },
    indices: [
      {
        index_name: '.ds-logs-elastic_agent.fleet_server-default-2023.05.17-000001',
        index_uuid: 'nThe6dkaQnagAlyNsAyYsA',
      },
    ],
    generation: 1,
    _meta: { managed_by: 'fleet', managed: true, package: { name: 'elastic_agent' } },
    status: 'YELLOW',
    template: 'logs-elastic_agent.fleet_server',
    ilm_policy: 'logs',
    hidden: false,
    system: false,
    allow_custom_routing: false,
    replicated: false,
  },
  {
    name: 'logs-elastic_agent.metricbeat-default',
    timestamp_field: { name: '@timestamp' },
    indices: [
      {
        index_name: '.ds-logs-elastic_agent.metricbeat-default-2023.05.17-000001',
        index_uuid: 'Y5vQ7V6-QSSMM-CPdqOkCg',
      },
    ],
    generation: 1,
    _meta: { managed_by: 'fleet', managed: true, package: { name: 'elastic_agent' } },
    status: 'YELLOW',
    template: 'logs-elastic_agent.metricbeat',
    ilm_policy: 'logs',
    hidden: false,
    system: false,
    allow_custom_routing: false,
    replicated: false,
  },
  {
    name: 'logs-test.test-default',
    timestamp_field: { name: '@timestamp' },
    indices: [
      {
        index_name: '.ds-logs-elastic_agent.metricbeat-default-2023.05.17-000001',
        index_uuid: 'Y5vQ7V6-QSSMM-CPdqOkCg',
      },
    ],
  },
];

const DATA_STREAMS_PRIVILEGES = Object.values(MATCHING_DATA_STREAMS).reduce((acc, stream) => {
  acc[stream.name] = { monitor: true };
  return acc;
}, {} as Record<string, { monitor: boolean }>);
