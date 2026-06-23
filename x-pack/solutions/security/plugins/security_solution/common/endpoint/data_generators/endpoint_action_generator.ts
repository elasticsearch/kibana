/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeepPartial } from 'utility-types';
import { merge } from 'lodash';
import type { estypes } from '@elastic/elasticsearch';
import {
  isMemoryDumpAction,
  isProcessesAction,
  isRunScriptAction,
} from '../service/response_actions/type_guards';
import {
  ACTION_AGENT_FILE_DOWNLOAD_ROUTE,
  ENDPOINT_ACTION_RESPONSES_DS,
  ENDPOINT_ACTIONS_DS,
} from '../constants';
import { BaseDataGenerator } from './base_data_generator';
import {
  type ActionDetails,
  type ActionResponseOutput,
  ActivityLogItemTypes,
  type EndpointActionDataParameterTypes,
  type EndpointActionResponseDataOutput,
  type EndpointActivityLogAction,
  type EndpointActivityLogActionResponse,
  type EndpointPendingActions,
  type GetProcessesActionOutputContent,
  type LogsEndpointAction,
  type LogsEndpointActionResponse,
  type ProcessesEntry,
  type ResponseActionExecuteOutputContent,
  type ResponseActionGetFileOutputContent,
  type ResponseActionGetFileParameters,
  type ResponseActionScanOutputContent,
  type ResponseActionsExecuteParameters,
  type ResponseActionScanParameters,
  type ResponseActionUploadOutputContent,
  type ResponseActionUploadParameters,
  type WithAllKeys,
} from '../types';
import {
  DEFAULT_EXECUTE_ACTION_TIMEOUT,
  RESPONSE_ACTION_API_COMMANDS_NAMES,
} from '../service/response_actions/constants';
import { getFileDownloadId } from '../service/response_actions/get_file_download_id';

export class EndpointActionGenerator extends BaseDataGenerator {
  /** Generate a random endpoint Action request (isolate or unisolate) */
  generate<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(
    overrides: DeepPartial<LogsEndpointAction<TParameters, TOutputContent, TMeta>> = {}
  ): LogsEndpointAction<TParameters, TOutputContent, TMeta> {
    const timeStamp = overrides['@timestamp'] ? new Date(overrides['@timestamp']) : new Date();
    const agent = (overrides.agent?.id ?? [
      this.seededUUIDv4(),
    ]) as LogsEndpointAction['agent']['id'];
    const agentId = Array.isArray(agent) ? (agent[0] as string) : agent;
    const doc: LogsEndpointAction<TParameters, TOutputContent, TMeta> = {
      '@timestamp': timeStamp.toISOString(),
      agent: {
        id: agent,
        policy: [
          {
            agentId,
            elasticAgentId: agentId,
            integrationPolicyId: 'integration-policy-1',
            agentPolicyId: 'agent-policy-1',
          },
        ],
      },
      originSpaceId: 'default',
      tags: [],
      EndpointActions: {
        action_id: this.seededUUIDv4(),
        expiration: this.randomFutureDate(timeStamp),
        type: 'INPUT_ACTION',
        input_type: 'endpoint',
        data: {
          command: this.randomResponseActionCommand(),
          comment: this.randomString(15),
          parameters: undefined,
        },
      },
      error: undefined,
      user: {
        id: this.randomUser(),
      },
      rule: undefined,
    };

    return merge(doc, overrides);
  }

  generateActionEsHit<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(
    overrides: DeepPartial<LogsEndpointAction<TParameters, TOutputContent, TMeta>> = {}
  ): estypes.SearchHit<LogsEndpointAction<TParameters, TOutputContent, TMeta>> {
    return Object.assign(this.toEsSearchHit(this.generate(overrides)), {
      _index: `.ds-${ENDPOINT_ACTIONS_DS}-some_namespace`,
    });
  }

