/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { applyActionListEsSearchMock } from '../mocks';
import { elasticsearchServiceMock } from '@kbn/core-elasticsearch-server-mocks';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { fetchActionResponses } from './fetch_action_responses';
import { BaseDataGenerator } from '../../../../../common/endpoint/data_generators/base_data_generator';
import { AGENT_ACTIONS_RESULTS_INDEX } from '@kbn/fleet-plugin/common';
import { ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN } from '../../../../../common/endpoint/constants';
import { ACTIONS_SEARCH_PAGE_SIZE } from '../constants';

describe('fetchActionResponses()', () => {
  let esClientMock: ElasticsearchClientMock;

  beforeEach(() => {
    esClientMock = elasticsearchServiceMock.createScopedClusterClient().asInternalUser;
    applyActionListEsSearchMock(esClientMock);
  });

  it('should return results', async () => {
    await expect(fetchActionResponses({ esClient: esClientMock })).resolves.toEqual({
      endpointResponses: [
        {
          action_id: '123',
          agent_id: 'agent-a',
          completed_at: '2022-04-30T10:53:59.449Z',
          error: '',
          '@timestamp': '2022-04-30T16:08:47.449Z',
          action_data: {
            command: expect.any(String),
            comment: '',
            parameter: undefined,
          },
          started_at: '2022-04-30T12:56:00.449Z',
        },
        {
          '@timestamp': '2022-04-30T16:08:47.449Z',
          EndpointActions: {
            action_id: '123',
            completed_at: '2022-04-30T10:53:59.449Z',
            data: {
              command: expect.any(String),
              comment: '',
              output: {
                content: expect.anything(),
                type: 'json',
              },
            },
            started_at: '2022-04-30T12:56:00.449Z',
          },
          agent: {
            id: 'agent-a',
          },
          error: undefined,
        },
      ],
      fleetResponses: [
        {
          '@timestamp': '2022-04-30T16:08:47.449Z',
          action_data: {
            command: expect.any(String),
            comment: '',
            parameter: undefined,
          },
          action_id: '123',
          agent_id: 'agent-a',
          completed_at: '2022-04-30T10:53:59.449Z',
          error: '',
          started_at: '2022-04-30T12:56:00.449Z',
        },
        {
          '@timestamp': '2022-04-30T16:08:47.449Z',
          EndpointActions: {
            action_id: '123',
            completed_at: '2022-04-30T10:53:59.449Z',
            data: {
              command: expect.any(String),
              comment: '',
              output: {
                content: expect.anything(),
                type: 'json',
              },
            },
            started_at: '2022-04-30T12:56:00.449Z',
          },
          agent: {
            id: 'agent-a',
          },
          error: undefined,
        },
      ],
    });
  });

  it('should return empty array with no responses exist', async () => {
    applyActionListEsSearchMock(esClientMock, undefined, BaseDataGenerator.toEsSearchResponse([]));

    await expect(fetchActionResponses({ esClient: esClientMock })).resolves.toEqual({
      endpointResponses: [],
      fleetResponses: [],
    });
  });

  it('should query both fleet and endpoint indexes', async () => {
    await fetchActionResponses({ esClient: esClientMock });
    const expectedQuery = {
      query: {
        bool: {
          filter: [],
        },
      },
    };

    expect(esClientMock.search).toHaveBeenCalledWith(
      { index: AGENT_ACTIONS_RESULTS_INDEX, size: ACTIONS_SEARCH_PAGE_SIZE, ...expectedQuery },
      { ignore: [404] }
    );
    expect(esClientMock.search).toHaveBeenCalledWith(
      {
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        size: ACTIONS_SEARCH_PAGE_SIZE,
        ...expectedQuery,
      },
      { ignore: [404] }
    );
  });

  it('should query CCS-prefixed response indexes when ccsEnabled is true', async () => {
    await fetchActionResponses({ esClient: esClientMock, ccsEnabled: true });

    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: `${AGENT_ACTIONS_RESULTS_INDEX},*:${AGENT_ACTIONS_RESULTS_INDEX}`,
      }),
      { ignore: [404] }
    );
    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: `${ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN},*:${ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN}`,
      }),
      { ignore: [404] }
    );
  });

  it('should filter by agentIds', async () => {
    await fetchActionResponses({ esClient: esClientMock, agentIds: ['a', 'b', 'c'] });
    const expectedQuery = {
      query: { bool: { filter: [{ terms: { agent_id: ['a', 'b', 'c'] } }] } },
    };

    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({ index: AGENT_ACTIONS_RESULTS_INDEX, ...expectedQuery }),
      { ignore: [404] }
    );
    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        ...expectedQuery,
      }),
      { ignore: [404] }
    );
  });

  it('should filter by action ids', async () => {
    await fetchActionResponses({ esClient: esClientMock, actionIds: ['a', 'b', 'c'] });
    const expectedQuery = {
      query: { bool: { filter: [{ terms: { action_id: ['a', 'b', 'c'] } }] } },
    };

    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({ index: AGENT_ACTIONS_RESULTS_INDEX, ...expectedQuery }),
      { ignore: [404] }
    );
    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        ...expectedQuery,
      }),
      { ignore: [404] }
    );
  });

  it('should filter by both agent and action ids', async () => {
    await fetchActionResponses({
      esClient: esClientMock,
      agentIds: ['1', '2'],
      actionIds: ['a', 'b', 'c'],
    });
    const expectedQuery = {
      query: {
        bool: {
          filter: [{ terms: { agent_id: ['1', '2'] } }, { terms: { action_id: ['a', 'b', 'c'] } }],
        },
      },
    };

    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({ index: AGENT_ACTIONS_RESULTS_INDEX, ...expectedQuery }),
      { ignore: [404] }
    );
    expect(esClientMock.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        ...expectedQuery,
      }),
      { ignore: [404] }
    );
  });
});
