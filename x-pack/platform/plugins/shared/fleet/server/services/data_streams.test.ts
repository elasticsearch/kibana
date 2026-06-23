/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';

import { dataStreamService } from './data_streams';

describe('DataStreamService', () => {
  describe('getAllFleetDataStreamNames', () => {
    it('returns the names of all Fleet data streams', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.transport.request.mockResolvedValue({
        data_streams: [{ name: 'logs-system.cpu-default' }, { name: 'logs-system.cpu-production' }],
      });

      const result = await dataStreamService.getAllFleetDataStreamNames(esClient);

      expect(result).toEqual(['logs-system.cpu-default', 'logs-system.cpu-production']);
    });

    it('calls the _data_stream API with filter_path=data_streams.name', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.transport.request.mockResolvedValue({ data_streams: [] });

      await dataStreamService.getAllFleetDataStreamNames(esClient);

      expect(esClient.transport.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/_data_stream/logs-*-*,metrics-*-*,traces-*-*,synthetics-*-*,profiling-*,profiles-*',
          querystring: { filter_path: 'data_streams.name' },
        })
      );
    });

    it('returns an empty array when the response contains no data streams', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();
      esClient.transport.request.mockResolvedValue({});

      const result = await dataStreamService.getAllFleetDataStreamNames(esClient);

      expect(result).toEqual([]);
    });
  });
});
