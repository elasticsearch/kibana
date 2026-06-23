/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';
import pRetry from 'p-retry';
import { MicrosoftDefenderEndpointActionsClient } from './ms_defender_endpoint_actions_client';
import type { ProcessPendingActionsMethodOptions, ResponseActionsClient } from '../../../../..';
import { getActionDetailsById as _getActionDetailsById } from '../../../../action_details_by_id';
import type { MicrosoftDefenderActionsClientOptionsMock } from './mocks';
import { microsoftDefenderMock } from './mocks';
import { ResponseActionsNotSupportedError } from '../../../errors';
import type { NormalizedExternalConnectorClientMock } from '../../../mocks';
import { responseActionsClientMock } from '../../../mocks';
import type {
  LogsEndpointActionResponse,
  MicrosoftDefenderEndpointActionRequestCommonMeta,
} from '../../../../../../../../common/endpoint/types';
import { EndpointActionGenerator } from '../../../../../../../../common/endpoint/data_generators/endpoint_action_generator';
import { applyEsClientSearchMock } from '../../../../../../mocks/utils.mock';
import {
  ENDPOINT_ACTIONS_INDEX,
  ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
} from '../../../../../../../../common/endpoint/constants';
import type {
  MicrosoftDefenderEndpointGetActionsResponse,
  MicrosoftDefenderEndpointMachineAction,
} from '@kbn/connector-schemas/microsoft_defender_endpoint';
import { SUB_ACTION as MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION } from '@kbn/connector-schemas/microsoft_defender_endpoint';
import { MICROSOFT_DEFENDER_ENDPOINT_LOG_INDEX_PATTERN } from '../../../../../../../../common/endpoint/service/response_actions/microsoft_defender';
import { MicrosoftDefenderDataGenerator } from '../../../../../../../../common/endpoint/data_generators/microsoft_defender_data_generator';
import { AgentNotFoundError } from '@kbn/fleet-plugin/server';
import {
  ENDPOINT_RESPONSE_ACTION_SENT_EVENT,
  ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT,
} from '../../../../../../../lib/telemetry/event_based/events';

jest.mock('../../../../action_details_by_id', () => {
  const originalMod = jest.requireActual('../../../../action_details_by_id');

  return {
    ...originalMod,
    getActionDetailsById: jest.fn(originalMod.getActionDetailsById),
  };
});

jest.mock('p-retry', () => {
  const originalPRetry = jest.requireActual('p-retry');
  return jest.fn().mockImplementation((fn, options) => originalPRetry(fn, options));
});

const getActionDetailsByIdMock = _getActionDetailsById as jest.Mock;
const pRetryMock = jest.mocked(pRetry);

