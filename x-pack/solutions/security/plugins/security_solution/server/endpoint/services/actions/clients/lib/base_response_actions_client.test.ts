/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// eslint-disable-next-line max-classes-per-file
import type { ResponseActionsClient } from './types';
import type {
  ResponseActionsClientUpdateCasesOptions,
  ResponseActionsClientWriteActionRequestToEndpointIndexOptions,
  ResponseActionsClientWriteActionResponseToEndpointIndexOptions,
  ResponseActionsClientPendingAction,
} from './base_response_actions_client';
import { HOST_NOT_ENROLLED, ResponseActionsClientImpl } from './base_response_actions_client';
import type {
  ActionDetails,
  LogsEndpointAction,
  LogsEndpointActionResponse,
  EndpointActionResponseDataOutput,
  EndpointActionDataParameterTypes,
} from '../../../../../../common/endpoint/types';
import type { EndpointAppContextService } from '../../../../endpoint_app_context_services';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { ResponseActionsClientError, ResponseActionsNotSupportedError } from '../errors';
import type { CasesClientMock } from '@kbn/cases-plugin/server/client/mocks';
import type { CasesByAlertIDParams } from '@kbn/cases-plugin/server/client/cases/get';
import type { Logger } from '@kbn/logging';
import { getActionDetailsById as _getActionDetailsById } from '../../action_details_by_id';
import type { estypes, TransportResult } from '@elastic/elasticsearch';
import {
  ENDPOINT_ACTION_RESPONSES_INDEX,
  ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
  ENDPOINT_ACTIONS_INDEX,
} from '../../../../../../common/endpoint/constants';
import type { DeepMutable } from '../../../../../../common/endpoint/types/utility_types';
import type { ExperimentalFeatures } from '../../../../../../common/experimental_features';
import { set } from '@kbn/safer-lodash-set';
import { responseActionsClientMock } from '../mocks';
import type { ResponseActionAgentType } from '../../../../../../common/endpoint/service/response_actions/constants';
import { getResponseActionFeatureKey } from '../../../feature_usage/feature_keys';
import { isActionSupportedByAgentType as _isActionSupportedByAgentType } from '../../../../../../common/endpoint/service/response_actions/is_response_action_supported';
import { EndpointActionGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_action_generator';
import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT,
  ENDPOINT_RESPONSE_ACTION_SENT_EVENT,
} from '../../../../../lib/telemetry/event_based/events';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { resetCcsCache } from '../../../../utils/ccs_utils';

jest.mock('../../action_details_by_id', () => {
  const original = jest.requireActual('../../action_details_by_id');

  return {
    ...original,
    getActionDetailsById: jest.fn(original.getActionDetailsById),
  };
});

jest.mock(
  '../../../../../../common/endpoint/service/response_actions/is_response_action_supported',
  () => {
    const original = jest.requireActual(
      '../../../../../../common/endpoint/service/response_actions/is_response_action_supported'
    );

    return {
      ...original,
      isActionSupportedByAgentType: jest.fn(original.isActionSupportedByAgentType),
    };
  }
);

const getActionDetailsByIdMock = _getActionDetailsById as jest.Mock;
const isActionSupportedByAgentTypeMock = _isActionSupportedByAgentType as jest.Mock;