  /** Generates an endpoint action response */
  generateResponse<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput
  >(
    overrides: DeepPartial<LogsEndpointActionResponse<TOutputContent>> = {}
  ): LogsEndpointActionResponse<TOutputContent> {
    const timeStamp = overrides['@timestamp'] ? new Date(overrides['@timestamp']) : new Date();

    const startedAtTimes: number[] = [];
    [2, 3, 5, 8, 13, 21].forEach((n) => {
      startedAtTimes.push(
        timeStamp.setMinutes(-this.randomN(n)),
        timeStamp.setSeconds(-this.randomN(n))
      );
    });

    const command = overrides?.EndpointActions?.data?.command ?? this.randomResponseActionCommand();
    let output: ActionResponseOutput<
      | ResponseActionGetFileOutputContent
      | ResponseActionExecuteOutputContent
      | ResponseActionScanOutputContent
    > = overrides?.EndpointActions?.data?.output as unknown as ActionResponseOutput<
      | ResponseActionGetFileOutputContent
      | ResponseActionExecuteOutputContent
      | ResponseActionScanOutputContent
    >;

    if (command === 'get-file') {
      if (!output) {
        output = {
          type: 'json',
          content: {
            code: 'ra_get-file_success_done',
            zip_size: 123,
            contents: [
              {
                type: 'file',
                path: '/some/path/bad_file.txt',
                size: 1234,
                file_name: 'bad_file.txt',
                sha256: '9558c5cb39622e9b3653203e772b129d6c634e7dbd7af1b244352fc1d704601f',
              },
            ],
          },
        };
      }
    }

    if (command === 'scan') {
      if (!output) {
        output = {
          type: 'json',
          content: {
            code: 'ra_scan_success_done',
          },
        };
      }
    }

    if (command === 'runscript') {
      if (!output) {
        output = {
          type: 'json',
          content: {
            code: '200',
          },
        };
      }
    }

    if (command === 'execute') {
      if (!output) {
        output = this.generateExecuteActionResponseOutput();
      }
    }

    if (command === 'upload' && !output) {
      let uploadOutput = output as ActionResponseOutput<ResponseActionUploadOutputContent>;

      if (overrides.error) {
        uploadOutput = {
          type: 'json',
          content: {
            code: 'ra_upload_some-error',
            path: '',
            disk_free_space: 0,
          },
        };
      } else {
        uploadOutput = {
          type: 'json',
          content: {
            code: 'ra_upload_file-success',
            path: '/disk1/file/saved/here',
            disk_free_space: 4825566125475,
          },
        };
      }

      output = uploadOutput as typeof output;
    }

    if (command === 'cancel' && !output) {
      output = {
        type: 'json',
        content: {
          code: 'ra_cancel_success',
        },
      } as typeof output;
    }

    return merge(
      {
        '@timestamp': timeStamp.toISOString(),
        agent: {
          id: this.seededUUIDv4(),
        },
        EndpointActions: {
          action_id: this.seededUUIDv4(),
          completed_at: timeStamp.toISOString(),
          // randomly before a few hours/minutes/seconds later
          started_at: new Date(startedAtTimes[this.randomN(startedAtTimes.length)]).toISOString(),
          data: {
            command,
            comment: '',
            output,
          },
        },
        error: undefined,
      },
      overrides
    ) as LogsEndpointActionResponse<TOutputContent>;
  }

  generateResponseEsHit(
    overrides: DeepPartial<LogsEndpointActionResponse> = {}
  ): estypes.SearchHit<LogsEndpointActionResponse> {
    return Object.assign(this.toEsSearchHit(this.generateResponse(overrides)), {
      _index: `.ds-${ENDPOINT_ACTION_RESPONSES_DS}-some_namespace-something`,
    });
  }