describe('MS Defender response actions client', () => {
  let clientConstructorOptionsMock: MicrosoftDefenderActionsClientOptionsMock;
  let connectorActionsMock: NormalizedExternalConnectorClientMock;
  let msClientMock: ResponseActionsClient;

  beforeEach(() => {
    clientConstructorOptionsMock = microsoftDefenderMock.createConstructorOptions();
    connectorActionsMock =
      clientConstructorOptionsMock.connectorActions as NormalizedExternalConnectorClientMock;
    msClientMock = new MicrosoftDefenderEndpointActionsClient(clientConstructorOptionsMock);

    // Mock ensureInCurrentSpace to avoid space validation issues in tests
    const fleetServices = clientConstructorOptionsMock.endpointService.getInternalFleetServices();
    jest.spyOn(fleetServices, 'ensureInCurrentSpace').mockResolvedValue(undefined);

    getActionDetailsByIdMock.mockImplementation(async (_, __, id: string) => {
      return new EndpointActionGenerator('seed').generateActionDetails({
        id,
      });
    });
  });

  const supportedResponseActionClassMethods: Record<keyof ResponseActionsClient, boolean> = {
    upload: false,
    scan: false,
    execute: false,
    getFile: false,
    getFileDownload: true,
    getFileInfo: true,
    killProcess: false,
    runningProcesses: false,
    runscript: true,
    suspendProcess: false,
    isolate: true,
    release: true,
    processPendingActions: true,
    getCustomScripts: true,
    cancel: true,
    memoryDump: false,
  };

  it.each(
    Object.entries(supportedResponseActionClassMethods).reduce((acc, [key, value]) => {
      if (!value) {
        acc.push(key as keyof ResponseActionsClient);
      }
      return acc;
    }, [] as Array<keyof ResponseActionsClient>)
  )('should throw error for %s', async (methodName) => {
    // @ts-expect-error Purposely passing in empty object for options
    await expect(msClientMock[methodName]({})).rejects.toBeInstanceOf(
      ResponseActionsNotSupportedError
    );
  });

  it('should error if multiple agent ids are received', async () => {
    await expect(msClientMock.isolate({ endpoint_ids: ['a', 'b'] })).rejects.toMatchObject({
      message: `[body.endpoint_ids]: Multiple agents IDs not currently supported for Microsoft Defender for Endpoint`,
      statusCode: 400,
    });
  });

  it('should update cases', async () => {
    await msClientMock.isolate(
      responseActionsClientMock.createIsolateOptions({ case_ids: ['case-1'] })
    );

    expect(clientConstructorOptionsMock.casesClient?.attachments.bulkCreate).toHaveBeenCalled();
  });

  describe.each<Extract<keyof ResponseActionsClient, 'isolate' | 'release'>>([
    'isolate',
    'release',
  ])('#%s()', (responseActionMethod) => {
    it(`should send ${responseActionMethod} request to Microsoft with expected comment`, async () => {
      await msClientMock[responseActionMethod](responseActionsClientMock.createIsolateOptions());

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: responseActionMethod === 'isolate' ? 'isolateHost' : 'releaseHost',
          subActionParams: {
            comment: expect.stringMatching(
              /Action triggered from Elastic Security by user \[foo\] for action \[.* \(action id: .*\)\]: test comment/
            ),
            id: '1-2-3',
          },
        },
      });
    });

    it('should write action request doc. to endpoint index', async () => {
      await msClientMock[responseActionMethod](responseActionsClientMock.createIsolateOptions());

      expect(clientConstructorOptionsMock.esClient.index).toHaveBeenCalledWith(
        {
          document: {
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: expect.any(String),
              data: {
                command: responseActionMethod === 'isolate' ? 'isolate' : 'unisolate',
                comment: 'test comment',
                hosts: {
                  '1-2-3': {
                    name: 'mymachine1.contoso.com',
                  },
                },
                parameters: undefined,
              },
              expiration: expect.any(String),
              input_type: 'microsoft_defender_endpoint',
              type: 'INPUT_ACTION',
            },
            agent: {
              id: ['1-2-3'],
              policy: [
                {
                  agentId: '1-2-3',
                  agentPolicyId: expect.any(String),
                  elasticAgentId: '1-2-3',
                  integrationPolicyId: expect.any(String),
                },
              ],
            },
            originSpaceId: 'default',
            tags: [],
            meta: {
              machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e',
            },
            user: {
              id: 'foo',
            },
          },
          index: '.logs-endpoint.actions-default',
          refresh: 'wait_for',
        },
        { meta: true }
      );
    });

    it('should return action details', async () => {
      await expect(
        msClientMock[responseActionMethod](responseActionsClientMock.createIsolateOptions())
      ).resolves.toEqual(
        expect.objectContaining({
          id: expect.any(String),
          command: expect.any(String),
          isCompleted: expect.any(Boolean),
        })
      );
      expect(getActionDetailsByIdMock).toHaveBeenCalled();
    });

    it('should update cases', async () => {
      await msClientMock[responseActionMethod](
        responseActionsClientMock.createIsolateOptions({
          case_ids: ['case-1'],
        })
      );

      expect(clientConstructorOptionsMock.casesClient?.attachments.bulkCreate).toHaveBeenCalled();
    });

    describe('telemetry events', () => {
      it(`should send ${responseActionMethod} action creation telemetry event`, async () => {
        await msClientMock[responseActionMethod](responseActionsClientMock.createIsolateOptions());
        expect(
          clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
        ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType, {
          responseActions: {
            actionId: expect.any(String),
            agentType: 'microsoft_defender_endpoint',
            command: responseActionMethod === 'release' ? 'unisolate' : responseActionMethod,
            isAutomated: false,
          },
        });
      });
    });
  });

  describe('#runscript()', () => {
    beforeEach(() => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
        true;
    });
    it('should send runscript request to Microsoft with expected parameters', async () => {
      await msClientMock.runscript(
        responseActionsClientMock.createRunScriptOptions({
          parameters: { scriptName: 'test-script.ps1', args: 'arg1 arg2' },
        })
      );

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.RUN_SCRIPT,
          subActionParams: {
            comment: expect.stringMatching(
              /Action triggered from Elastic Security by user \[foo\] for action \[.* \(action id: .*\)\]: test comment/
            ),
            id: '1-2-3',
            parameters: {
              scriptName: 'test-script.ps1',
              args: 'arg1 arg2',
            },
          },
        },
      });
    });

    it('should write action request doc. to endpoint index', async () => {
      await msClientMock.runscript(
        microsoftDefenderMock.createRunScriptOptions({
          parameters: { scriptName: 'test-script.ps1' },
        })
      );

      expect(clientConstructorOptionsMock.esClient.index).toHaveBeenCalledWith(
        {
          document: {
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: expect.any(String),
              data: {
                command: 'runscript',
                comment: 'test comment',
                hosts: {
                  '1-2-3': {
                    name: 'mymachine1.contoso.com',
                  },
                },
                parameters: {
                  args: 'test-args',
                  scriptName: 'test-script.ps1',
                },
              },
              expiration: expect.any(String),
              input_type: 'microsoft_defender_endpoint',
              type: 'INPUT_ACTION',
            },
            agent: {
              id: ['1-2-3'],
              policy: [
                {
                  agentId: '1-2-3',
                  agentPolicyId: expect.any(String),
                  elasticAgentId: '1-2-3',
                  integrationPolicyId: expect.any(String),
                },
              ],
            },
            originSpaceId: 'default',
            tags: [],
            meta: {
              machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e',
            },
            user: {
              id: 'foo',
            },
          },
          index: '.logs-endpoint.actions-default',
          refresh: 'wait_for',
        },
        { meta: true }
      );
    });

    it('should return action details', async () => {
      getActionDetailsByIdMock.mockResolvedValue({
        id: expect.any(String),
        command: 'runscript',
        agentType: 'microsoft_defender_endpoint',
        isCompleted: false,
      });

      await expect(
        msClientMock.runscript(
          responseActionsClientMock.createRunScriptOptions({
            parameters: { scriptName: 'test-script.ps1' },
          })
        )
      ).resolves.toEqual(
        expect.objectContaining({
          command: 'runscript',
          id: expect.any(String),
        })
      );
    });

    it('should handle Microsoft Defender API errors gracefully', async () => {
      const apiError = new Error('Microsoft Defender API error');
      connectorActionsMock.execute.mockRejectedValueOnce(apiError);

      await expect(
        msClientMock.runscript(
          responseActionsClientMock.createRunScriptOptions({
            parameters: { scriptName: 'test-script.ps1' },
          })
        )
      ).rejects.toThrow('Microsoft Defender API error');
    });

    it('should handle missing machine action ID in response', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.RUN_SCRIPT,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: {
            /* missing id */
          },
        })
      );

      await expect(
        msClientMock.runscript(
          responseActionsClientMock.createRunScriptOptions({
            parameters: { scriptName: 'test-script.ps1' },
          })
        )
      ).rejects.toThrow(
        'Run Script request was sent to Microsoft Defender, but Machine Action Id was not provided!'
      );
    });

    it('should include args parameter when provided', async () => {
      await msClientMock.runscript(
        responseActionsClientMock.createRunScriptOptions({
          parameters: { scriptName: 'test-script.ps1', args: 'param1 param2' },
        })
      );

      expect(connectorActionsMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            subActionParams: expect.objectContaining({
              parameters: {
                scriptName: 'test-script.ps1',
                args: 'param1 param2',
              },
            }),
          }),
        })
      );
    });

    it('should omit args parameter when not provided', async () => {
      await msClientMock.runscript(
        responseActionsClientMock.createRunScriptOptions({
          parameters: { scriptName: 'test-script.ps1' },
        })
      );

      expect(connectorActionsMock.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            subActionParams: expect.objectContaining({
              parameters: {
                scriptName: 'test-script.ps1',
                args: undefined,
              },
            }),
          }),
        })
      );
    });

    describe('telemetry event', () => {
      it('should send runscript action creation telemetry event', async () => {
        await msClientMock.runscript(
          responseActionsClientMock.createRunScriptOptions({
            parameters: { scriptName: 'test-script.ps1', args: 'arg1 arg2' },
          })
        );
        expect(
          clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
        ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType, {
          responseActions: {
            actionId: expect.any(String),
            agentType: 'microsoft_defender_endpoint',
            command: 'runscript',
            isAutomated: false,
          },
        });
      });
    });

    describe('MDE action validation and throttling detection', () => {
      beforeEach(() => {
        getActionDetailsByIdMock.mockImplementation(async (_, __, id: string) => {
          return new EndpointActionGenerator('seed').generateActionDetails({
            id,
            command: 'runscript',
          });
        });
      });

      it('should validate action details after sending runscript action', async () => {
        // Uses default mock which dynamically captures and returns matching action details
        await msClientMock.runscript(
          responseActionsClientMock.createRunScriptOptions({
            parameters: { scriptName: 'test-script.ps1' },
          })
        );

        // Verify GET_ACTIONS was called with the machineActionId from the RUN_SCRIPT response
        expect(connectorActionsMock.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            params: expect.objectContaining({
              subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
              subActionParams: expect.objectContaining({
                id: ['5382f7ea-7557-4ab7-9782-d50480024a4e'],
                pageSize: 1,
              }),
            }),
          })
        );
      });

      it('should throw error when MDE returns action with different script name (throttling)', async () => {
        // Access the underlying ActionsClient mock to preserve NormalizedExternalConnectorClient context
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'ok',
                data: {
                  '@odata.context': 'test',
                  value: [
                    {
                      id: '5382f7ea-7557-4ab7-9782-d50480024a4e',
                      type: 'LiveResponse',
                      status: 'InProgress',
                      requestor: 'user@example.com',
                      requestSource: 'API',
                      commands: [
                        {
                          index: 0,
                          startTime: '2025-01-30T10:00:00Z',
                          endTime: '2025-01-30T10:00:10Z',
                          commandStatus: 'InProgress',
                          errors: [],
                          command: {
                            type: 'RunScript',
                            params: [{ key: 'ScriptName', value: 'different-script.ps1' }],
                          },
                        },
                      ],
                      cancellationRequestor: 'elastic',
                      requestorComment: 'Some other comment',
                      cancellationComment: 'test cancel data',
                      machineId: '1-2-3',
                      computerDnsName: 'test-machine',
                      creationDateTimeUtc: '2025-01-30T10:00:00Z',
                      cancellationDateTimeUtc: '',
                      lastUpdateDateTimeUtc: '2025-01-30T10:00:05Z',
                      title: 'Run Script',
                    },
                  ],
                  total: 1,
                  page: 1,
                  pageSize: 1,
                },
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toMatchObject({
          message: expect.stringContaining('Cannot run script'),
          statusCode: 409,
        });
      });

      it('should throw error when MDE returns action without our action ID in comment', async () => {
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'ok',
                data: {
                  '@odata.context': 'test',
                  value: [
                    {
                      id: '5382f7ea-7557-4ab7-9782-d50480024a4e',
                      type: 'LiveResponse',
                      status: 'InProgress',
                      requestor: 'user@example.com',
                      requestSource: 'API',
                      commands: [
                        {
                          index: 0,
                          startTime: '2025-01-30T10:00:00Z',
                          endTime: '2025-01-30T10:00:10Z',
                          commandStatus: 'InProgress',
                          errors: [],
                          command: {
                            type: 'RunScript',
                            params: [{ key: 'ScriptName', value: 'test-script.ps1' }],
                          },
                        },
                      ],
                      cancellationRequestor: 'elastic',
                      requestorComment: 'Comment from different action',
                      cancellationComment: '',
                      machineId: '1-2-3',
                      computerDnsName: 'test-machine',
                      creationDateTimeUtc: '2025-01-30T10:00:00Z',
                      cancellationDateTimeUtc: '',
                      lastUpdateDateTimeUtc: '2025-01-30T10:00:05Z',
                      title: 'Run Script',
                    },
                  ],
                  total: 1,
                  page: 1,
                  pageSize: 1,
                },
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toMatchObject({
          message: expect.stringContaining('Cannot run script'),
          statusCode: 409,
        });
      });

      it('should throw error when GET_ACTIONS returns no action details after retry', async () => {
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'ok',
                data: {
                  '@odata.context': 'test',
                  value: [],
                  total: 0,
                  page: 1,
                  pageSize: 1,
                },
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        pRetryMock.mockImplementationOnce(async (fn) => fn(1));

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toMatchObject({
          message: expect.stringContaining('Action details not found'),
          statusCode: 409,
        });
      });

      it('should throw error when GET_ACTIONS call fails', async () => {
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'error',
                message: 'MDE API temporarily unavailable',
                serviceMessage: 'Service unavailable',
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        pRetryMock.mockImplementationOnce(async (fn) => fn(1));

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toThrow();
      });

      it('should succeed when action details found and validation passes on first attempt', async () => {
        // Uses default mock which handles validation correctly
        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).resolves.toEqual(
          expect.objectContaining({
            command: 'runscript',
            id: expect.any(String),
          })
        );

        // Verify GET_ACTIONS was called (validation occurred)
        const getActionsCalls = (connectorActionsMock.execute as jest.Mock).mock.calls.filter(
          (call) => call[0].params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS
        );
        expect(getActionsCalls.length).toBeGreaterThanOrEqual(1);
      });

      it('should throw 409 error when action has no commands array', async () => {
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'ok',
                data: {
                  '@odata.context': 'test',
                  value: [
                    {
                      id: '5382f7ea-7557-4ab7-9782-d50480024a4e',
                      type: 'LiveResponse',
                      status: 'InProgress',
                      requestor: 'user@example.com',
                      requestSource: 'API',
                      commands: [],
                      cancellationRequestor: '',
                      requestorComment: 'Some comment',
                      cancellationComment: '',
                      machineId: '1-2-3',
                      computerDnsName: 'test-machine',
                      creationDateTimeUtc: '2025-01-30T10:00:00Z',
                      cancellationDateTimeUtc: '',
                      lastUpdateDateTimeUtc: '2025-01-30T10:00:05Z',
                      title: 'Run Script',
                    },
                  ],
                  total: 1,
                  page: 1,
                  pageSize: 1,
                },
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toMatchObject({
          message: expect.stringContaining('Unable to verify action details'),
          statusCode: 409,
        });
      });

      it('should throw 409 error when script name param is missing from action', async () => {
        const underlyingClient = (
          connectorActionsMock as unknown as { connectorsClient: { execute: jest.Mock } }
        ).connectorsClient;
        const defaultMockImpl = underlyingClient.execute.getMockImplementation();

        underlyingClient.execute.mockImplementation(
          async (options: Parameters<typeof underlyingClient.execute>[0]) => {
            if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS) {
              return {
                status: 'ok',
                data: {
                  '@odata.context': 'test',
                  value: [
                    {
                      id: '5382f7ea-7557-4ab7-9782-d50480024a4e',
                      type: 'LiveResponse',
                      status: 'InProgress',
                      requestor: 'user@example.com',
                      requestSource: 'API',
                      commands: [
                        {
                          index: 0,
                          startTime: '2025-01-30T10:00:00Z',
                          endTime: '2025-01-30T10:00:10Z',
                          commandStatus: 'InProgress',
                          errors: [],
                          command: {
                            type: 'RunScript',
                            params: [{ key: 'Args', value: 'some-args' }], // Missing ScriptName
                          },
                        },
                      ],
                      cancellationRequestor: '',
                      requestorComment: 'Action triggered from Elastic Security',
                      cancellationComment: '',
                      machineId: '1-2-3',
                      computerDnsName: 'test-machine',
                      creationDateTimeUtc: '2025-01-30T10:00:00Z',
                      cancellationDateTimeUtc: '',
                      lastUpdateDateTimeUtc: '2025-01-30T10:00:05Z',
                      title: 'Run Script',
                    },
                  ],
                  total: 1,
                  page: 1,
                  pageSize: 1,
                },
                actionId: 'test',
              };
            }

            return defaultMockImpl!(options);
          }
        );

        await expect(
          msClientMock.runscript(
            responseActionsClientMock.createRunScriptOptions({
              parameters: { scriptName: 'test-script.ps1' },
            })
          )
        ).rejects.toMatchObject({
          message: expect.stringContaining('Unable to verify which script is running'),
          statusCode: 409,
        });
      });
    });
  });

  describe('#getFileInfo()', () => {
    beforeEach(() => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
        true;

      const generator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: '123' },
          EndpointActions: {
            data: { command: 'runscript', comment: 'test comment' },
            input_type: 'microsoft_defender_endpoint',
          },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });
    });

    it('should throw error if feature flag is disabled', async () => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
        false;
      await expect(msClientMock.getFileInfo('abc', '123')).rejects.toThrow(
        'File downloads are not supported for microsoft_defender_endpoint agent type. Feature disabled'
      );
    });

    it('should return file info with status AWAITING_UPLOAD when no response document exists', async () => {
      const generator = new EndpointActionGenerator('seed');
      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        response: generator.toEsSearchResponse([]),
      });

      await expect(msClientMock.getFileInfo('abc', '123')).resolves.toEqual({
        actionId: 'abc',
        agentId: '123',
        id: '123',
        agentType: 'microsoft_defender_endpoint',
        status: 'AWAITING_UPLOAD',
        created: '',
        name: '',
        size: 0,
        mimeType: '',
      });
    });

    it('should return file info with status READY when response document exists', async () => {
      const generator = new EndpointActionGenerator('seed');
      const responseEsHit = generator.generateResponseEsHit({
        agent: { id: '123' },
        EndpointActions: {
          data: { command: 'runscript' },
          input_type: 'microsoft_defender_endpoint',
        },
        meta: {
          createdAt: '2024-05-09T10:30:00Z',
          filename: 'script_output.txt',
          machineActionId: 'machine-action-123',
        },
      });

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        response: generator.toEsSearchResponse([responseEsHit]),
      });

      await expect(msClientMock.getFileInfo('abc', '123')).resolves.toEqual({
        actionId: 'abc',
        agentId: '123',
        id: '123',
        agentType: 'microsoft_defender_endpoint',
        status: 'READY',
        created: '2024-05-09T10:30:00Z',
        name: 'script_output.txt',
        size: 0,
        mimeType: 'application/octet-stream',
      });
    });

    it('should throw error for unsupported command types', async () => {
      const generator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: '123' },
          EndpointActions: {
            data: { command: 'isolate', comment: 'test comment' },
            input_type: 'microsoft_defender_endpoint',
          },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });

      const responseEsHit = generator.generateResponseEsHit({
        agent: { id: '123' },
        EndpointActions: {
          data: { command: 'isolate' },
          input_type: 'microsoft_defender_endpoint',
        },
      });

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        response: generator.toEsSearchResponse([responseEsHit]),
      });

      await expect(msClientMock.getFileInfo('abc', '123')).rejects.toThrow(
        'isolate does not support file downloads'
      );
    });

    it('should handle ES client errors properly', async () => {
      // Mock the ES client to throw an error
      (clientConstructorOptionsMock.esClient.search as unknown as jest.Mock).mockRejectedValueOnce(
        new Error('ES client error')
      );

      // The method should catch the error and return AWAITING_UPLOAD status only for ResponseActionAgentResponseEsDocNotFound
      // Other errors should be propagated
      await expect(msClientMock.getFileInfo('abc', '123')).rejects.toThrow('ES client error');
    });
  });

  describe('#getFileDownload()', () => {
    beforeEach(() => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
        true;

      const generator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: '123' },
          EndpointActions: {
            data: { command: 'runscript', comment: 'test comment' },
            input_type: 'microsoft_defender_endpoint',
          },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });

      const responseEsHit = generator.generateResponseEsHit({
        agent: { id: '123' },
        EndpointActions: {
          data: { command: 'runscript' },
          input_type: 'microsoft_defender_endpoint',
        },
        meta: {
          createdAt: '2024-05-09T10:30:00Z',
          filename: 'script_output.txt',
          machineActionId: 'machine-action-123',
        },
      });

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        response: generator.toEsSearchResponse([responseEsHit]),
      });
    });

    it('should throw error if feature flag is disabled', async () => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
        false;
      await expect(msClientMock.getFileDownload('abc', '123')).rejects.toThrow(
        'File downloads are not supported for microsoft_defender_endpoint agent type. Feature disabled'
      );
    });

    it('should successfully download file and verify API call to Microsoft Defender GET_ACTION_RESULTS', async () => {
      const mockStream = new Readable({
        read() {
          this.push('test file content');
          this.push(null);
        },
      });

      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
        { data: mockStream }
      );

      const result = await msClientMock.getFileDownload('abc', '123');

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
          subActionParams: {
            id: 'machine-action-123',
          },
        },
      });

      expect(result).toEqual({
        stream: {
          data: expect.any(Readable),
        },
        fileName: 'script_output.txt',
        mimeType: undefined,
      });
    });

    it('should throw error when Microsoft Defender GET_ACTION_RESULTS API returns no data', async () => {
      // Clear any previous mocks first
      (connectorActionsMock.execute as jest.Mock).mockReset();

      // Mock the connector to return undefined data
      (connectorActionsMock.execute as jest.Mock).mockResolvedValueOnce({
        data: undefined,
      });

      await expect(msClientMock.getFileDownload('abc', '123')).rejects.toThrow(
        'Unable to establish a file download Readable stream with Microsoft Defender for Endpoint for response action [runscript] [abc]'
      );
    });

    it('should throw error when machine action ID is missing in response document', async () => {
      const generator = new EndpointActionGenerator('seed');
      const responseEsHit = generator.generateResponseEsHit({
        agent: { id: '123' },
        EndpointActions: {
          data: { command: 'runscript' },
          input_type: 'microsoft_defender_endpoint',
        },
        meta: {
          createdAt: '2024-05-09T10:30:00Z',
          filename: 'script_output.txt',
          // machineActionId is missing
        },
      });

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTION_RESPONSES_INDEX_PATTERN,
        response: generator.toEsSearchResponse([responseEsHit]),
      });

      await expect(msClientMock.getFileDownload('abc', '123')).rejects.toThrow(
        'Unable to retrieve file from Microsoft Defender for Endpoint. Response ES document is missing [meta.machineActionId]'
      );
    });

    it('should throw error for unsupported command types', async () => {
      const generator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: '123' },
          EndpointActions: {
            data: { command: 'isolate', comment: 'test comment' },
            input_type: 'microsoft_defender_endpoint',
          },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });

      // Note: For unsupported commands, the method will not enter the switch case
      // and downloadStream will remain undefined, causing the method to throw
      await expect(msClientMock.getFileDownload('abc', '123')).rejects.toThrow(
        'Unable to establish a file download Readable stream with Microsoft Defender for Endpoint for response action [isolate] [abc]'
      );
    });

    it('should handle Microsoft Defender API errors and propagate them properly', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: undefined,
        })
      );

      // Mock the connector to throw an error
      (connectorActionsMock.execute as jest.Mock).mockRejectedValueOnce(
        new Error('Microsoft Defender API error')
      );

      await expect(msClientMock.getFileDownload('abc', '123')).rejects.toThrow(
        'Microsoft Defender API error'
      );

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
          subActionParams: {
            id: 'machine-action-123',
          },
        },
      });
    });
  });

  describe('#cancel()', () => {
    beforeEach(() => {
      const generator = new EndpointActionGenerator('seed');
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointCancelEnabled =
        true;

      // Reset mock and ensure it returns a valid pending action
      getActionDetailsByIdMock.mockReset();
      getActionDetailsByIdMock.mockImplementation(async (_, __, id: string) => {
        return new EndpointActionGenerator('seed').generateActionDetails({
          id,
          isCompleted: false,
          wasSuccessful: false,
          command: 'isolate',
          agents: ['1-2-3'],
        });
      });

      // Mock the search for original action request to get external action ID
      const originalActionSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: 'agent-uuid-1' },
          EndpointActions: {
            action_id: 'original-action-id',
            data: { command: 'isolate' },
            input_type: 'microsoft_defender_endpoint',
          },
          meta: { machineActionId: 'external-machine-action-id-123' },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: originalActionSearchResponse,
      });
    });

    it('should send cancel request to Microsoft Defender with expected parameters', async () => {
      await msClientMock.cancel({
        endpoint_ids: ['1-2-3'],
        comment: 'cancel test comment',
        parameters: { id: 'original-action-id' },
      });

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION,
          subActionParams: {
            actionId: 'external-machine-action-id-123',
            comment: expect.stringMatching(
              /Action triggered from Elastic Security by user \[foo\] for action \[.* \(action id: .*\)\]: cancel test comment/
            ),
          },
        },
      });
    });

    it('should write cancel action request doc to endpoint index', async () => {
      await msClientMock.cancel({
        endpoint_ids: ['1-2-3'],
        comment: 'cancel test comment',
        parameters: { id: 'original-action-id' },
      });

      expect(clientConstructorOptionsMock.esClient.index).toHaveBeenCalledWith(
        {
          document: {
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: expect.any(String),
              data: {
                command: 'cancel',
                comment: 'cancel test comment',
                hosts: {
                  '1-2-3': {
                    name: 'mymachine1.contoso.com',
                  },
                },
                parameters: {
                  id: 'original-action-id',
                },
              },
              expiration: expect.any(String),
              input_type: 'microsoft_defender_endpoint',
              type: 'INPUT_ACTION',
            },
            agent: {
              id: ['1-2-3'],
              policy: [
                {
                  agentId: '1-2-3',
                  agentPolicyId: expect.any(String),
                  elasticAgentId: '1-2-3',
                  integrationPolicyId: expect.any(String),
                },
              ],
            },
            originSpaceId: 'default',
            tags: [],
            meta: {
              machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e',
            },
            user: {
              id: 'foo',
            },
          },
          index: '.logs-endpoint.actions-default',
          refresh: 'wait_for',
        },
        { meta: true }
      );
    });

    it('should return action details for cancel request', async () => {
      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        })
      ).resolves.toEqual(
        expect.objectContaining({
          id: expect.any(String),
          command: expect.any(String),
          isCompleted: expect.any(Boolean),
        })
      );
      expect(getActionDetailsByIdMock).toHaveBeenCalled();
    });

    it('should throw error when id parameter is missing', async () => {
      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: '' },
        })
      ).rejects.toThrow('id is required in parameters');
    });

    it('should throw error when parameters are undefined', async () => {
      await expect(
        // @ts-expect-error - intentionally testing missing parameters
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
        })
      ).rejects.toThrow('id is required in parameters');
    });

    it('should throw error when external action ID cannot be resolved', async () => {
      // Mock empty search results for original action
      const generator = new EndpointActionGenerator('seed');
      const emptySearchResponse = generator.toEsSearchResponse([]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: emptySearchResponse,
      });

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'non-existent-action' },
        })
      ).rejects.toThrow("Action with id 'non-existent-action' not found.");
    });

    it('should throw error when original action lacks machineActionId in meta', async () => {
      const generator = new EndpointActionGenerator('seed');

      // Mock original action without machineActionId
      const originalActionSearchResponse = generator.toEsSearchResponse([
        generator.generateActionEsHit<
          undefined,
          {},
          MicrosoftDefenderEndpointActionRequestCommonMeta
        >({
          agent: { id: 'agent-uuid-1' },
          EndpointActions: {
            action_id: 'action-without-external-id',
            data: { command: 'isolate' },
            input_type: 'microsoft_defender_endpoint',
          },
          meta: {}, // Missing machineActionId
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: ENDPOINT_ACTIONS_INDEX,
        response: originalActionSearchResponse,
      });

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'action-without-external-id' },
        })
      ).rejects.toThrow(
        'Unable to resolve Microsoft Defender machine action ID for action [action-without-external-id]'
      );
    });

    it('should handle Microsoft Defender API errors gracefully', async () => {
      const apiError = new Error('Microsoft Defender cancel API error');
      connectorActionsMock.execute.mockImplementation(async (options) => {
        if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION) {
          throw apiError;
        }
        return responseActionsClientMock.createConnectorActionExecuteResponse();
      });

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        })
      ).rejects.toThrow('Microsoft Defender cancel API error');
    });

    it('should throw validation error when attempting to cancel a cancel action', async () => {
      // Mock getActionDetailsById to return a cancel action
      getActionDetailsByIdMock.mockResolvedValueOnce(
        new EndpointActionGenerator('seed').generateActionDetails({
          id: 'cancel-action-id',
          command: 'cancel',
          isCompleted: false,
          wasSuccessful: false,
          agents: ['1-2-3'],
        })
      );

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'trying to cancel a cancel action',
          parameters: { id: 'cancel-action-id' },
        })
      ).rejects.toMatchObject({
        message: '[cancel] response action cannot be canceled.',
        statusCode: 400,
      });

      // Verify that the connector was NOT called since validation should fail first
      expect(connectorActionsMock.execute).not.toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION,
          }),
        })
      );
    });

    it('should handle MDE error when action status is not Pending or InProgress', async () => {
      const mdeError = new Error(
        'Attempt to send [cancelAction] to Microsoft Defender for Endpoint failed: Status code: 400. Message: API Error: [Bad Request] Request failed with status code 400\n' +
          'URL called:[post] https://api.securitycenter.windows.com/api/machineactions/357dd251-e714-4a6e-b00a-93c06d87aaff/cancel\n' +
          'Response body: {"error":{"code":"BadRequest","message":"Canceled machine action status must be Pending or InProgress, Current Status: Failed, machineActionId: 357dd251-e714-4a6e-b00a-93c06d87aaff","target":"|00-fdaabbeb2ebe3146b47f958d7b671dcd-e13c20d6f3402a0d-01.8c111081_1.1."}}'
      );

      connectorActionsMock.execute.mockImplementation(async (options) => {
        if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION) {
          throw mdeError;
        }
        return responseActionsClientMock.createConnectorActionExecuteResponse();
      });

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        })
      ).rejects.toThrow(
        'Attempt to send [cancelAction] to Microsoft Defender for Endpoint failed: Status code: 400. Message: API Error: [Bad Request] Request failed with status code 400'
      );
    });

    it('should handle missing machine action ID in cancel response', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: {
            /* missing id */
          },
        })
      );

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        })
      ).rejects.toThrow(
        'Cancel request was sent to Microsoft Defender, but Machine Action Id was not provided!'
      );
    });

    it('should handle ES client errors when resolving external action ID', async () => {
      const generator = new EndpointActionGenerator('seed');

      // Mock ES client to throw error specifically when searching for original action
      const originalEsClientSearch = clientConstructorOptionsMock.esClient.search;

      (clientConstructorOptionsMock.esClient.search as unknown as jest.Mock).mockImplementation(
        (searchRequest: Parameters<typeof clientConstructorOptionsMock.esClient.search>[0]) => {
          if (!searchRequest) {
            return Promise.resolve(generator.toEsSearchResponse([]));
          }

          // First few calls are for agent policy info - handle normally
          if (
            searchRequest.index === MICROSOFT_DEFENDER_ENDPOINT_LOG_INDEX_PATTERN ||
            (Array.isArray(searchRequest.index) &&
              searchRequest.index.includes('logs-microsoft_defender_endpoint.log-default'))
          ) {
            const msLogIndexEsHit = new MicrosoftDefenderDataGenerator(
              'seed'
            ).generateEndpointLogEsHit({
              cloud: { instance: { id: '1-2-3' } },
            });
            msLogIndexEsHit.inner_hits = {
              most_recent: {
                hits: {
                  hits: [
                    {
                      _index: '',
                      _source: {
                        agent: { id: '1-2-3' },
                        cloud: { instance: { id: '1-2-3' } },
                      },
                    },
                  ],
                },
              },
            };
            return Promise.resolve(
              new MicrosoftDefenderDataGenerator('seed').generateEndpointLogEsSearchResponse([
                msLogIndexEsHit,
              ])
            );
          }

          // Throw error specifically for original action lookup
          if (
            searchRequest.index === ENDPOINT_ACTIONS_INDEX &&
            searchRequest.query?.term?.action_id
          ) {
            throw new Error('ES search error for original action');
          }

          return Promise.resolve(generator.toEsSearchResponse([]));
        }
      );

      await expect(
        msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        })
      ).rejects.toThrow("Action with id 'original-action-id' not found.");

      // Restore original mock
      (clientConstructorOptionsMock.esClient.search as unknown as jest.Mock).mockImplementation(
        originalEsClientSearch
      );
    });

    describe('validation scenarios', () => {
      it('should reject cancel request for already completed action', async () => {
        // Mock getActionDetailsById to return a completed action
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'completed-action-id',
          command: 'isolate',
          isCompleted: true,
          wasSuccessful: true,
          agents: ['1-2-3'],
        });

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'completed-action-id' },
          })
        ).rejects.toThrow(
          'Cannot cancel action [completed-action-id] because it has already completed successfully'
        );

        // Should not call connector if validation fails
        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should reject cancel request for already failed action', async () => {
        // Mock getActionDetailsById to return a failed action
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'failed-action-id',
          command: 'isolate',
          isCompleted: true,
          wasSuccessful: false,
          agents: ['1-2-3'],
        });

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'failed-action-id' },
          })
        ).rejects.toThrow('Cannot cancel action [failed-action-id] because it has already failed.');

        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should reject cancel request when endpoint ID is not associated with action', async () => {
        // Mock getActionDetailsById to return an action for a different agent
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'other-agent-action-id',
          command: 'isolate',
          isCompleted: false,
          wasSuccessful: false,
          agents: ['different-agent-id'],
        });

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'other-agent-action-id' },
          })
        ).rejects.toThrow("Endpoint '1-2-3' is not associated with action 'other-agent-action-id'");

        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should reject cancel request when action command information is missing', async () => {
        // Mock getActionDetailsById to return an action without command info
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'no-command-action-id',
          command: undefined, // Missing command
          isCompleted: false,
          wasSuccessful: false,
          agents: ['1-2-3'],
        });

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'no-command-action-id' },
          })
        ).rejects.toThrow("Unable to determine command type for action 'no-command-action-id'");

        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should reject cancel request when action is not found', async () => {
        // Mock getActionDetailsById to throw "not found" error
        getActionDetailsByIdMock.mockRejectedValue(
          new Error("Action with id 'non-existent-action' not found")
        );

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'non-existent-action' },
          })
        ).rejects.toThrow("Action with id 'non-existent-action' not found.");

        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should allow cancel request for valid pending action', async () => {
        // Mock getActionDetailsById to return a valid pending action
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'valid-pending-action',
          command: 'isolate',
          isCompleted: false,
          wasSuccessful: false,
          agents: ['1-2-3'],
        });

        // Mock successful external action lookup
        const generator = new EndpointActionGenerator('seed');
        const originalActionSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            undefined,
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            agent: { id: 'agent-uuid-1' },
            EndpointActions: {
              action_id: 'valid-pending-action',
              data: { command: 'isolate' },
              input_type: 'microsoft_defender_endpoint',
            },
            meta: { machineActionId: 'external-machine-action-id-456' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: originalActionSearchResponse,
        });

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'valid-pending-action' },
          })
        ).resolves.toMatchObject({
          id: expect.any(String),
          command: expect.any(String),
          isCompleted: expect.any(Boolean),
        });

        // Should call connector for valid request
        expect(connectorActionsMock.execute).toHaveBeenCalledWith({
          params: {
            subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION,
            subActionParams: {
              actionId: 'external-machine-action-id-456',
              comment: expect.any(String),
            },
          },
        });
      });

      it('should handle multiple agents array in validation', async () => {
        // Mock getActionDetailsById to return an action with multiple agents
        getActionDetailsByIdMock.mockResolvedValue({
          id: 'multi-agent-action-id',
          command: 'isolate',
          isCompleted: false,
          wasSuccessful: false,
          agents: ['agent-1', '1-2-3', 'agent-3'], // Array with our target agent
        });

        // Mock successful external action lookup
        const generator = new EndpointActionGenerator('seed');
        const originalActionSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            undefined,
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            agent: { id: 'agent-uuid-1' },
            EndpointActions: {
              action_id: 'multi-agent-action-id',
              data: { command: 'isolate' },
              input_type: 'microsoft_defender_endpoint',
            },
            meta: { machineActionId: 'external-machine-action-id-789' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: originalActionSearchResponse,
        });

        // Should succeed because 1-2-3 is in the agents array
        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'multi-agent-action-id' },
          })
        ).resolves.toMatchObject({
          id: expect.any(String),
          command: expect.any(String),
          isCompleted: expect.any(Boolean),
        });
      });

      it('should handle unexpected errors during validation gracefully', async () => {
        // Mock getActionDetailsById to throw an unexpected error (not "not found")
        const unexpectedError = new Error('Database connection failed');
        getActionDetailsByIdMock.mockRejectedValue(unexpectedError);

        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: 'some-action-id' },
          })
        ).rejects.toThrow('Database connection failed');

        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });

      it('should validate id parameter is not empty string', async () => {
        await expect(
          msClientMock.cancel({
            endpoint_ids: ['1-2-3'],
            comment: 'cancel test comment',
            parameters: { id: '' }, // Empty string should be rejected
          })
        ).rejects.toThrow('id is required in parameters');

        // getActionDetailsById may be called during validation but should fail before connector call
        expect(connectorActionsMock.execute).not.toHaveBeenCalled();
      });
    });

    describe('telemetry events', () => {
      beforeEach(() => {
        // Reset mock and ensure it returns a valid pending action
        getActionDetailsByIdMock.mockReset();
        getActionDetailsByIdMock.mockImplementation(async (_, __, id: string) => {
          return new EndpointActionGenerator('seed').generateActionDetails({
            id,
            isCompleted: false, // Ensure not completed so cancel can proceed
            wasSuccessful: false,
            command: 'isolate',
            agents: ['1-2-3'],
          });
        });
      });

      it('should send cancel action creation telemetry event', async () => {
        await msClientMock.cancel({
          endpoint_ids: ['1-2-3'],
          comment: 'cancel test comment',
          parameters: { id: 'original-action-id' },
        });

        expect(
          clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
        ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType, {
          responseActions: {
            actionId: expect.any(String),
            agentType: 'microsoft_defender_endpoint',
            command: 'cancel',
            isAutomated: false,
          },
        });
      });
    });
  });

  describe('#getCustomScripts()', () => {
    it('should retrieve custom scripts from Microsoft Defender', async () => {
      const result = await msClientMock.getCustomScripts();

      expect(connectorActionsMock.execute).toHaveBeenCalledWith({
        params: {
          subAction: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
          subActionParams: {},
        },
      });

      expect(result).toEqual({
        data: [
          {
            id: 'test-script-1.ps1',
            name: 'test-script-1.ps1',
            description: 'Test PowerShell script for demonstration',
          },
          {
            id: 'test-script-2.py',
            name: 'test-script-2.py',
            description: 'Test Python script for automation',
          },
        ],
      });
    });

    it('should handle empty library files response', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: { '@odata.context': 'some-context', value: [] },
        })
      );

      const result = await msClientMock.getCustomScripts();

      expect(result).toEqual({ data: [] });
    });

    it('should handle missing data in library files response', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: {},
        })
      );

      const result = await msClientMock.getCustomScripts();

      expect(result).toEqual({ data: [] });
    });

    it('should handle Microsoft Defender API errors gracefully', async () => {
      const apiError = new Error('Microsoft Defender API error');
      connectorActionsMock.execute.mockImplementation(async (options) => {
        if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES) {
          throw apiError;
        }
        return responseActionsClientMock.createConnectorActionExecuteResponse();
      });

      await expect(msClientMock.getCustomScripts()).rejects.toThrow(
        'Failed to fetch Microsoft Defender for Endpoint scripts, failed with: Microsoft Defender API error'
      );
    });

    it('should handle null response data', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: null,
        })
      );

      const result = await msClientMock.getCustomScripts();

      expect(result).toEqual({ data: [] });
    });

    it('should handle undefined response data', async () => {
      responseActionsClientMock.setConnectorActionsClientExecuteResponse(
        connectorActionsMock,
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
        responseActionsClientMock.createConnectorActionExecuteResponse({
          data: undefined,
        })
      );

      const result = await msClientMock.getCustomScripts();

      expect(result).toEqual({ data: [] });
    });

    it('should throw ResponseActionsClientError on API failure', async () => {
      const apiError = new Error('Microsoft Defender API error');

      connectorActionsMock.execute.mockImplementation(async (options) => {
        if (options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES) {
          throw apiError;
        }
        return responseActionsClientMock.createConnectorActionExecuteResponse();
      });

      await expect(msClientMock.getCustomScripts()).rejects.toThrow(
        'Failed to fetch Microsoft Defender for Endpoint scripts, failed with: Microsoft Defender API error'
      );
    });
  });

  describe('#processPendingActions()', () => {
    let abortController: AbortController;
    let processPendingActionsOptions: ProcessPendingActionsMethodOptions;

    const setGetRunscriptResponseFile = (response: {
      script_name?: string;
      script_output?: string;
      script_errors?: string;
      exit_code?: number;
    }) => {
      const executeMockFn = (connectorActionsMock.execute as jest.Mock).getMockImplementation();

      (connectorActionsMock.execute as jest.Mock).mockImplementation(async (options) => {
        if (
          options.params.subAction === MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS
        ) {
          return responseActionsClientMock.createConnectorActionExecuteResponse({
            data: new Readable({
              read() {
                this.push(JSON.stringify(response));
                this.push(null);
              },
            }),
          });
        }

        return executeMockFn!.call(connectorActionsMock, options);
      });
    };

    beforeEach(() => {
      abortController = new AbortController();
      processPendingActionsOptions = {
        abortSignal: abortController.signal,
        addToQueue: jest.fn(),
      };
    });

    describe('for Isolate and Release', () => {
      let msMachineActionsApiResponse: MicrosoftDefenderEndpointGetActionsResponse;

      beforeEach(() => {
        const generator = new EndpointActionGenerator('seed');

        const actionRequestsSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            undefined,
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            agent: { id: 'agent-uuid-1' },
            EndpointActions: {
              data: { command: 'isolate' },
              input_type: 'microsoft_defender_endpoint',
            },
            meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: jest
            .fn(() => generator.toEsSearchResponse([]))
            .mockReturnValueOnce(actionRequestsSearchResponse),
          pitUsage: true,
        });

        msMachineActionsApiResponse = microsoftDefenderMock.createGetActionsApiResponse();
        responseActionsClientMock.setConnectorActionsClientExecuteResponse(
          connectorActionsMock,
          MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
          msMachineActionsApiResponse
        );

        const msGetActionResultsApiResponse =
          microsoftDefenderMock.createGetActionResultsApiResponse();

        // Set the mock response for GET_ACTION_RESULTS
        responseActionsClientMock.setConnectorActionsClientExecuteResponse(
          connectorActionsMock,
          MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
          msGetActionResultsApiResponse
        );
      });

      it('should generate action response docs for completed actions', async () => {
        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith({
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
            completed_at: expect.any(String),
            data: { command: 'isolate' },
            input_type: 'microsoft_defender_endpoint',
            started_at: expect.any(String),
          },
          agent: { id: 'agent-uuid-1' },
          error: undefined,
          meta: undefined,
        });
      });

      it.each<MicrosoftDefenderEndpointMachineAction['status']>(['Pending', 'InProgress'])(
        'should NOT generate action responses if action in MS Defender as a status of %s',
        async (machineActionStatus) => {
          msMachineActionsApiResponse.value[0].status = machineActionStatus;
          await msClientMock.processPendingActions(processPendingActionsOptions);

          expect(processPendingActionsOptions.addToQueue).not.toHaveBeenCalled();
        }
      );

      it.each`
        msStatusValue  | responseState
        ${'Failed'}    | ${'failure'}
        ${'TimeOut'}   | ${'failure'}
        ${'Cancelled'} | ${'canceled'}
        ${'Succeeded'} | ${'success'}
      `(
        'should generate $responseState action response if MS machine action status is $msStatusValue',
        async ({ msStatusValue, responseState }) => {
          msMachineActionsApiResponse.value[0].status = msStatusValue;
          const expectedResult: LogsEndpointActionResponse = {
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
              completed_at: expect.any(String),
              data: { command: 'isolate' },
              input_type: 'microsoft_defender_endpoint',
              started_at: expect.any(String),
            },
            agent: { id: 'agent-uuid-1' },
            error: undefined,
            meta: undefined,
          };
          if (responseState === 'failure' || responseState === 'canceled') {
            expectedResult.error = {
              message: expect.any(String),
            };
          }
          if (responseState === 'canceled') {
            expectedResult.EndpointActions.data.output = {
              content: expect.objectContaining({
                canceled_by: 'action',
                canceled_id: '',
              }),
              type: 'json',
            };
          }
          await msClientMock.processPendingActions(processPendingActionsOptions);

          expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(expectedResult);
        }
      );
    });

    describe('for Runscript', () => {
      let msMachineActionsApiResponse: MicrosoftDefenderEndpointGetActionsResponse;

      beforeEach(() => {
        // @ts-expect-error assign to readonly property
        clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
          true;

        const generator = new EndpointActionGenerator('seed');

        const actionRequestsSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            { scriptName: string },
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            agent: { id: 'agent-uuid-1' },
            EndpointActions: {
              data: { command: 'runscript', parameters: { scriptName: 'test-script.ps1' } },
              input_type: 'microsoft_defender_endpoint',
            },
            meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: jest
            .fn(() => generator.toEsSearchResponse([]))
            .mockReturnValueOnce(actionRequestsSearchResponse),
          pitUsage: true,
        });

        msMachineActionsApiResponse = microsoftDefenderMock.createGetActionsApiResponse();
        // Override the default machine action to be runscript-specific
        msMachineActionsApiResponse.value[0] = {
          ...msMachineActionsApiResponse.value[0],
          type: 'LiveResponse',
          commands: [
            {
              index: 0,
              startTime: '2025-07-07T18:50:10.186354Z',
              endTime: '2025-07-07T18:50:21.811356Z',
              commandStatus: 'Completed',
              errors: [],
              command: {
                type: 'RunScript',
                params: [{ key: 'ScriptName', value: 'hello.sh' }],
              },
            },
          ],
        };

        responseActionsClientMock.setConnectorActionsClientExecuteResponse(
          connectorActionsMock,
          MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
          msMachineActionsApiResponse
        );

        const msGetActionResultsApiResponse =
          microsoftDefenderMock.createGetActionResultsApiResponse();

        // Set the mock response for GET_ACTION_RESULTS
        responseActionsClientMock.setConnectorActionsClientExecuteResponse(
          connectorActionsMock,
          MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
          msGetActionResultsApiResponse
        );
      });

      it('should generate action response docs for completed runscript actions', async () => {
        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith({
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
            completed_at: expect.any(String),
            data: {
              command: 'runscript',
              output: expect.objectContaining({
                type: 'json',
                content: expect.objectContaining({
                  code: expect.any(String),
                  stdout: expect.any(String),
                  stderr: expect.any(String),
                }),
              }),
            },
            input_type: 'microsoft_defender_endpoint',
            started_at: expect.any(String),
          },
          agent: { id: 'agent-uuid-1' },
          error: undefined,
          meta: expect.objectContaining({
            createdAt: expect.any(String),
            filename: expect.any(String),
            machineActionId: expect.any(String),
          }),
        });
      });

      it.each<MicrosoftDefenderEndpointMachineAction['status']>(['Pending', 'InProgress'])(
        'should NOT generate action responses if runscript action in MS Defender has a status of %s',
        async (machineActionStatus) => {
          msMachineActionsApiResponse.value[0].status = machineActionStatus;
          await msClientMock.processPendingActions(processPendingActionsOptions);

          expect(processPendingActionsOptions.addToQueue).not.toHaveBeenCalled();
        }
      );

      it.each`
        msStatusValue  | responseState
        ${'Failed'}    | ${'failure'}
        ${'TimeOut'}   | ${'failure'}
        ${'Cancelled'} | ${'failure'}
        ${'Succeeded'} | ${'success'}
      `(
        'should generate $responseState action response if MS runscript machine action status is $msStatusValue',
        async ({ msStatusValue, responseState }) => {
          msMachineActionsApiResponse.value[0].status = msStatusValue;
          const expectedResult: LogsEndpointActionResponse = {
            '@timestamp': expect.any(String),
            EndpointActions: {
              action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
              completed_at: expect.any(String),
              data: {
                command: 'runscript',
                output: expect.objectContaining({
                  type: 'json',
                  content: expect.objectContaining({
                    code: expect.any(String),
                    stdout: expect.any(String),
                    stderr: expect.any(String),
                  }),
                }),
              },
              input_type: 'microsoft_defender_endpoint',
              started_at: expect.any(String),
            },
            agent: { id: 'agent-uuid-1' },
            error: undefined,
            meta: expect.objectContaining({
              machineActionId: expect.any(String),
              createdAt: expect.any(String),
              filename: expect.any(String),
            }),
          };
          if (responseState === 'failure') {
            expectedResult.error = {
              message: expect.any(String),
            };
          }
          await msClientMock.processPendingActions(processPendingActionsOptions);

          expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(expectedResult);
        }
      );

      it('should set error.message to all command errors joined by newline if present', async () => {
        // Arrange: set up a completed runscript machine action with command errors
        msMachineActionsApiResponse.value[0].status = 'Failed';
        msMachineActionsApiResponse.value[0].commands = [
          {
            command: { type: 'RunScript', params: [] },
            errors: [
              'Running script on endpoint failed: Error in Download Script phase: One or more arguments are invalid.',
              'Another error',
            ],
            index: 0,
            startTime: '2025-07-07T14:07:27.570687Z',
            endTime: '2025-07-07T14:07:48.936317Z',
            commandStatus: 'Completed',
          },
        ];

        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(
          expect.objectContaining({
            error: {
              message:
                'Running script on endpoint failed: Error in Download Script phase: One or more arguments are invalid.\nAnother error',
            },
          })
        );
      });

      it('should have an script output in the completed response when file size is within limit', async () => {
        setGetRunscriptResponseFile({
          script_name: 'list-files.sh',
          exit_code: 0,
          script_output:
            'Files and directories in /home/ubuntu/:\ntotal 116\ndrwxr-x--- 4 ubuntu ubuntu  4096 Nov 10 13:53 .\ndrwxr-xr-x 3 root   root    4096 Nov 10 10:26 ..\n-rw------- 1 ubuntu ubuntu   126 Nov 10 13:53 .bash_history\n-rw-r--r-- 1 ubuntu ubuntu   220 Jan  6  2022 .bash_logout\n-rw-r--r-- 1 ubuntu ubuntu  3771 Jan  6  2022 .bashrc\ndrwx------ 2 ubuntu ubuntu  4096 Nov 10 10:26 .cache\n-rw-r--r-- 1 ubuntu ubuntu   807 Jan  6  2022 .profile\ndrwx------ 2 ubuntu ubuntu  4096 Nov 10 10:26 .ssh\n-rw-r--r-- 1 ubuntu ubuntu     0 Nov 10 10:26 .sudo_as_admin_successful\n-rw-r--r-- 1 ubuntu ubuntu  5550 Nov 10 10:26 GatewayWindowsDefenderATPOnboardingPackage.zip\n-rw-r--r-- 1 ubuntu ubuntu  9067 Dec 17  2024 MicrosoftDefenderATPOnboardingLinuxServer.py\n-rwxrwxr-x 1 ubuntu ubuntu 63356 Nov 10 10:26 mde_installer.sh\n',
          script_errors: '',
        });

        msMachineActionsApiResponse.value[0].status = 'Succeeded';

        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(
          expect.objectContaining({
            EndpointActions: expect.objectContaining({
              data: expect.objectContaining({
                command: 'runscript',
                output: expect.objectContaining({
                  type: 'json',
                  content: expect.objectContaining({
                    code: expect.stringContaining('0'),
                    stderr: expect.stringContaining(''),
                    stdout: expect.stringContaining(
                      'Files and directories in /home/ubuntu/:\ntotal 116'
                    ),
                  }),
                }),
              }),
            }),
          })
        );
      });
    });

    describe('telemetry events', () => {
      describe('for Isolate and Release', () => {
        let msMachineActionsApiResponse: MicrosoftDefenderEndpointGetActionsResponse;

        beforeEach(() => {
          const generator = new EndpointActionGenerator('seed');

          const actionRequestsSearchResponse = generator.toEsSearchResponse([
            generator.generateActionEsHit<
              undefined,
              {},
              MicrosoftDefenderEndpointActionRequestCommonMeta
            >({
              agent: { id: 'agent-uuid-1' },
              EndpointActions: {
                data: { command: 'isolate' },
                input_type: 'microsoft_defender_endpoint',
              },
              meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
            }),
          ]);

          applyEsClientSearchMock({
            esClientMock: clientConstructorOptionsMock.esClient,
            index: ENDPOINT_ACTIONS_INDEX,
            response: jest
              .fn(() => generator.toEsSearchResponse([]))
              .mockReturnValueOnce(actionRequestsSearchResponse),
            pitUsage: true,
          });

          msMachineActionsApiResponse = microsoftDefenderMock.createGetActionsApiResponse();
          responseActionsClientMock.setConnectorActionsClientExecuteResponse(
            connectorActionsMock,
            MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
            msMachineActionsApiResponse
          );

          const msGetActionResultsApiResponse =
            microsoftDefenderMock.createGetActionResultsApiResponse();

          // Set the mock response for GET_ACTION_RESULTS
          responseActionsClientMock.setConnectorActionsClientExecuteResponse(
            connectorActionsMock,
            MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
            msGetActionResultsApiResponse
          );
        });

        it.each`
          msStatusValue  | responseState
          ${'Failed'}    | ${'failed'}
          ${'TimeOut'}   | ${'failed'}
          ${'Cancelled'} | ${'canceled'}
          ${'Succeeded'} | ${'successful'}
        `(
          'should send telemetry for $responseState action response if MS machine action status is $msStatusValue',
          async ({ msStatusValue, responseState }) => {
            msMachineActionsApiResponse.value[0].status = msStatusValue;

            await msClientMock.processPendingActions(processPendingActionsOptions);
            expect(
              clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
            ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT.eventType, {
              responseActions: {
                actionId: expect.any(String),
                actionStatus: responseState,
                agentType: 'microsoft_defender_endpoint',
                command: 'isolate',
              },
            });
          }
        );
      });

      describe('for Runscript', () => {
        let msMachineActionsApiResponse: MicrosoftDefenderEndpointGetActionsResponse;

        beforeEach(() => {
          // @ts-expect-error assign to readonly property
          clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointRunScriptEnabled =
            true;

          const generator = new EndpointActionGenerator('seed');

          const actionRequestsSearchResponse = generator.toEsSearchResponse([
            generator.generateActionEsHit<
              { scriptName: string },
              {},
              MicrosoftDefenderEndpointActionRequestCommonMeta
            >({
              agent: { id: 'agent-uuid-1' },
              EndpointActions: {
                data: { command: 'runscript', parameters: { scriptName: 'test-script.ps1' } },
                input_type: 'microsoft_defender_endpoint',
              },
              meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
            }),
          ]);

          applyEsClientSearchMock({
            esClientMock: clientConstructorOptionsMock.esClient,
            index: ENDPOINT_ACTIONS_INDEX,
            response: jest
              .fn(() => generator.toEsSearchResponse([]))
              .mockReturnValueOnce(actionRequestsSearchResponse),
            pitUsage: true,
          });

          msMachineActionsApiResponse = microsoftDefenderMock.createGetActionsApiResponse();
          // Override the default machine action to be runscript-specific
          msMachineActionsApiResponse.value[0] = {
            ...msMachineActionsApiResponse.value[0],
            type: 'LiveResponse',
            commands: [
              {
                index: 0,
                startTime: '2025-07-07T18:50:10.186354Z',
                endTime: '2025-07-07T18:50:21.811356Z',
                commandStatus: 'Completed',
                errors: [],
                command: {
                  type: 'RunScript',
                  params: [{ key: 'ScriptName', value: 'hello.sh' }],
                },
              },
            ],
          };

          responseActionsClientMock.setConnectorActionsClientExecuteResponse(
            connectorActionsMock,
            MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
            msMachineActionsApiResponse
          );

          const msGetActionResultsApiResponse =
            microsoftDefenderMock.createGetActionResultsApiResponse();

          // Set the mock response for GET_ACTION_RESULTS
          responseActionsClientMock.setConnectorActionsClientExecuteResponse(
            connectorActionsMock,
            MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
            msGetActionResultsApiResponse
          );
        });

        it('should send telemetry for completed runscript actions', async () => {
          await msClientMock.processPendingActions(processPendingActionsOptions);

          expect(
            clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
          ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT.eventType, {
            responseActions: {
              actionId: expect.any(String),
              actionStatus: 'successful',
              agentType: 'microsoft_defender_endpoint',
              command: 'runscript',
            },
          });
        });

        it.each`
          msStatusValue  | responseState
          ${'Failed'}    | ${'failed'}
          ${'TimeOut'}   | ${'failed'}
          ${'Cancelled'} | ${'canceled'}
          ${'Succeeded'} | ${'successful'}
        `(
          'should generate $responseState action response if MS runscript machine action status is $msStatusValue',
          async ({ msStatusValue, responseState }) => {
            msMachineActionsApiResponse.value[0].status = msStatusValue;

            await msClientMock.processPendingActions(processPendingActionsOptions);

            expect(
              clientConstructorOptionsMock.endpointService.getTelemetryService().reportEvent
            ).toHaveBeenCalledWith(ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT.eventType, {
              responseActions: {
                actionId: expect.any(String),
                actionStatus: responseState,
                agentType: 'microsoft_defender_endpoint',
                command: 'runscript',
              },
            });
          }
        );
      });
    });

    describe('for Cancel actions with Cancelled status', () => {
      let msMachineActionsApiResponse: MicrosoftDefenderEndpointGetActionsResponse;

      beforeEach(() => {
        const generator = new EndpointActionGenerator('seed');

        // Set up a cancel action request
        const actionRequestsSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            { id: string },
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            EndpointActions: {
              action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
              data: { command: 'cancel', parameters: { id: 'target-action-id' } },
            },
            agent: { id: 'agent-uuid-1' },
            meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: jest
            .fn(() => generator.toEsSearchResponse([]))
            .mockReturnValueOnce(actionRequestsSearchResponse),
          pitUsage: true,
        });

        // Set up the MS API response
        msMachineActionsApiResponse = microsoftDefenderMock.createGetActionsApiResponse(
          microsoftDefenderMock.createMachineAction({
            id: '5382f7ea-7557-4ab7-9782-d50480024a4e',
            status: 'Cancelled',
          })
        );

        responseActionsClientMock.setConnectorActionsClientExecuteResponse(
          connectorActionsMock,
          MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
          msMachineActionsApiResponse
        );
      });

      it('should generate success response for cancel action with Cancelled status', async () => {
        const expectedResult: LogsEndpointActionResponse = {
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: '90d62689-f72d-4a05-b5e3-500cad0dc366',
            completed_at: expect.any(String),
            data: { command: 'cancel' },
            input_type: 'microsoft_defender_endpoint',
            started_at: expect.any(String),
          },
          agent: { id: 'agent-uuid-1' },
          error: undefined, // Cancel action should succeed, no error
          meta: undefined,
        };

        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(expectedResult);
      });

      it('should generate failure response for non-cancel action with Cancelled status', async () => {
        // Update the action to be an isolate action (not a cancel action)
        const generator = new EndpointActionGenerator('seed');
        const actionRequestsSearchResponse = generator.toEsSearchResponse([
          generator.generateActionEsHit<
            undefined,
            {},
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >({
            EndpointActions: {
              action_id: '90d62689-f72d-4b5e3-500cad0dc366',
              data: { command: 'isolate' },
            },
            agent: { id: 'agent-uuid-1' },
            meta: { machineActionId: '5382f7ea-7557-4ab7-9782-d50480024a4e' },
          }),
        ]);

        applyEsClientSearchMock({
          esClientMock: clientConstructorOptionsMock.esClient,
          index: ENDPOINT_ACTIONS_INDEX,
          response: jest
            .fn(() => generator.toEsSearchResponse([]))
            .mockReturnValueOnce(actionRequestsSearchResponse),
          pitUsage: true,
        });

        const expectedResult: LogsEndpointActionResponse = {
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: '90d62689-f72d-4b5e3-500cad0dc366',
            completed_at: expect.any(String),
            data: {
              command: 'isolate',
              output: {
                content: expect.objectContaining({
                  canceled_by: 'action',
                  canceled_id: '',
                }),
                type: 'json',
              },
            },
            input_type: 'microsoft_defender_endpoint',
            started_at: expect.any(String),
          },
          agent: { id: 'agent-uuid-1' },
          error: {
            message: expect.any(String), // Isolate action that was cancelled should fail
          },
          meta: undefined,
        };

        await msClientMock.processPendingActions(processPendingActionsOptions);

        expect(processPendingActionsOptions.addToQueue).toHaveBeenCalledWith(expectedResult);
      });
    });
  });

  describe('and space awareness is enabled', () => {
    beforeEach(() => {
      // @ts-expect-error assign to readonly property
      clientConstructorOptionsMock.endpointService.experimentalFeatures.microsoftDefenderEndpointCancelEnabled =
        true;
      getActionDetailsByIdMock.mockImplementation(async (_, __, id: string) => {
        return new EndpointActionGenerator('seed').generateActionDetails({
          id,
          isCompleted: false, // Ensure not completed so cancel can proceed
          wasSuccessful: false,
          command: 'isolate',
          agents: ['1-2-3'],
        });
      });
    });
    afterEach(() => {
      getActionDetailsByIdMock.mockReset();
    });

    it('should write action request doc with agent policy info when space awareness is enabled', async () => {
      await msClientMock.isolate(responseActionsClientMock.createIsolateOptions());

      expect(clientConstructorOptionsMock.esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            agent: {
              id: ['1-2-3'],
              policy: [
                {
                  agentId: '1-2-3',
                  agentPolicyId: '6f12b025-fcb0-4db4-99e5-4927e3502bb8',
                  elasticAgentId: '1-2-3',
                  integrationPolicyId: '90d62689-f72d-4a05-b5e3-500cad0dc366',
                },
              ],
            },
          }),
        }),
        expect.anything()
      );
    });

    it('should search for MS defender agent using correct index names', async () => {
      await expect(
        msClientMock.isolate(responseActionsClientMock.createIsolateOptions())
      ).resolves.toBeTruthy();

      expect(clientConstructorOptionsMock.esClient.search).toHaveBeenCalledWith({
        _source: false,
        collapse: {
          field: 'cloud.instance.id',
          inner_hits: {
            _source: ['agent', 'cloud.instance.id', 'event.created'],
            name: 'most_recent',
            size: 1,
            sort: [{ 'event.created': 'desc' }],
          },
        },
        ignore_unavailable: true,
        index: ['logs-microsoft_defender_endpoint.log-default'], // << Important: should NOT contain a index pattern
        query: {
          bool: { filter: [{ terms: { 'cloud.instance.id': ['1-2-3'] } }] },
        },
      });
    });

    it('should error is unable to find MS agent in ingested data', async () => {
      applyEsClientSearchMock({
        esClientMock: clientConstructorOptionsMock.esClient,
        index: MICROSOFT_DEFENDER_ENDPOINT_LOG_INDEX_PATTERN,
        response: MicrosoftDefenderDataGenerator.toEsSearchResponse([]),
      });

      await expect(
        msClientMock.isolate(responseActionsClientMock.createIsolateOptions())
      ).rejects.toThrow(
        'Unable to find Elastic agent IDs for Microsoft Defender agent ids: [1-2-3]'
      );
    });

    it.each(
      responseActionsClientMock.getClientSupportedResponseActionMethodNames(
        'microsoft_defender_endpoint'
      )
    )(
      'should error when %s is called with agents not valid for active space',
      async (methodName) => {
        (
          clientConstructorOptionsMock.endpointService.getInternalFleetServices().agent
            .getByIds as jest.Mock
        ).mockImplementation(async () => {
          throw new AgentNotFoundError('Agent some-id not found');
        });
        const options = responseActionsClientMock.getOptionsForResponseActionMethod(methodName);

        // @ts-expect-error `options` type is too broad because we're getting it from a helper
        await expect(msClientMock[methodName](options)).rejects.toThrow('Agent some-id not found');

        expect(clientConstructorOptionsMock.connectorActions.execute).not.toHaveBeenCalled();
      }
    );
  });
});
