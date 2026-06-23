/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ResponseActionsClientOptions } from '../lib/base_response_actions_client';
import type { ResponseActionsClient } from '../../..';
import { getActionDetailsById as _getActionDetailsById } from '../../action_details_by_id';
import { EndpointActionsClient } from '../../..';
import { endpointActionClientMock } from './mocks';
import { responseActionsClientMock } from '../mocks';
import {
  ENDPOINT_ACTIONS_INDEX,
  metadataCurrentIndexPattern,
} from '../../../../../../common/endpoint/constants';

import { DEFAULT_EXECUTE_ACTION_TIMEOUT } from '../../../../../../common/endpoint/service/response_actions/constants';
import { applyEsClientSearchMock } from '../../../../mocks/utils.mock';
import type { ElasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { BaseDataGenerator } from '../../../../../../common/endpoint/data_generators/base_data_generator';
import { Readable } from 'stream';
import { EndpointActionGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_action_generator';
import type { ResponseActionsRequestBody } from '../../../../../../common/api/endpoint';
import { AgentNotFoundError } from '@kbn/fleet-plugin/server';
import { ALLOWED_ACTION_REQUEST_TAGS } from '../../constants';
import { EndpointMetadataGenerator } from '../../../../../../common/endpoint/data_generators/endpoint_metadata_generator';
import { ScriptsLibraryMock } from '../../../scripts_library/mocks';
import type { ActionDetails } from '../../../../../../common/endpoint/types';

jest.mock('../../action_details_by_id', () => {
  const originalMod = jest.requireActual('../../action_details_by_id');
  return {
    ...originalMod,
    getActionDetailsById: jest.fn(originalMod.getActionDetailsById),
  };
});

const getActionDetailsByIdMock = _getActionDetailsById as jest.Mock;

describe('EndpointActionsClient', () => {
  let classConstructorOptions: ResponseActionsClientOptions;
  let endpointActionsClient: ResponseActionsClient;

  const getCommonResponseActionOptions = (): Pick<
    ResponseActionsRequestBody,
    'endpoint_ids' | 'case_ids'
  > => {
    return {
      endpoint_ids: ['1-2-3', 'invalid-id', '1-2-3'],
      case_ids: ['case-a'],
    };
  };

  beforeEach(() => {
    classConstructorOptions = endpointActionClientMock.createConstructorOptions();
    endpointActionsClient = new EndpointActionsClient(classConstructorOptions);

    (
      classConstructorOptions.endpointService.getInternalFleetServices()
        .ensureInCurrentSpace as jest.Mock
    ).mockResolvedValue(undefined);

    getActionDetailsByIdMock.mockResolvedValue(
      new EndpointActionGenerator('seed').generateActionDetails({
        agents: ['1-2-3'],
        isCompleted: false,
      })
    );

    // @ts-expect-error mocking this for testing purposes
    classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointMemoryDump =
      true;
    // @ts-expect-error mocking this for testing purposes
    classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointRunScript =
      true;
    // @ts-expect-error mocking this for testing purposes
    classConstructorOptions.endpointService.experimentalFeatures.responseActionsScriptLibraryManagement =
      true;
    // @ts-expect-error mocking this for testing purposes
    classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointCancel =
      true;
  });

  it('should validate endpoint ids and log those that are invalid', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    expect(classConstructorOptions.endpointService.createLogger().warn).toHaveBeenCalledWith(
      'The following agent ids are not valid: ["invalid-id"] and will not be included in action request'
    );
  });

  it('should sign fleet action request document', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    expect(
      classConstructorOptions.endpointService.getMessageSigningService().sign as jest.Mock
    ).toHaveBeenCalled();
  });

  it('should only dispatch fleet action for valid IDs', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    expect(
      (await classConstructorOptions.endpointService.getFleetActionsClient()).create as jest.Mock
    ).toHaveBeenCalledWith({
      '@timestamp': expect.any(String),
      action_id: expect.any(String),
      agents: ['1-2-3'],
      data: {
        command: 'isolate',
        parameters: undefined,
        comment: 'test comment',
      },
      expiration: expect.any(String),
      input_type: 'endpoint',
      signed: {
        data: expect.any(String),
        signature: 'thisisasignature',
      },
      timeout: 300,
      type: 'INPUT_ACTION',
      user_id: 'foo',
    });
  });

  it('should write action request document to endpoint action request index with given set of valid/invalid agent ids', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
      {
        index: ENDPOINT_ACTIONS_INDEX,
        document: {
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: expect.any(String),
            data: {
              command: 'isolate',
              comment:
                'test comment. (WARNING: The following agent ids are not valid: ["invalid-id"] and will not be included in action request)',
              parameters: undefined,
            },
            expiration: expect.any(String),
            input_type: 'endpoint',
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
          user: {
            id: 'foo',
          },
        },
        refresh: 'wait_for',
      },
      expect.anything()
    );
  });

  it('should write correct comment when invalid agent ids', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions({
        ...getCommonResponseActionOptions(),
        comment: '',
      })
    );

    expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
      {
        index: ENDPOINT_ACTIONS_INDEX,
        document: {
          '@timestamp': expect.any(String),
          EndpointActions: {
            action_id: expect.any(String),
            data: {
              command: 'isolate',
              comment:
                '(WARNING: The following agent ids are not valid: ["invalid-id"] and will not be included in action request)',
              parameters: undefined,
            },
            expiration: expect.any(String),
            input_type: 'endpoint',
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
          user: {
            id: 'foo',
          },
        },
        refresh: 'wait_for',
      },
      expect.anything()
    );
  });

  it('should write action request document to endpoint action request index with given valid agent ids', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions({
        endpoint_ids: ['1-2-3'],
        case_ids: ['case-a'],
      })
    );

    expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
      {
        index: ENDPOINT_ACTIONS_INDEX,
        document: {
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
          user: {
            id: 'foo',
          },
        },
        refresh: 'wait_for',
      },
      expect.anything()
    );
  });

  it('should update cases with unified attachment for valid agent ids', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions({
        endpoint_ids: ['1-2-3'],
        case_ids: ['case-a'],
      })
    );

    expect(classConstructorOptions.casesClient?.attachments.bulkCreate).toHaveBeenCalledWith({
      attachments: [
        {
          type: 'security.endpoint',
          attachmentId: expect.any(String),
          data: { content: 'test comment' },
          metadata: {
            command: 'isolate',
            targets: [
              {
                agentType: 'endpoint',
                endpointId: '1-2-3',
                hostname: 'Host-ku5jy6j0pw',
              },
            ],
          },
          owner: 'securitySolution',
        },
      ],
      caseId: 'case-a',
    });
  });

  it('should update cases with unified attachment for valid/invalid agent ids', async () => {
    await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    expect(classConstructorOptions.casesClient?.attachments.bulkCreate).toHaveBeenCalledWith({
      attachments: [
        {
          type: 'security.endpoint',
          attachmentId: expect.any(String),
          data: {
            content:
              'test comment. (WARNING: The following agent ids are not valid: ["invalid-id"] and will not be included in action request)',
          },
          metadata: {
            command: 'isolate',
            targets: [
              {
                agentType: 'endpoint',
                endpointId: '1-2-3',
                hostname: 'Host-ku5jy6j0pw',
              },
            ],
          },
          owner: 'securitySolution',
        },
      ],
      caseId: 'case-a',
    });
  });

  it('should create an action with error and not trow when in automated mode', async () => {
    classConstructorOptions.isAutomated = true;
    await endpointActionsClient.isolate(getCommonResponseActionOptions(), {
      error: 'something is wrong',
    });

    expect(
      (await classConstructorOptions.endpointService.getFleetActionsClient()).create as jest.Mock
    ).not.toHaveBeenCalled();
    expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          error: {
            message: 'something is wrong',
          },
        }),
      }),
      { meta: true }
    );
  });

  it('should create an action with error when agents are invalid (automated mode)', async () => {
    classConstructorOptions.isAutomated = true;
    // @ts-expect-error mocking this for testing purposes
    endpointActionsClient.checkAgentIds = jest.fn().mockResolvedValueOnce({
      isValid: false,
      valid: [],
      invalid: ['invalid-id'],
      hosts: [{ agent: { id: 'invalid-id', name: '' }, host: { hostname: '' } }],
    });

    await endpointActionsClient.isolate(getCommonResponseActionOptions());

    expect(
      (await classConstructorOptions.endpointService.getFleetActionsClient()).create as jest.Mock
    ).not.toHaveBeenCalled();
    expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          error: {
            message: 'The host does not have Elastic Defend integration installed',
          },
        }),
      }),
      { meta: true }
    );
  });

  it('should return ActionDetails for newly created action', async () => {
    const actionResponse = await endpointActionsClient.isolate(
      responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
    );

    // NOTE: checking only the keys in order to avoid confusion - because the use of Mocks would
    // have returned a action details that would not match the request sent in this test.
    expect(Object.keys(actionResponse).sort()).toEqual(
      [
        'action',
        'id',
        'agentType',
        'agents',
        'hosts',
        'command',
        'startedAt',
        'isCompleted',
        'completedAt',
        'wasCanceled',
        'wasSuccessful',
        'errors',
        'isExpired',
        'status',
        'outputs',
        'agentState',
        'createdBy',
        'comment',
        'parameters',
        'alertIds',
        'ruleId',
        'ruleName',
      ].sort()
    );
  });

  type ResponseActionsMethodsOnly = keyof Omit<
    ResponseActionsClient,
    'processPendingActions' | 'getFileDownload' | 'getFileInfo' | 'getCustomScripts'
  >;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responseActionMethods: Record<ResponseActionsMethodsOnly, any> = {
    isolate: responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions()),

    release: responseActionsClientMock.createReleaseOptions(getCommonResponseActionOptions()),

    killProcess: responseActionsClientMock.createKillProcessOptions(
      getCommonResponseActionOptions()
    ),

    suspendProcess: responseActionsClientMock.createSuspendProcessOptions(
      getCommonResponseActionOptions()
    ),

    runningProcesses: responseActionsClientMock.createRunningProcessesOptions(
      getCommonResponseActionOptions()
    ),

    getFile: responseActionsClientMock.createGetFileOptions(getCommonResponseActionOptions()),

    execute: responseActionsClientMock.createExecuteOptions(getCommonResponseActionOptions()),

    upload: responseActionsClientMock.createUploadOptions(getCommonResponseActionOptions()),

    scan: responseActionsClientMock.createScanOptions(getCommonResponseActionOptions()),

    memoryDump: responseActionsClientMock.createMemoryDumpActionOption(
      getCommonResponseActionOptions()
    ),

    runscript: endpointActionClientMock.createRunScriptOptions(getCommonResponseActionOptions()),

    cancel: responseActionsClientMock.createCancelActionOptions({
      ...getCommonResponseActionOptions(),
      parameters: { id: 'test-action-id-123', force: true },
    }),
  };

  it.each(Object.keys(responseActionMethods) as ResponseActionsMethodsOnly[])(
    'should dispatch a fleet action request calling %s() method',
    async (methodName) => {
      if (methodName === 'cancel') {
        getActionDetailsByIdMock.mockResolvedValue(
          new EndpointActionGenerator('seed').generateActionDetails({
            agents: ['1-2-3'],
            isCompleted: false,
            command: 'memory-dump',
            agentState: { '1-2-3': { isCompleted: false } },
          })
        );
      }

      await endpointActionsClient[methodName](responseActionMethods[methodName]);

      let expectedParams = responseActionMethods[methodName].parameters;
      let expectedComment = 'test comment';

      switch (methodName) {
        case 'upload':
          expectedParams = {
            ...expectedParams,
            file_id: '123-456-789',
            file_name: 'foo.txt',
            file_sha256: '96b76a1a911662053a1562ac14c4ff1e87c2ff550d6fe52e1e0b3790526597d3',
            file_size: 45632,
          };
          break;

        case 'execute':
          expectedParams = {
            ...expectedParams,
            timeout: DEFAULT_EXECUTE_ACTION_TIMEOUT,
          };
          break;

        case 'runscript':
          expectedParams = {
            ...expectedParams,
            file_sha256: 'e5441eb2bb',
            file_id: 'file-1-2-3',
            file_name: 'my_script.sh',
            file_size: 12098,
            path_to_executable: undefined,
            scriptId: 'script-1-2-3',
            timeout: 60000,
          };
          expectedComment = `(Script name: script one / File name: my_script.sh) ${expectedComment}`;
          break;

        case 'cancel':
          expectedParams = {
            id: 'test-action-id-123',
            force: true,
          };
          break;
      }

      expect(
        (await classConstructorOptions.endpointService.getFleetActionsClient()).create as jest.Mock
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            command: expect.any(String),
            comment: expectedComment,
            parameters: expectedParams,
          },
        })
      );
    }
  );

  describe('#getFileDownload()', () => {
    beforeEach(() => {
      const endpointActionGenerator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = endpointActionGenerator.toEsSearchResponse([
        endpointActionGenerator.generateActionEsHit({
          agent: { id: '123' },
          EndpointActions: { data: { command: 'get-file' } },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: classConstructorOptions.esClient as ElasticsearchClientMock,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });
    });

    it('should throw error if agent type for the action id is not endpoint', async () => {
      applyEsClientSearchMock({
        esClientMock: classConstructorOptions.esClient as ElasticsearchClientMock,
        index: ENDPOINT_ACTIONS_INDEX,
        response: BaseDataGenerator.toEsSearchResponse([
          new EndpointActionGenerator('seed').generateActionEsHit({
            agent: { id: '123' },
            EndpointActions: { data: { command: 'get-file' }, input_type: 'sentinel_one' },
          }),
        ]),
      });

      await expect(endpointActionsClient.getFileDownload('abc', '123')).rejects.toThrow(
        'Action id [abc] with agent type of [endpoint] not found'
      );
    });

    it('should throw error if file id not associated with action id', async () => {
      await expect(endpointActionsClient.getFileDownload('abc', '123')).rejects.toThrow(
        'Invalid file id [123] for action [abc]'
      );
    });

    it('should return expected response', async () => {
      await expect(
        endpointActionsClient.getFileDownload('321-654', '123-456-789')
      ).resolves.toEqual({
        stream: expect.any(Readable),
        fileName: expect.any(String),
        mimeType: expect.any(String),
      });
    });
  });

  describe('#getFileInfo()', () => {
    beforeEach(() => {
      const endpointActionGenerator = new EndpointActionGenerator('seed');
      const actionRequestsSearchResponse = endpointActionGenerator.toEsSearchResponse([
        endpointActionGenerator.generateActionEsHit({
          agent: { id: '123' },
          EndpointActions: { data: { command: 'get-file' } },
        }),
      ]);

      applyEsClientSearchMock({
        esClientMock: classConstructorOptions.esClient as ElasticsearchClientMock,
        index: ENDPOINT_ACTIONS_INDEX,
        response: actionRequestsSearchResponse,
      });
    });

    it('should throw error if agent type for the action id is not endpoint', async () => {
      applyEsClientSearchMock({
        esClientMock: classConstructorOptions.esClient as ElasticsearchClientMock,
        index: ENDPOINT_ACTIONS_INDEX,
        response: BaseDataGenerator.toEsSearchResponse([
          new EndpointActionGenerator('seed').generateActionEsHit({
            agent: { id: '123' },
            EndpointActions: { data: { command: 'get-file' }, input_type: 'sentinel_one' },
          }),
        ]),
      });

      await expect(endpointActionsClient.getFileInfo('abc', '123')).rejects.toThrow(
        'Action id [abc] with agent type of [endpoint] not found'
      );
    });

    it('should throw error if file id not associated with action id', async () => {
      await expect(endpointActionsClient.getFileInfo('abc', '123')).rejects.toThrow(
        'Invalid file ID. File [123] not associated with action ID [abc]'
      );
    });

    it('should return expected response', async () => {
      await expect(endpointActionsClient.getFileInfo('321-654', '123-456-789')).resolves.toEqual({
        actionId: '321-654',
        agentId: '111-222',
        agentType: 'endpoint',
        created: '2023-05-12T19:47:33.702Z',
        id: '123-456-789',
        mimeType: 'text/plain',
        name: 'foo.txt',
        size: 45632,
        status: 'READY',
      });
    });
  });

  describe('#memoryDump()', () => {
    it('should error when feature flag is false', async () => {
      // @ts-expect-error mocking this for testing purposes
      classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointMemoryDump =
        false;

      await expect(
        endpointActionsClient.memoryDump(
          responseActionsClientMock.createMemoryDumpActionOption(getCommonResponseActionOptions())
        )
      ).rejects.toThrow('Memory dump operation is not enabled');
    });

    it.each`
      title        | params
      ${'kernel'}  | ${{ type: 'kernel' }}
      ${'process'} | ${{ type: 'process', pid: '123' }}
    `(
      'should validate that agent supports memory dump of $title',
      async ({ params: ResponseActionMemoryDumpParameters }) => {
        const generator = new EndpointMetadataGenerator('seed');

        applyEsClientSearchMock({
          esClientMock: classConstructorOptions.esClient as ElasticsearchClientMock,
          index: metadataCurrentIndexPattern,
          response: generator.toEsSearchResponse([
            generator.toEsSearchHit(generator.generate({ Endpoint: { capabilities: [] } })),
          ]),
        });

        await expect(
          endpointActionsClient.memoryDump(
            responseActionsClientMock.createMemoryDumpActionOption(getCommonResponseActionOptions())
          )
        ).rejects.toThrow(
          'The following agent IDs do not support memory dump: 0dc3661d-6e67-46b0-af39-6f12b025fcb0 (agent v.7.0.13)'
        );
      }
    );
  });

  describe('#cancel()', () => {
    let actionToBeCanceledDetails: ActionDetails;

    beforeEach(() => {
      actionToBeCanceledDetails = new EndpointActionGenerator('seed').generateActionDetails({
        id: 'action-123',
        agents: ['1-2-3'],
        agentType: 'endpoint',
        isCompleted: false,
        command: 'memory-dump',
        agentState: { '1-2-3': { isCompleted: false } },
      });

      getActionDetailsByIdMock.mockResolvedValue(actionToBeCanceledDetails);
    });

    it('should error when feature flag is false', async () => {
      // @ts-expect-error mocking this for testing purposes
      classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointCancel =
        false;

      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions(getCommonResponseActionOptions())
        )
      ).rejects.toThrow('Elastic Defend cancel operation is not enabled');
    });

    it('should process cancel action when feature flag is enabled', async () => {
      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions(getCommonResponseActionOptions())
        )
      ).resolves.toBeDefined();
    });

    it('should throw error if action is already complete', async () => {
      actionToBeCanceledDetails.isCompleted = false;
      actionToBeCanceledDetails.agentState = {
        '1-2-3': {
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          errors: undefined,
          completedAt: undefined,
        },
      };

      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions({
            ...getCommonResponseActionOptions(),
            parameters: { id: 'action-123' },
          })
        )
      ).rejects.toThrow(
        'Action [action-123] is already completed for agent [1-2-3] and cannot be canceled.'
      );
    });

    it('should throw error if action to cancel does not have an agentType of endpoint', async () => {
      actionToBeCanceledDetails.agentType = 'sentinel_one';
      actionToBeCanceledDetails.command = 'runscript';

      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions({
            ...getCommonResponseActionOptions(),
            parameters: { id: 'action-123' },
          })
        )
      ).rejects.toThrow(
        "Action [action-123 / runscript / sentinel_one] agent type is not 'endpoint'"
      );
    });

    it('should throw error if agent ID is not part of action to be canceled', async () => {
      actionToBeCanceledDetails.agents = ['some-other-id'];

      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions({
            ...getCommonResponseActionOptions(),
            parameters: { id: 'action-123' },
          })
        )
      ).rejects.toThrow('Endpoint [1-2-3] is not associated with action [action-123]');
    });

    it('should throw error if response action command is not cancelable', async () => {
      actionToBeCanceledDetails.command = 'cancel';

      await expect(
        endpointActionsClient.cancel(
          responseActionsClientMock.createCancelActionOptions({
            ...getCommonResponseActionOptions(),
            parameters: { id: 'action-123' },
          })
        )
      ).rejects.toThrow('[cancel] response action cannot be canceled.');
    });
  });

  describe('#runscript()', () => {
    it('should error if feature flag is disabled', async () => {
      // @ts-expect-error mocking this for testing purposes
      classConstructorOptions.endpointService.experimentalFeatures.responseActionsEndpointRunScript =
        false;

      await expect(
        endpointActionsClient.runscript(endpointActionClientMock.createRunScriptOptions())
      ).rejects.toThrow('Elastic Defend runscript operation is not enabled');
    });

    it('should error if script ID does not exist', async () => {
      (
        classConstructorOptions.endpointService.getScriptsLibraryClient('', '').get as jest.Mock
      ).mockRejectedValueOnce(new Error('not found'));

      await expect(
        endpointActionsClient.runscript(
          endpointActionClientMock.createRunScriptOptions({
            parameters: { scriptId: 'non-existent-script-id' },
          })
        )
      ).rejects.toThrow('not found');
    });

    it('should error if script requires input args but none were provided', async () => {
      (
        classConstructorOptions.endpointService.getScriptsLibraryClient('', '').get as jest.Mock
      ).mockResolvedValue(ScriptsLibraryMock.generateScriptEntry({ requiresInput: true }));

      await expect(
        endpointActionsClient.runscript(
          endpointActionClientMock.createRunScriptOptions({
            parameters: { scriptId: 'script-with-args' },
          })
        )
      ).rejects.toThrow('The script [script one] requires arguments to be specified.');
    });

    it('should store script info in action request doc `meta` property', async () => {
      await expect(
        endpointActionsClient.runscript(
          endpointActionClientMock.createRunScriptOptions({
            parameters: { scriptId: 'script-with-args' },
          })
        )
      ).resolves.toEqual(expect.any(Object));

      expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            meta: {
              file_sha256: 'e5441eb2bb',
              file_id: 'file-1-2-3',
              file_name: 'my_script.sh',
              file_size: 12098,
              path_to_executable: undefined,
            },
          }),
        }),
        expect.anything()
      );
    });

    it('should send user defined `timeout` value to endpoint', async () => {
      await expect(
        endpointActionsClient.runscript(
          endpointActionClientMock.createRunScriptOptions({
            parameters: { scriptId: 'script-with-args', timeout: 123456 },
          })
        )
      ).resolves.toEqual(expect.any(Object));

      expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            EndpointActions: expect.objectContaining({
              data: expect.objectContaining({
                parameters: expect.objectContaining({ timeout: 123456 }),
              }),
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should include a default `timeout` if one is not provided', async () => {
      await expect(
        endpointActionsClient.runscript(
          endpointActionClientMock.createRunScriptOptions({
            parameters: { scriptId: 'script-with-args', timeout: 0 },
          })
        )
      ).resolves.toEqual(expect.any(Object));

      expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            EndpointActions: expect.objectContaining({
              data: expect.objectContaining({
                parameters: expect.objectContaining({ timeout: DEFAULT_EXECUTE_ACTION_TIMEOUT }),
              }),
            }),
          }),
        }),
        expect.anything()
      );
    });
  });

  describe('#getCustomScripts()', () => {
    it.each(['responseActionsEndpointRunScript', 'responseActionsScriptLibraryManagement'])(
      'should error if feature flag [%s] is disabled',
      async (featureFlag) => {
        // @ts-expect-error mocking this for testing purposes
        classConstructorOptions.endpointService.experimentalFeatures[featureFlag] = false;

        await expect(endpointActionsClient.getCustomScripts()).rejects.toThrow(
          `Elastic Defend runscript operation is not enabled`
        );
      }
    );

    it('should return list of scripts', async () => {
      const expectedScriptResponse = ScriptsLibraryMock.generateScriptEntry();

      await expect(endpointActionsClient.getCustomScripts()).resolves.toEqual({
        data: [
          {
            id: expectedScriptResponse.id,
            name: expectedScriptResponse.name,
            description: expectedScriptResponse.description ?? '',
            meta: expectedScriptResponse,
          },
        ],
      });
    });

    it('should support filtering by OS Type', async () => {
      await expect(endpointActionsClient.getCustomScripts({ osType: 'linux' })).resolves.toEqual(
        expect.any(Object)
      );

      expect(
        classConstructorOptions.endpointService.getScriptsLibraryClient('', '').list as jest.Mock
      ).toHaveBeenCalledWith({
        kuery: 'platform: "linux"',
        pageSize: 10000,
        sortDirection: 'asc',
        sortField: 'name',
      });
    });
  });

  describe('and Space Awareness is enabled', () => {
    beforeEach(() => {
      getActionDetailsByIdMock.mockResolvedValue({});
    });

    afterEach(() => {
      getActionDetailsByIdMock.mockReset();
    });

    it('should write action request with agent policy info when space awareness is enabled', async () => {
      await endpointActionsClient.isolate(
        responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
      );

      expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
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

    it.each(responseActionsClientMock.getClientSupportedResponseActionMethodNames('endpoint'))(
      'should error when %s is called with agents not valid for active space',
      async (methodName) => {
        (
          classConstructorOptions.endpointService.getInternalFleetServices().agent
            .getByIds as jest.Mock
        ).mockImplementation(async () => {
          throw new AgentNotFoundError('Agent some-id not found');
        });
        getActionDetailsByIdMock.mockResolvedValue(
          new EndpointActionGenerator('seed').generateActionDetails({
            agents: ['1-2-3'],
            isCompleted: false,
            agentType: 'endpoint',
            command: 'runscript',
            agentState: { '1-2-3': { isCompleted: false } },
          })
        );
        const options = responseActionsClientMock.getOptionsForResponseActionMethod(methodName);

        // @ts-expect-error `options` type is too broad because we're getting it from a helper
        await expect(endpointActionsClient[methodName](options)).rejects.toThrow(
          'Agent some-id not found'
        );
        expect(
          (await classConstructorOptions.endpointService.getFleetActionsClient()).create
        ).not.toHaveBeenCalled();
      }
    );

    it('should create failed action request for automated response actions', async () => {
      classConstructorOptions.isAutomated = true;
      // @ts-expect-error mocking this for testing purposes
      endpointActionsClient.checkAgentIds = jest.fn().mockResolvedValueOnce({
        isValid: false,
        valid: [],
        invalid: ['invalid-id'],
        hosts: [{ agent: { id: 'invalid-id', name: '' }, host: { hostname: '' } }],
      });

      await endpointActionsClient.isolate(
        responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
      );

      expect(classConstructorOptions.esClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            agent: { id: [], policy: [] },
            tags: [ALLOWED_ACTION_REQUEST_TAGS.integrationPolicyDeleted],
          }),
        }),
        expect.anything()
      );
    });

    it('should return action details for failed automated response actions even when no valid agents', async () => {
      classConstructorOptions.isAutomated = true;
      // @ts-expect-error mocking this for testing purposes
      endpointActionsClient.checkAgentIds = jest.fn().mockResolvedValueOnce({
        isValid: false,
        valid: [],
        invalid: ['invalid-id'],
        hosts: [{ agent: { id: 'invalid-id', name: '' }, host: { hostname: '' } }],
      });

      await endpointActionsClient.isolate(
        responseActionsClientMock.createIsolateOptions(getCommonResponseActionOptions())
      );

      expect(getActionDetailsByIdMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { bypassSpaceValidation: true }
      );
    });
  });
});