  generateActionDetails<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes
  >({
    agents: overrideAgents,
    command: overrideCommand,
    ...overrides
  }: DeepPartial<ActionDetails<TOutputContent, TParameters>> = {}): ActionDetails<
    TOutputContent,
    TParameters
  > {
    const agents = overrideAgents ? [...(overrideAgents as string[])] : ['agent-a'];
    const command = overrideCommand ?? 'isolate';

    const details: WithAllKeys<ActionDetails> = {
      action: '123',
      agents,
      agentType: 'endpoint',
      command,
      completedAt: '2022-04-30T16:08:47.449Z',
      hosts: agents.reduce((acc, agentId) => {
        acc[agentId] = { name: `Host-${agentId}` };
        return acc;
      }, {} as ActionDetails['hosts']),
      id: '123',
      isCompleted: true,
      isExpired: false,
      wasSuccessful: true,
      wasCanceled: false,
      errors: undefined,
      startedAt: '2022-04-27T16:08:47.449Z',
      status: 'successful',
      comment: 'thisisacomment',
      createdBy: 'auserid',
      parameters: undefined,
      outputs: undefined,
      agentState: agents.reduce((acc, agentId) => {
        acc[agentId] = {
          errors: undefined,
          isCompleted: true,
          completedAt: '2022-04-30T16:08:47.449Z',
          wasSuccessful: true,
          wasCanceled: false,
        };
        return acc;
      }, {} as ActionDetails['agentState']),
      alertIds: undefined,
      ruleId: undefined,
      ruleName: undefined,
    };

    if (command === 'get-file') {
      if (!details.parameters) {
        (
          details as unknown as ActionDetails<
            ResponseActionGetFileOutputContent,
            ResponseActionGetFileParameters
          >
        ).parameters = {
          path: '/some/file.txt',
        };
      }

      if (!details.outputs || Object.keys(details.outputs).length === 0) {
        (
          details as unknown as ActionDetails<
            ResponseActionGetFileOutputContent,
            ResponseActionGetFileParameters
          >
        ).outputs = details.agents.reduce<
          ActionDetails<
            ResponseActionGetFileOutputContent,
            ResponseActionGetFileParameters
          >['outputs']
        >((acc = {}, agentId) => {
          acc[agentId] = {
            type: 'json',
            content: {
              code: 'ra_get-file_success',
              zip_size: 123,
              downloadUri: ACTION_AGENT_FILE_DOWNLOAD_ROUTE.replace(
                `{action_id}`,
                details.id
              ).replace(`{file_id}`, agentId),
              contents: [
                {
                  path: '/some/file/txt',
                  sha256: '1254',
                  size: 1234,
                  file_name: 'some-file.txt',
                  type: 'file',
                },
              ],
            },
          };
          return acc;
        }, {});
      }
    }

    if (command === 'scan') {
      if (!details.parameters) {
        (
          details as unknown as ActionDetails<
            ResponseActionScanOutputContent,
            ResponseActionScanParameters
          >
        ).parameters = {
          path: '/some/folder/to/scan',
        };
      }

      if (!details.outputs || Object.keys(details.outputs).length === 0) {
        (
          details as unknown as ActionDetails<
            ResponseActionScanOutputContent,
            ResponseActionScanParameters
          >
        ).outputs = details.agents.reduce<
          ActionDetails<ResponseActionScanOutputContent, ResponseActionScanParameters>['outputs']
        >((acc = {}, agentId) => {
          acc[agentId] = {
            type: 'json',
            content: {
              code: 'ra_scan_success',
            },
          };

          return acc;
        }, {});
      }
    }

    if (command === 'execute') {
      if (!details.parameters) {
        (
          details as unknown as ActionDetails<
            ResponseActionExecuteOutputContent,
            ResponseActionsExecuteParameters
          >
        ).parameters = {
          command: (overrides.parameters as ResponseActionsExecuteParameters)?.command ?? 'ls -al',
          timeout:
            (overrides.parameters as ResponseActionsExecuteParameters)?.timeout ??
            DEFAULT_EXECUTE_ACTION_TIMEOUT, // 4hrs
        };
      }

      if (!details.outputs || Object.keys(details.outputs).length === 0) {
        (
          details as unknown as ActionDetails<
            ResponseActionExecuteOutputContent,
            ResponseActionsExecuteParameters
          >
        ).outputs = details.agents.reduce<
          ActionDetails<
            ResponseActionExecuteOutputContent,
            ResponseActionsExecuteParameters
          >['outputs']
        >((acc = {}, agentId) => {
          acc[agentId] = this.generateExecuteActionResponseOutput({
            content: {
              output_file_id: getFileDownloadId(details, details.agents[0]),
              ...(overrides.outputs?.[details.agents[0]]?.content ?? {}),
            },
          });
          return acc;
        }, {});
      }
    }

    if (command === 'upload') {
      const uploadActionDetails = details as unknown as ActionDetails<
        ResponseActionUploadOutputContent,
        ResponseActionUploadParameters
      >;

      uploadActionDetails.parameters = {
        file_id: 'file-x-y-z',
        file_name: 'foo.txt',
        file_size: 1234,
        file_sha256: 'file-hash-sha-256',
      };

      uploadActionDetails.outputs = details.agents.reduce<
        ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>['outputs']
      >((acc = {}, agentId) => {
        acc[agentId] = {
          type: 'json',
          content: {
            code: 'ra_upload_file-success',
            path: '/path/to/uploaded/file',
            disk_free_space: 1234567,
          },
        };
        return acc;
      }, {});
    }

    if (isProcessesAction(details)) {
      details.outputs = agents.reduce((acc, agentId) => {
        acc[agentId] = {
          type: 'json',
          content: {
            code: 'success',
            entries: this.randomResponseActionProcesses(),
          },
        };

        return acc;
      }, {} as Required<ActionDetails<GetProcessesActionOutputContent>>['outputs']);
    }

    if (isMemoryDumpAction(details)) {
      if (!details.outputs) {
        details.outputs = {};
      }

      for (const agentId of details.agents) {
        details.outputs[agentId] = {
          type: 'json',
          content: {
            code: 'ra_memory-dump-success',
            path: `/home/user/${agentId}/tmp/memory-dump.2025-11-03T16:22:05.365Z.zip`,
            file_size: 23895729,
            disk_free_space: 1234567000,
          },
        };
      }
    }

    if (isRunScriptAction(details)) {
      if (details.isCompleted) {
        if (!details.outputs) {
          details.outputs = {};
        }

        if (details.agentType === 'endpoint') {
          if (!details.parameters) {
            details.parameters = {
              scriptId: 'script-123',
              scriptInput: 'foo',
            };
          }

          for (const agentId of details.agents) {
            details.outputs[agentId] = this.generateExecuteActionResponseOutput({
              content: {
                output_file_id: getFileDownloadId(details, agentId),
              },
            });
          }
        }
      }
    }

    return merge(details, overrides as ActionDetails) as unknown as ActionDetails<
      TOutputContent,
      TParameters
    >;
  }

