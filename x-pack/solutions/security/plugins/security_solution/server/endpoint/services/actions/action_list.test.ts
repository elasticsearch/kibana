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
import { getActionList, getActionListByStatus } from './action_list';
import { CustomHttpRequestError } from '../../../utils/custom_http_request_error';
import {
  applyActionListEsSearchMock,
  createActionRequestsEsSearchResultsMock,
  createActionResponsesEsSearchResultsMock,
} from './mocks';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { createMockEndpointAppContextService } from '../../mocks';
import type { ResponseActionAgentType } from '../../../../common/endpoint/service/response_actions/constants';
import { FleetAgentGenerator } from '../../../../common/endpoint/data_generators/fleet_agent_generator';

describe('action list services', () => {
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

    applyActionListEsSearchMock(esClient, actionRequests, actionResponses);

    const fleetAgentGenerator = new FleetAgentGenerator('seed');
    (
      endpointAppContextService.getInternalFleetServices().agent.getByIds as jest.Mock
    ).mockResolvedValue([
      fleetAgentGenerator.generate({
        id: 'agent-a',
        local_metadata: {
          host: {
            name: 'Host-agent-a',
          },
        },
      }),
      fleetAgentGenerator.generate({
        id: 'agent-b',
        local_metadata: {
          host: {
            name: 'Host-agent-b',
          },
        },
      }),
    ]);
  });

  describe('When using `getActionList()', () => {
    it('should return expected output', async () => {
      await expect(
        getActionList({
          endpointService: endpointAppContextService,
          spaceId: 'default',
          page: 1,
          pageSize: 10,
        })
      ).resolves.toEqual({
        data: [
          {
            action: '123',
            agentState: {
              'agent-a': {
                completedAt: '2022-04-30T16:08:47.449Z',
                isCompleted: true,
                wasCanceled: false,
                wasSuccessful: true,
              },
            },
            agentType: 'endpoint',
            agents: ['agent-a'],
            command: 'get-file',
            comment: 'eloo8f2o5zofplw',
            completedAt: '2022-04-30T16:08:47.449Z',
            createdBy: 'Gail',
            hosts: {
              'agent-a': {
                name: 'Host-agent-a',
              },
            },
            id: '123',
            isCompleted: true,
            isExpired: false,
            outputs: {
              'agent-a': {
                content: {
                  code: 'ra_scan_success_done',
                  downloadUri: '/api/endpoint/action/123/file/123.agent-a/download',
                },
                type: 'json',
              },
            },
            startedAt: '2022-04-27T16:08:47.449Z',
            status: 'successful',
            wasCanceled: false,
            wasSuccessful: true,
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      });
    });

    it('should return expected `output` for given actions', async () => {
      await expect(
        getActionList({
          endpointService: endpointAppContextService,
          spaceId: 'default',
          page: 1,
          pageSize: 10,
          withOutputs: ['123'],
        })
      ).resolves.toEqual({
        data: [
          {
            action: '123',
            agentState: {
              'agent-a': {
                completedAt: '2022-04-30T16:08:47.449Z',
                isCompleted: true,
                wasCanceled: false,
                wasSuccessful: true,
              },
            },
            agentType: 'endpoint',
            agents: ['agent-a'],
            command: 'get-file',
            comment: 'eloo8f2o5zofplw',
            completedAt: '2022-04-30T16:08:47.449Z',
            createdBy: 'Gail',
            hosts: {
              'agent-a': {
                name: 'Host-agent-a',
              },
            },
            id: '123',
            isCompleted: true,
            isExpired: false,
            outputs: {
              'agent-a': {
                content: {
                  code: 'ra_scan_success_done',
                  downloadUri: '/api/endpoint/action/123/file/123.agent-a/download',
                },
                type: 'json',
              },
            },
            startedAt: '2022-04-27T16:08:47.449Z',
            status: 'successful',
            wasCanceled: false,
            wasSuccessful: true,
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      });
    });

    it('should return expected output for multiple agent ids', async () => {
      const agentIds = ['agent-a', 'agent-b', 'agent-x'];
      actionRequests = createActionRequestsEsSearchResultsMock(agentIds);
      actionResponses = createActionResponsesEsSearchResultsMock(agentIds);

      applyActionListEsSearchMock(esClient, actionRequests, actionResponses);
      const doc = actionRequests.hits.hits[0]._source;

      await expect(
        getActionList({
          endpointService: endpointAppContextService,
          spaceId: 'default',
          page: 1,
          pageSize: 10,
        })
      ).resolves.toEqual({
        page: 1,
        pageSize: 10,
        commands: undefined,
        agentTypes: undefined,
        userIds: undefined,
        startDate: undefined,
        elasticAgentIds: undefined,
        endDate: undefined,
        statuses: undefined,
        data: [
          {
            action: '123',
            agents: ['agent-a', 'agent-b', 'agent-x'],
            agentType: 'endpoint',
            hosts: {
              'agent-a': { name: 'Host-agent-a' },
              'agent-b': { name: 'Host-agent-b' },
              'agent-x': { name: '' },
            },
            alertIds: undefined,
            command: 'get-file',
            completedAt: undefined,
            wasCanceled: false,
            wasSuccessful: false,
            errors: undefined,
            id: '123',
            isCompleted: false,
            isExpired: true,
            startedAt: '2022-04-27T16:08:47.449Z',
            status: 'failed',
            comment: doc?.EndpointActions.data.comment,
            createdBy: doc?.user.id,
            parameters: doc?.EndpointActions.data.parameters,
            ruleId: undefined,
            ruleName: undefined,
            agentState: {
              'agent-a': {
                completedAt: '2022-04-30T16:08:47.449Z',
                isCompleted: true,
                wasCanceled: false,
                wasSuccessful: true,
                errors: undefined,
              },
              'agent-b': {
                completedAt: undefined,
                isCompleted: false,
                wasCanceled: false,
                wasSuccessful: false,
                errors: undefined,
              },
              'agent-x': {
                completedAt: undefined,
                isCompleted: false,
                wasCanceled: false,
                wasSuccessful: false,
                errors: undefined,
              },
            },
            outputs: {},
          },
        ],
        total: 1,
      });
    });

    it('should call query with expected filters when querying for Action Request', async () => {
      await getActionList({
        endpointService: endpointAppContextService,
        spaceId: 'default',
        agentTypes: ['endpoint'] as ResponseActionAgentType[],
        elasticAgentIds: ['123'],
        pageSize: 20,
        startDate: 'now-10d',
        endDate: 'now',
        commands: ['isolate', 'unisolate', 'get-file'],
        userIds: ['*elastic*'],
      });

      expect(esClient.search).toHaveBeenNthCalledWith(
        1,
        {
          query: {
            bool: {
              must: [
                {
                  bool: {
                    filter: { terms: { 'agent.policy.integrationPolicyId': ['111', '222'] } },
                  },
                },
                {
                  bool: {
                    filter: [
                      {
                        range: {
                          '@timestamp': {
                            gte: 'now-10d',
                          },
                        },
                      },
                      {
                        range: {
                          '@timestamp': {
                            lte: 'now',
                          },
                        },
                      },
                      {
                        terms: {
                          'data.command': ['isolate', 'unisolate', 'get-file'],
                        },
                      },
                      {
                        terms: {
                          input_type: ['endpoint'],
                        },
                      },
                      {
                        terms: {
                          agents: ['123'],
                        },
                      },
                    ],
                  },
                },
                {
                  bool: {
                    should: [
                      {
                        query_string: {
                          fields: ['user_id'],
                          query: '*elastic*',
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
            },
          },
          sort: [
            {
              '@timestamp': {
                order: 'desc',
              },
            },
          ],
          from: 0,
          index: '.logs-endpoint.actions-default',
          size: 20,
        },
        { ignore: [404] }
      );
    });

    it('should call search with exact usernames when no wildcards are present', async () => {
      await getActionList({
        endpointService: endpointAppContextService,
        spaceId: 'default',
        pageSize: 10,
        startDate: 'now-1d',
        endDate: 'now',
        userIds: ['elastic', 'kibana'],
      });

      expect(esClient.search).toHaveBeenNthCalledWith(
        1,
        {
          query: {
            bool: {
              must: [
                {
                  bool: {
                    filter: { terms: { 'agent.policy.integrationPolicyId': ['111', '222'] } },
                  },
                },
                {
                  bool: {
                    filter: [
                      {
                        range: {
                          '@timestamp': {
                            gte: 'now-1d',
                          },
                        },
                      },
                      {
                        range: {
                          '@timestamp': {
                            lte: 'now',
                          },
                        },
                      },
                    ],
                  },
                },
                {
                  bool: {
                    should: [
                      {
                        bool: {
                          should: [
                            {
                              match: {
                                user_id: 'elastic',
                              },
                            },
                          ],
                          minimum_should_match: 1,
                        },
                      },
                      {
                        bool: {
                          should: [
                            {
                              match: {
                                user_id: 'kibana',
                              },
                            },
                          ],
                          minimum_should_match: 1,
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
            },
          },
          sort: [
            {
              '@timestamp': {
                order: 'desc',
              },
            },
          ],
          from: 0,
          index: '.logs-endpoint.actions-default',
          size: 10,
        },
        { ignore: [404] }
      );
    });

    it('should return an empty array if no actions are found', async () => {
      actionRequests.hits.hits = [];
      (actionRequests.hits.total as estypes.SearchTotalHits).value = 0;
      (actionResponses.hits.total as estypes.SearchTotalHits).value = 0;
      actionRequests = endpointActionGenerator.toEsSearchResponse([]);

      await expect(
        getActionList({
          endpointService: endpointAppContextService,
          spaceId: 'default',
        })
      ).resolves.toEqual(
        expect.objectContaining({
          commands: undefined,
          data: [],
          elasticAgentIds: undefined,
          endDate: undefined,
          page: 1,
          pageSize: 10,
          startDate: undefined,
          total: 0,
          userIds: undefined,
        })
      );
    });

    it('should have `isExpired` as `true` if NOT complete and expiration is in the past', async () => {
      (
        actionRequests.hits.hits[0]._source as LogsEndpointAction
      ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;
      actionResponses.hits.hits.pop(); // remove the endpoint response

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: true,
          isCompleted: false,
        })
      );
    });

    it('should have `isExpired` as `false` if complete and expiration is in the past', async () => {
      (
        actionRequests.hits.hits[0]._source as LogsEndpointAction
      ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: false,
          isCompleted: true,
        })
      );
    });

    it('should show status as `completed` if NOT expired and action IS completed AND is successful', async () => {
      (
        actionRequests.hits.hits[0]._source as LogsEndpointAction
      ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: false,
          isCompleted: true,
          wasSuccessful: true,
          status: 'successful',
        })
      );
    });

    it('should show status as `failed` if IS expired', async () => {
      (
        actionRequests.hits.hits[0]._source as LogsEndpointAction
      ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;
      actionResponses.hits.hits.pop(); // remove the endpoint response

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: true,
          isCompleted: false,
          wasSuccessful: false,
          status: 'failed',
        })
      );
    });

    it('should show status as `failed` if IS completed AND was unsuccessful', async () => {
      (
        actionRequests.hits.hits[0]._source as LogsEndpointAction
      ).EndpointActions.expiration = `2021-04-30T16:08:47.449Z`;
      (actionResponses.hits.hits[0]._source as LogsEndpointActionResponse).error = Error(
        'Some error in action response'
      );

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: false,
          isCompleted: true,
          wasSuccessful: false,
          status: 'failed',
        })
      );
    });

    it('should show status as `pending` if no response and NOT expired', async () => {
      (actionRequests.hits.hits[0]._source as LogsEndpointAction).EndpointActions.expiration =
        new Date(new Date().setDate(new Date().getDate() + 5)).toISOString();
      // remove response
      actionResponses.hits.hits.pop();

      await expect(
        await (
          await getActionList({
            endpointService: endpointAppContextService,
            spaceId: 'default',
            elasticAgentIds: ['123'],
          })
        ).data[0]
      ).toEqual(
        expect.objectContaining({
          isExpired: false,
          isCompleted: false,
          wasSuccessful: false,
          status: 'pending',
        })
      );
    });

    it('should throw custom errors', async () => {
      const error = new Error('Some odd error!');

      esClient.search.mockImplementation(async () => {
        return Promise.reject(error);
      });
      const getActionListPromise = getActionList({
        endpointService: endpointAppContextService,
        spaceId: 'default',
      });

      await expect(getActionListPromise).rejects.toThrowError(
        'Unknown error while fetching action requests'
      );
      await expect(getActionListPromise).rejects.toBeInstanceOf(CustomHttpRequestError);
    });
  });

  describe('When using `getActionListByStatus()', () => {
    it('should return expected output `data` length for selected statuses', async () => {
      actionRequests = createActionRequestsEsSearchResultsMock(undefined, true);
      actionResponses = createActionResponsesEsSearchResultsMock();

      applyActionListEsSearchMock(esClient, actionRequests, actionResponses);

      const getActionListByStatusPromise = ({ page }: { page: number }) =>
        getActionListByStatus({
          endpointService: endpointAppContextService,
          spaceId: 'default',
          page: page ?? 1,
          pageSize: 10,
          statuses: ['failed', 'pending', 'successful'],
        });

      expect(await (await getActionListByStatusPromise({ page: 1 })).data.length).toEqual(10);

      expect(await (await getActionListByStatusPromise({ page: 2 })).data.length).toEqual(10);

      expect(await (await getActionListByStatusPromise({ page: 3 })).data.length).toEqual(3);
    });
  });
});
