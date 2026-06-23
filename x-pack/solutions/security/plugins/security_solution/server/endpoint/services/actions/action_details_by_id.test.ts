/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import type { estypes } from '@elastic/elasticsearch';
import type {
  EndpointActionResponse,
  LogsEndpointAction,
  LogsEndpointActionResponse,
} from '../../../../common/endpoint/types';
import { EndpointActionGenerator } from '../../../../common/endpoint/data_generators/endpoint_action_generator';
import { getActionDetailsById } from '..';
import { NotFoundError } from '../../errors';
import {
  applyActionsEsSearchMock,
  createActionRequestsEsSearchResultsMock,
  createActionResponsesEsSearchResultsMock,
} from './mocks';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { createMockEndpointAppContextService } from '../../mocks';
import { FleetAgentGenerator } from '../../../../common/endpoint/data_generators/fleet_agent_generator';

describe('When using `getActionDetailsById()', () => {
  let esClient: ElasticsearchClientMock;
  let endpointActionGenerator: EndpointActionGenerator;
  let actionRequests: estypes.SearchResponse<LogsEndpointAction>;
  let actionResponses: estypes.SearchResponse<EndpointActionResponse | LogsEndpointActionResponse>;
  let endpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    endpointAppContextService = createMockEndpointAppContextService();
    esClient = endpointAppContextService.getInternalEsClient() as ElasticsearchClientMock;
    endpointActionGenerator = new EndpointActionGenerator('seed');
    actionRequests = createActionRequestsEsSearchResultsMock();
    actionResponses = createActionResponsesEsSearchResultsMock();

    applyActionsEsSearchMock(esClient, actionRequests, actionResponses);
    (
      endpointAppContextService.getInternalFleetServices().ensureInCurrentSpace as jest.Mock
    ).mockResolvedValue(undefined);
  });

  it('should return expected output', async () => {
    (
      endpointAppContextService.getInternalFleetServices().agent.getByIds as jest.Mock
    ).mockResolvedValue([
      new FleetAgentGenerator('seed').generate({
        id: 'agent-a',
        local_metadata: {
          host: {
            name: 'Host-agent-a',
          },
        },
      }),
    ]);
    const doc = actionRequests.hits.hits[0]._source;
    await expect(
      getActionDetailsById(endpointAppContextService, 'default', '123')
    ).resolves.toEqual({
      action: '123',
      agents: ['agent-a'],
      agentType: 'endpoint',
      hosts: { 'agent-a': { name: 'Host-agent-a' } },
      command: expect.any(String),
      completedAt: '2022-04-30T16:08:47.449Z',
      wasSuccessful: true,
      wasCanceled: false,
      errors: undefined,
      id: '123',
      isCompleted: true,
      isExpired: false,
      startedAt: '2022-04-27T16:08:47.449Z',
      comment: doc?.EndpointActions.data.comment,
      status: 'successful',
      createdBy: doc?.user.id,
      parameters: doc?.EndpointActions.data.parameters,
      outputs: {
        'agent-a': {
          content: expect.anything(),
          type: 'json',
        },
      },
      agentState: {
        'agent-a': {
          completedAt: '2022-04-30T16:08:47.449Z',
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          errors: undefined,
        },
      },
    });
  });

  it('should use expected filters when querying for Action Request', async () => {
    (endpointAppContextService.getEndpointMetadataService as jest.Mock) = jest
      .fn()
      .mockReturnValue({
        findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([]),
      });
    await getActionDetailsById(endpointAppContextService, 'default', '123');

    expect(esClient.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: {
          bool: {
            filter: [{ term: { action_id: '123' } }],
          },
        },
      }),
      expect.any(Object)
    );
  });

  it('should throw an error if action id does not exist', async () => {
    (endpointAppContextService.getEndpointMetadataService as jest.Mock) = jest
      .fn()
      .mockReturnValue({
        findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([]),
      });
    actionRequests.hits.hits = [];
    (actionResponses.hits.total as estypes.SearchTotalHits).value = 0;
    actionRequests = endpointActionGenerator.toEsSearchResponse([]);

    await expect(
      getActionDetailsById(endpointAppContextService, 'default', '123')
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should have `isExpired` of `true` if NOT complete and expiration is in the past', async () => {
    (endpointAppContextService.getEndpointMetadataService as jest.Mock) = jest
      .fn()
      .mockReturnValue({
        findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([]),
      });
    (
      actionRequests.hits.hits[0]._source as LogsEndpointAction
    ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;
    actionResponses.hits.hits.pop(); // remove the endpoint response

    await expect(
      getActionDetailsById(endpointAppContextService, 'default', '123')
    ).resolves.toEqual(
      expect.objectContaining({
        isExpired: true,
        isCompleted: false,
      })
    );
  });

  it('should have `isExpired` of `false` if complete and expiration is in the past', async () => {
    (endpointAppContextService.getEndpointMetadataService as jest.Mock) = jest
      .fn()
      .mockReturnValue({
        findHostMetadataForFleetAgents: jest.fn().mockResolvedValue([]),
      });
    (
      actionRequests.hits.hits[0]._source as LogsEndpointAction
    ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;

    await expect(
      getActionDetailsById(endpointAppContextService, 'default', '123')
    ).resolves.toEqual(
      expect.objectContaining({
        isExpired: false,
        isCompleted: true,
      })
    );
  });

  it('should not validate against spaces when `bypassSpaceValidation` is `true`', async () => {
    (
      endpointAppContextService.getInternalFleetServices().ensureInCurrentSpace as jest.Mock
    ).mockResolvedValue(undefined);
    await getActionDetailsById(endpointAppContextService, 'default', '123', {
      bypassSpaceValidation: true,
    });

    expect(
      endpointAppContextService.getInternalFleetServices().ensureInCurrentSpace
    ).not.toHaveBeenCalled();
  });
});