  randomGetFileFailureCode(): string {
    return this.randomChoice([
      'ra_get-file_error_canceled',
      'ra_get-file_error_not-found',
      'ra_get-file_error_is-directory',
      'ra_get-file_error_invalid-input',
      'ra_get-file_error_not-permitted',
      'ra_get-file_error_too-big',
      'ra_get-file_error_disk-quota',
      'ra_get-file_error_processing',
      'ra_get-file_error_upload-api-unreachable',
      'ra_get-file_error_upload-timeout',
      'ra_get-file_error_queue-timeout',
      'ra_get-file_error_not-enough-free-space',
    ]);
  }

  randomScanFailureCode(): string {
    return this.randomChoice([
      'ra_scan_error_canceled',
      'ra_scan_error_disabled',
      'ra_scan_error_invalid-input',
      'ra_scan_error_not-found',
      'ra_scan_error_queue-quota',
      'ra_scan_error_processing',
      'ra_scan_error_processing-interrupted',
    ]);
  }

  generateActivityLogAction(
    overrides: DeepPartial<EndpointActivityLogAction>
  ): EndpointActivityLogAction {
    return merge(
      {
        type: ActivityLogItemTypes.ACTION,
        item: {
          id: this.seededUUIDv4(),
          data: this.generate(),
        },
      },
      overrides
    );
  }