describe('ResponseActionsClientImpl base class', () => {
  let constructorOptions: ReturnType<typeof responseActionsClientMock.createConstructorOptions>;
  let esClient: ElasticsearchClientMock;
  let endpointAppContextService: EndpointAppContextService;
  let baseClassMock: MockClassWithExposedProtectedMembers;
  let casesClient: CasesClientMock;
  let logger: Logger;

  beforeEach(async () => {
    resetCcsCache();
    constructorOptions = responseActionsClientMock.createConstructorOptions();

    esClient = constructorOptions.esClient;
    casesClient = constructorOptions.casesClient;
    endpointAppContextService = constructorOptions.endpointService;
    logger = endpointAppContextService.createLogger();
    baseClassMock = new MockClassWithExposedProtectedMembers(constructorOptions);
  });

  afterEach(() => {
    getActionDetailsByIdMock.mockClear();
    isActionSupportedByAgentTypeMock.mockReset();
    isActionSupportedByAgentTypeMock.mockImplementation(
      jest.requireActual(
        '../../../../../../common/endpoint/service/response_actions/is_response_action_supported'
      ).isActionSupportedByAgentType
    );
  });

  describe('Public methods', () => {
    const methods: Array<keyof ResponseActionsClient> = [
      'isolate',
      'release',
      'killProcess',
      'suspendProcess',
      'runningProcesses',
      'getFile',
      'execute',
      'upload',
      'getFileDownload',
      'getFileInfo',
    ];

    it.each(methods)('should throw Not Supported error for %s()', async (method) => {
      // @ts-expect-error ignoring input type to method since they all should throw
      const responsePromise = baseClassMock[method]({});

      await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsNotSupportedError);
      await expect(responsePromise).rejects.toHaveProperty('statusCode', 405);
    });
  });

  describe('#updateCases()', () => {
    const KNOWN_ALERT_ID_1 = 'alert-1';
    const KNOWN_ALERT_ID_2 = 'alert-2';
    const KNOWN_ALERT_ID_3 = 'alert-3';

    let updateCasesOptions: Required<ResponseActionsClientUpdateCasesOptions>;

    beforeEach(async () => {
      (casesClient.cases.getCasesByAlertID as jest.Mock).mockImplementation(
        async ({ alertID }: CasesByAlertIDParams) => {
          if (alertID === KNOWN_ALERT_ID_1) {
            return [{ id: 'case-1' }, { id: 'case-2' }, { id: 'case-3' }];
          }

          if (alertID === KNOWN_ALERT_ID_2) {
            return [{ id: 'case-3' }];
          }

          if (alertID === KNOWN_ALERT_ID_3) {
            return [];
          }

          throw new Error('test: alert id not found');
        }
      );

      updateCasesOptions = {
        command: 'isolate',
        caseIds: ['case-999'],
        alertIds: [KNOWN_ALERT_ID_1, KNOWN_ALERT_ID_2, KNOWN_ALERT_ID_3],
        comment: 'this is a case comment',
        actionId: 'action-123',
        hosts: [
          {
            hostId: '1-2-3',
            hostname: 'foo-one',
          },
          {
            hostId: '4-5-6',
            hostname: 'foo-two',
          },
        ],
      };
    });

    it('should do nothing if no caseIds nor alertIds are provided', async () => {
      updateCasesOptions.caseIds.length = 0;
      updateCasesOptions.alertIds.length = 0;
      await baseClassMock.updateCases(updateCasesOptions);

      expect(casesClient.cases.getCasesByAlertID).not.toHaveBeenCalled();
      expect(casesClient.attachments.bulkCreate).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        "No updates to Cases needed. 'caseIds' and 'alertIds' are empty"
      );
    });

    it('should do nothing if no hosts were provided', async () => {
      updateCasesOptions.hosts.length = 0;
      await baseClassMock.updateCases(updateCasesOptions);

      expect(casesClient.cases.getCasesByAlertID).not.toHaveBeenCalled();
      expect(casesClient.attachments.bulkCreate).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith("No updates to Cases needed. 'hosts' is empty");
    });

    it('should do nothing if cases client was not provided', async () => {
      const mockInstance = new MockClassWithExposedProtectedMembers({
        esClient,
        endpointService: endpointAppContextService,
        username: 'foo',
        spaceId: DEFAULT_SPACE_ID,
      });
      await mockInstance.updateCases(updateCasesOptions);

      expect(casesClient.cases.getCasesByAlertID).not.toHaveBeenCalled();
      expect(casesClient.attachments.bulkCreate).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'No CasesClient available. Skipping updates to Cases!'
      );
    });

    it('should retrieve caseIds from alerts if alertIds was provided', async () => {
      await baseClassMock.updateCases(updateCasesOptions);

      expect(casesClient.cases.getCasesByAlertID).toHaveBeenCalledTimes(3);
    });

    it('should not error is retrieving case id for alert fails', async () => {
      updateCasesOptions.alertIds.push('invalid-alert-id');
      await baseClassMock.updateCases(updateCasesOptions);

      expect(casesClient.cases.getCasesByAlertID).toHaveBeenCalledTimes(4);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Attempt to get cases for alertID [invalid-alert-id]')
      );
    });

    it('should do nothing if alertIDs were not associated with any cases', async () => {
      updateCasesOptions.caseIds.length = 0;
      updateCasesOptions.alertIds = [KNOWN_ALERT_ID_3];
      await baseClassMock.updateCases(updateCasesOptions);

      expect(logger.debug).toHaveBeenCalledWith(
        `No updates to Cases needed. Alert IDs are not tied to Cases`
      );
    });

    it('should update cases with a unified attachment', async () => {
      const updateResponse = await baseClassMock.updateCases(updateCasesOptions);

      expect(updateResponse).toBeUndefined();
      expect(casesClient.attachments.bulkCreate).toHaveBeenCalledTimes(4);
      expect(casesClient.attachments.bulkCreate).toHaveBeenLastCalledWith({
        attachments: [
          {
            type: 'security.endpoint',
            attachmentId: 'action-123',
            data: { content: 'this is a case comment' },
            metadata: {
              command: 'isolate',
              targets: [
                {
                  endpointId: '1-2-3',
                  hostname: 'foo-one',
                  agentType: 'endpoint',
                },
                {
                  endpointId: '4-5-6',
                  hostname: 'foo-two',
                  agentType: 'endpoint',
                },
              ],
            },
            owner: 'securitySolution',
          },
        ],
        caseId: 'case-3',
      });
    });

    it('should not error if update to a case fails', async () => {
      (casesClient.attachments.bulkCreate as jest.Mock).mockImplementation(async (options) => {
        if (options.caseId === 'case-2') {
          throw new Error('update failed to case-2');
        }
      });
      await baseClassMock.updateCases(updateCasesOptions);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Attempt to update case ID [case-2] failed:')
      );
    });
  });

  describe('#fetchActionDetails()', () => {
    it('should retrieve action details', async () => {
      await baseClassMock.fetchActionDetails('one').catch(() => {
        // just ignoring error
      });

      expect(getActionDetailsByIdMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'one',
        { bypassSpaceValidation: false, ccsEnabled: false }
      );
    });

    it('should pass ccsEnabled=true when the feature flag is enabled and remote clusters are connected', async () => {
      (
        constructorOptions.endpointService.experimentalFeatures as DeepMutable<ExperimentalFeatures>
      ).defendRemoteOutputCcs = true;
      (constructorOptions.esClient.cluster.remoteInfo as unknown as jest.Mock).mockResolvedValue({
        cluster_a: { connected: true },
      });

      await baseClassMock.fetchActionDetails('one').catch(() => {
        // just ignoring error
      });

      expect(getActionDetailsByIdMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'one',
        { bypassSpaceValidation: false, ccsEnabled: true }
      );
    });
  });

  describe('#writeActionRequestToEndpointIndex()', () => {
    let esIndexDocResponse: TransportResult<estypes.IndexResponse, unknown>;
    let indexDocOptions: DeepMutable<ResponseActionsClientWriteActionRequestToEndpointIndexOptions>;
    let expectedIndexDoc: LogsEndpointAction;

    beforeEach(() => {
      esIndexDocResponse = {
        body: {
          result: 'created',
          _id: '123',
          _index: ENDPOINT_ACTIONS_INDEX,
          _version: 1,
        },
        statusCode: 201,
        headers: {},
        meta: {},
        warnings: null,
      } as TransportResult<estypes.IndexResponse, unknown>;

      indexDocOptions = {
        command: 'isolate',
        agent_type: 'endpoint',
        endpoint_ids: ['one'],
        comment: 'test comment',
        ruleName: undefined,
        ruleId: undefined,
        alert_ids: undefined,
        case_ids: undefined,
        hosts: undefined,
        parameters: undefined,
        // @ts-expect-error TS2322 due to type overload
        file: undefined,
      };

      expectedIndexDoc = {
        '@timestamp': expect.any(String),
        EndpointActions: {
          action_id: expect.any(String),
          data: {
            command: 'isolate',
            comment: 'test comment',
          },
          expiration: expect.any(String),
          input_type: 'endpoint',
          type: 'INPUT_ACTION',
        },
        agent: {
          id: ['one'],
          policy: [
            {
              agentId: 'one',
              agentPolicyId: expect.any(String),
              elasticAgentId: 'one',
              integrationPolicyId: expect.any(String),
            },
          ],
        },
        originSpaceId: 'default',
        tags: [],
        meta: undefined,
        user: {
          id: 'foo',
        },
      };

      // @ts-expect-error TS2345: Argument of type... Due to the fact that the method definition is overloaded
      esClient.index.mockResolvedValue(esIndexDocResponse);
    });

    it('should return indexed record on success', async () => {
      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);

      expect(endpointAppContextService.getFeatureUsageService().notifyUsage).toHaveBeenCalledWith(
        getResponseActionFeatureKey(indexDocOptions.command)
      );
    });

    it('should notify feature usage', async () => {
      await baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

      expect(endpointAppContextService.getFeatureUsageService().notifyUsage).toHaveBeenCalledWith(
        getResponseActionFeatureKey(indexDocOptions.command)
      );
    });

    it('should set `EndpointActions.input_type` to the correct value', async () => {
      const baseClassMock2 = new (class extends MockClassWithExposedProtectedMembers {
        protected readonly agentType = 'sentinel_one';
      })(constructorOptions);
      indexDocOptions.agent_type = 'sentinel_one';
      set(expectedIndexDoc, 'EndpointActions.input_type', 'sentinel_one');

      await expect(
        baseClassMock2.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);
    });

    it('should include alert_ids if any were provided', async () => {
      indexDocOptions.alert_ids = ['one', 'two'];
      set(expectedIndexDoc, 'EndpointActions.data.alert_id', indexDocOptions.alert_ids);

      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);
    });

    it('should include hosts if any where provided', async () => {
      indexDocOptions.hosts = { hostA: { name: 'host a' } };
      set(expectedIndexDoc, 'EndpointActions.data.hosts', indexDocOptions.hosts);

      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);
    });

    it('should include Rule information if rule_id and rule_name were provided', async () => {
      indexDocOptions.ruleId = '1-2-3';
      indexDocOptions.ruleName = 'rule 123';
      expectedIndexDoc.rule = {
        name: indexDocOptions.ruleName,
        id: indexDocOptions.ruleId,
      };

      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);
    });

    it('should NOT include Rule information if rule_id or rule_name are missing', async () => {
      indexDocOptions.ruleId = '1-2-3';

      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(expectedIndexDoc);
    });

    it('should error if index of document did not return a 201', async () => {
      esIndexDocResponse.statusCode = 200;
      const responsePromise = baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

      await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsClientError);
      await expect(responsePromise).rejects.toHaveProperty('statusCode', 500);
    });

    it('should throw ResponseActionsClientError if operation fails', async () => {
      esClient.index.mockImplementation(async () => {
        throw new Error('test error');
      });
      const responsePromise = baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

      await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsClientError);
      await expect(responsePromise).rejects.toHaveProperty('statusCode', 500);
      await expect(responsePromise).rejects.toHaveProperty(
        'message',
        expect.stringContaining('Failed to create action request document:')
      );
    });

    it('should throw error if endpoint_ids is empty', async () => {
      indexDocOptions.endpoint_ids = [];
      const responsePromise = baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

      await expect(responsePromise).rejects.toHaveProperty('message', HOST_NOT_ENROLLED);
      await expect(responsePromise).rejects.toHaveProperty('statusCode', 400);
    });

    it('should throw error is response action is not supported by agent type', async () => {
      isActionSupportedByAgentTypeMock.mockReturnValue(false);
      const responsePromise = baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

      await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsNotSupportedError);
    });

    it('should include `agent.policy` document field if space awareness is enabled', async () => {
      await expect(
        baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
      ).resolves.toEqual(
        expect.objectContaining({
          agent: {
            id: ['one'],
            policy: [
              {
                agentId: 'one',
                agentPolicyId: 'agent-policy-a',
                elasticAgentId: 'one',
                integrationPolicyId: 'integration-policy-a',
              },
            ],
          },
        })
      );
    });

    describe('And class is instantiated with `isAutomated` set to `true`', () => {
      beforeEach(() => {
        constructorOptions.isAutomated = true;
        baseClassMock = new MockClassWithExposedProtectedMembers(constructorOptions);
      });

      describe('#riteActionRequestToEndpointIndex()', () => {
        it('should write doc with all expected data', async () => {
          indexDocOptions.meta = { one: 1 };

          await expect(
            baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
          ).resolves.toEqual({
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: expect.any(String),
              data: {
                command: 'isolate',
                comment: 'test comment',
                parameters: undefined,
              },
              expiration: expect.any(String),
              input_type: 'endpoint',
              type: 'INPUT_ACTION',
            },
            agent: {
              id: ['one'],
              policy: [
                {
                  agentId: 'one',
                  agentPolicyId: expect.any(String),
                  elasticAgentId: 'one',
                  integrationPolicyId: expect.any(String),
                },
              ],
            },
            originSpaceId: 'default',
            tags: [],
            meta: { one: 1 },
            user: { id: 'foo' },
          });
        });

        it('should write doc with error when license is not Enterprise', async () => {
          (
            constructorOptions.endpointService.getLicenseService().isEnterprise as jest.Mock
          ).mockReturnValue(false);

          await expect(
            baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
          ).resolves.toMatchObject({
            error: {
              message: 'At least Enterprise license is required to use Response Actions.',
            },
          });
        });

        it('should write doc with error when endpoint_ids is empty', async () => {
          indexDocOptions.endpoint_ids = [];

          await expect(
            baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
          ).resolves.toMatchObject({
            error: {
              message: HOST_NOT_ENROLLED,
            },
          });
        });

        it('should write doc with error when action is not supported by agent', async () => {
          isActionSupportedByAgentTypeMock.mockReturnValue(false);

          await expect(
            baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions)
          ).resolves.toMatchObject({
            error: {
              message: 'Action [isolate] not supported',
            },
          });
        });
      });
    });

    describe('Telemetry', () => {
      it('should send action creation success telemetry for manual actions', async () => {
        await baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

        expect(endpointAppContextService.getTelemetryService().reportEvent).toHaveBeenCalledWith(
          ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType,
          {
            responseActions: {
              actionId: expect.any(String),
              agentType: indexDocOptions.agent_type,
              command: indexDocOptions.command,
              isAutomated: false,
            },
          }
        );
      });

      it('should send action creation success telemetry for automated actions', async () => {
        constructorOptions.isAutomated = true;
        baseClassMock = new MockClassWithExposedProtectedMembers(constructorOptions);

        await baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);

        expect(endpointAppContextService.getTelemetryService().reportEvent).toHaveBeenCalledWith(
          ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType,
          {
            responseActions: {
              actionId: expect.any(String),
              agentType: indexDocOptions.agent_type,
              command: indexDocOptions.command,
              isAutomated: true,
            },
          }
        );
      });

      it('should send error telemetry if action creation fails', async () => {
        esClient.index.mockImplementation(async () => {
          throw new Error('test error');
        });
        const responsePromise = baseClassMock.writeActionRequestToEndpointIndex(indexDocOptions);
        await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsClientError);

        expect(endpointAppContextService.getTelemetryService().reportEvent).toHaveBeenCalledWith(
          ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT.eventType,
          {
            responseActions: {
              agentType: indexDocOptions.agent_type,
              command: indexDocOptions.command,
              error: 'test error',
            },
          }
        );
      });
    });
  });

  describe('#writeActionResponseToEndpointIndex()', () => {
    let actionResponseOptions: ResponseActionsClientWriteActionResponseToEndpointIndexOptions;

    beforeEach(() => {
      actionResponseOptions = {
        actionId: '1-2-3',
        agentId: '123',
        error: { message: 'test error' },
        data: {
          command: 'isolate',
          comment: 'some comment',
          output: undefined,
        },
        meta: { one: 1 },
      };
    });

    it('should return indexed record on success', async () => {
      await expect(
        baseClassMock.writeActionResponseToEndpointIndex(actionResponseOptions)
      ).resolves.toEqual({
        '@timestamp': expect.any(String),
        EndpointActions: {
          action_id: '1-2-3',
          input_type: 'endpoint',
          completed_at: expect.any(String),
          started_at: expect.any(String),
          data: {
            command: 'isolate',
            comment: 'some comment',
            output: undefined,
          },
        },
        agent: {
          id: '123',
        },
        error: {
          message: 'test error',
        },
        meta: { one: 1 },
      } as LogsEndpointActionResponse);
    });

    it('should throw ResponseActionsClientError if operation fails', async () => {
      esClient.index.mockImplementation(async () => {
        throw new Error('oh oh');
      });
      const responsePromise =
        baseClassMock.writeActionResponseToEndpointIndex(actionResponseOptions);

      await expect(responsePromise).rejects.toBeInstanceOf(ResponseActionsClientError);
      await expect(responsePromise).rejects.toHaveProperty(
        'message',
        expect.stringContaining('Failed to create action response document: ')
      );
      await expect(responsePromise).rejects.toHaveProperty('statusCode', 500);
    });
  });

  describe('#fetchAllPendingActions()', () => {
    beforeEach(() => {
      const generator = new EndpointActionGenerator('seed');
      const actionRequestEsHitPages = [
        // Page 1
        [
          generator.generateActionEsHit({
            agent: { id: 'agent-a' },
            EndpointActions: { action_id: 'action-id-1' },
          }),
        ],
        // Page 2
        [
          generator.generateActionEsHit({
            agent: { id: 'agent-b' },
            EndpointActions: { action_id: 'action-id-2' },
          }),
        ],
      ];
      let nextActionRequestPageNumber = 0;

      constructorOptions.esClient.search.mockImplementation(async (_searchReq) => {
        const searchReq = _searchReq as SearchRequest;

        // FYI: The iterable uses a Point In Time
        if (searchReq!.pit) {
          return generator.toEsSearchResponse(
            actionRequestEsHitPages[nextActionRequestPageNumber++] ?? []
          );
        }

        switch (searchReq!.index) {
          case ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN:
            // `action-1` will have a response - thus its complete
            if (JSON.stringify(searchReq).includes('action-id-1')) {
              return generator.toEsSearchResponse([
                generator.toEsSearchHit(
                  generator.generateResponse({
                    agent: { id: 'agent-a' },
                    EndpointActions: { action_id: 'action-id-1' },
                  }),
                  ENDPOINT_ACTION_RESPONSES_INDEX
                ),
              ]);
            }

            // `action-2 will not have a response - it will be pending
            return generator.toEsSearchResponse([]);
        }

        return generator.toEsSearchResponse([]);
      });
    });

    it('should return an async iterable', () => {
      const iterable = baseClassMock.fetchAllPendingActions();

      expect(iterable[Symbol.asyncIterator]).toEqual(expect.any(Function));
    });

    it('should query ES with expected criteria', async () => {
      for await (const pendingActions of baseClassMock.fetchAllPendingActions()) {
        expect(pendingActions);
      }

      expect(constructorOptions.esClient.search).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          query: {
            bool: {
              must: { term: { 'EndpointActions.input_type': expect.any(String) } },
              must_not: { exists: { field: 'error' } },
              filter: [{ range: { 'EndpointActions.expiration': { gte: 'now' } } }],
            },
          },
        })
      );
    });

    it('should provide an array of pending actions', async () => {
      const iterationData: ResponseActionsClientPendingAction[][] = [];

      for await (const pendingActions of baseClassMock.fetchAllPendingActions()) {
        iterationData.push(pendingActions);
      }

      expect(iterationData.length).toBe(2);
      expect(iterationData[0]).toEqual([]); // First page of results should be empty due to how the mock was setup
      expect(iterationData[1]).toEqual([
        {
          action: expect.objectContaining({
            EndpointActions: expect.objectContaining({
              action_id: 'action-id-2',
            }),
            agent: { id: 'agent-b', policy: expect.any(Array) },
          }),
          pendingAgentIds: ['agent-b'],
        },
      ]);
    });
  });
});

