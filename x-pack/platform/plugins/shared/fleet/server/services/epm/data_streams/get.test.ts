/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';

import { dataStreamService } from '../../data_streams';

import { getDataStreams } from './get';

jest.mock('../../data_streams', () => {
  return {
    dataStreamService: {
      getMatchingDataStreams: jest.fn().mockImplementation(async () => {
        return [
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
      }),
    },
  };
});

describe('getDataStreams', () => {
  it('Passes the correct parameters to the DataStreamService', async () => {
    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    await getDataStreams({
      esClient: esClientMock,
      type: 'logs',
      datasetQuery: 'nginx',
      sortOrder: 'asc',
      uncategorisedOnly: true,
    });
    expect(dataStreamService.getMatchingDataStreams).toHaveBeenCalledWith(expect.anything(), {
      type: 'logs',
      dataset: '*nginx*',
    });
  });
  describe('uncategorisedOnly option', () => {
    it('Returns the correct number of results when true', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        type: 'logs',
        datasetQuery: 'nginx',
        sortOrder: 'asc',
        uncategorisedOnly: true,
      });
      expect(results.items.length).toBe(1);
    });
    it('Returns the correct number of results when false', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        type: 'logs',
        datasetQuery: 'nginx',
        sortOrder: 'asc',
        uncategorisedOnly: false,
      });
      expect(results.items.length).toBe(5);
    });
  });
  describe('Can be sorted', () => {
    it('Ascending', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        type: 'logs',
        datasetQuery: 'nginx',
        sortOrder: 'asc',
        uncategorisedOnly: false,
      });
      expect(results.items[0].name).toBe('logs-elastic_agent-default');
    });
    it('Descending', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      const results = await getDataStreams({
        esClient: esClientMock,
        type: 'logs',
        datasetQuery: 'nginx',
        sortOrder: 'desc',
        uncategorisedOnly: false,
      });
      expect(results.items[0].name).toBe('logs-test.test-default');
    });
  });
  it('Formats the items correctly', async () => {
    const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
    const results = await getDataStreams({
      esClient: esClientMock,
      type: 'logs',
      datasetQuery: 'nginx',
      sortOrder: 'desc',
      uncategorisedOnly: false,
    });
    expect(results.items).toEqual([
      { name: 'logs-test.test-default' },
      { name: 'logs-elastic_agent.metricbeat-default' },
      { name: 'logs-elastic_agent.fleet_server-default' },
      { name: 'logs-elastic_agent.filebeat-default' },
      { name: 'logs-elastic_agent-default' },
    ]);
  });

  describe('profiles data stream type', () => {
    it('includes profiles-* data streams and filters out profiling-* data streams', async () => {
      const esClientMock = elasticsearchServiceMock.createElasticsearchClient();
      (dataStreamService.getMatchingDataStreams as jest.Mock).mockResolvedValueOnce([
        {
          name: 'profiles-generic.otel-default',
          timestamp_field: { name: '@timestamp' },
          indices: [],
          generation: 1,
          status: 'GREEN',
          template: 'profiles-generic.otel',
          hidden: false,
          system: false,
          allow_custom_routing: false,
          replicated: false,
        },
        {
          name: 'profiling-events-default',
          timestamp_field: { name: '@timestamp' },
          indices: [],
          generation: 1,
          status: 'GREEN',
          template: 'profiling-events',
          hidden: false,
          system: false,
          allow_custom_routing: false,
          replicated: false,
        },
      ]);

      const results = await getDataStreams({
        esClient: esClientMock,
        sortOrder: 'asc',
        uncategorisedOnly: false,
      });

      const names = results.items.map((s) => s.name);
      expect(names).toContain('profiles-generic.otel-default');
      expect(names).not.toContain('profiling-events-default');
    });
  });
});