  generateActivityLogActionResponse<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput
  >(
    overrides: DeepPartial<EndpointActivityLogActionResponse<TOutputContent>>
  ): EndpointActivityLogActionResponse<TOutputContent> {
    return merge(
      {
        type: ActivityLogItemTypes.RESPONSE,
        item: {
          id: this.seededUUIDv4(),
          data: this.generateResponse({ ...(overrides?.item?.data ?? {}) }),
        },
      },
      overrides
    );
  }

  generateAgentPendingActionsSummary(
    overrides: Partial<EndpointPendingActions> = {}
  ): EndpointPendingActions {
    return merge(
      {
        agent_id: this.seededUUIDv4(),
        pending_actions: {
          isolate: 2,
          unisolate: 0,
        },
      },
      overrides
    );
  }

  generateExecuteActionResponseOutput(
    overrides?: DeepPartial<ActionResponseOutput<ResponseActionExecuteOutputContent>>
  ): ActionResponseOutput<ResponseActionExecuteOutputContent> {
    return merge(
      {
        type: 'json',
        content: {
          code: 'ra_execute_success_done',
          stdout: this.randomChoice([
            this.randomString(1280),
            this.randomString(3580),
            `-rw-r--r--    1 elastic  staff      458 Jan 26 09:10 doc.txt\
          -rw-r--r--     1 elastic  staff  298 Feb  2 09:10 readme.md`,
          ]),
          stderr: this.randomChoice([
            this.randomString(1280),
            this.randomString(3580),
            `error line 1\
          error line 2\
          error line 3 that is quite very long and will be truncated, and should not be visible in the UI\
          errorline4thathasalotmoretextthatdoesnotendfortestingpurposesrepeatalotoftexthereandkeepaddingmoreandmoretextwithoutendtheideabeingthatwedonotuseperiodsorcommassothattheconsoleuiisunabletobreakthislinewithoutsomecssrulessowiththislineweshouldbeabletotestthatwithgenerateddata`,
          ]),
          stdout_truncated: true,
          stderr_truncated: true,
          shell_code: 0,
          shell: 'bash',
          cwd: this.randomChoice(['/some/path', '/a-very/long/path'.repeat(30)]),
          output_file_id: 'some-output-file-id',
          output_file_stdout_truncated: this.randomChoice([true, false]),
          output_file_stderr_truncated: this.randomChoice([true, false]),
        },
      },
      overrides
    ) as ActionResponseOutput<ResponseActionExecuteOutputContent>;
  }

  randomFloat(): number {
    return this.random();
  }

  randomN(max: number): number {
    return super.randomN(max);
  }

  randomResponseActionProcesses(n?: number): ProcessesEntry[] {
    const numberOfEntries = n ?? this.randomChoice([20, 30, 40, 50]);
    const entries = [];
    for (let i = 0; i < numberOfEntries; i++) {
      entries.push({
        command: this.randomResponseActionProcessesCommand(),
        pid: this.randomN(1000).toString(),
        entity_id: this.randomString(50),
        user: this.randomUser(),
      });
    }

    return entries;
  }

  protected randomResponseActionProcessesCommand() {
    const commands = [
      '/opt/cmd1',
      '/opt/cmd2',
      '/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3',
      '/opt/cmd3/opt/cmd3/opt/cmd3/opt/cmd3',
    ];

    return this.randomChoice(commands);
  }

  protected randomResponseActionCommand() {
    return this.randomChoice(RESPONSE_ACTION_API_COMMANDS_NAMES);
  }
}