class MockClassWithExposedProtectedMembers extends ResponseActionsClientImpl {
  protected readonly agentType: ResponseActionAgentType = 'endpoint';

  protected async fetchAgentPolicyInfo(
    agentIds: string[]
  ): Promise<LogsEndpointAction['agent']['policy']> {
    return agentIds.map((id) => ({
      agentId: id,
      elasticAgentId: id,
      agentPolicyId: 'agent-policy-a',
      integrationPolicyId: 'integration-policy-a',
    }));
  }

  public async updateCases(options: ResponseActionsClientUpdateCasesOptions): Promise<void> {
    return super.updateCases(options);
  }

  public async fetchActionDetails<T extends ActionDetails = ActionDetails>(
    actionId: string
  ): Promise<T> {
    return super.fetchActionDetails(actionId);
  }

  public async writeActionRequestToEndpointIndex<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(
    actionRequest: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      TParameters,
      TOutputContent,
      TMeta
    >
  ): Promise<LogsEndpointAction<TParameters, TOutputContent, TMeta>> {
    return super.writeActionRequestToEndpointIndex<TParameters, TOutputContent, TMeta>(
      actionRequest
    );
  }

  public async writeActionResponseToEndpointIndex<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput
  >(
    options: ResponseActionsClientWriteActionResponseToEndpointIndexOptions<TOutputContent>
  ): Promise<LogsEndpointActionResponse<TOutputContent>> {
    return super.writeActionResponseToEndpointIndex<TOutputContent>(options);
  }

  public fetchAllPendingActions<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(): AsyncIterable<
    Array<ResponseActionsClientPendingAction<TParameters, TOutputContent, TMeta>>
  > {
    return super.fetchAllPendingActions<TParameters, TOutputContent, TMeta>();
  }
}
