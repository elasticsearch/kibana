/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import type { Client } from '@elastic/elasticsearch';
import type { SearchHit } from '@elastic/elasticsearch/lib/api/types';
import { basename } from 'path';
import { encode } from '@kbn/cbor';
import { AGENT_ACTIONS_INDEX, AGENT_ACTIONS_RESULTS_INDEX } from '@kbn/fleet-plugin/common';
import { endpointActionResponseCodes } from '../../../public/management/components/endpoint_responder/lib/endpoint_action_response_codes';
import { isCancelAction } from '../../../common/endpoint/service/response_actions/type_guards';
import { catchAxiosErrorFormatAndThrow } from '../../../common/endpoint/format_axios_error';
import { FleetActionGenerator } from '../../../common/endpoint/data_generators/fleet_action_generator';
import { EndpointActionGenerator } from '../../../common/endpoint/data_generators/endpoint_action_generator';
import type {
  ActionDetails,
  EndpointAction,
  EndpointActionData,
  EndpointActionResponse,
  FileUploadMetadata,
  GetProcessesActionOutputContent,
  LogsEndpointActionResponse,
  ResponseActionExecuteOutputContent,
  ResponseActionGetFileOutputContent,
  ResponseActionGetFileParameters,
  EndpointActionResponseDataOutput,
  ResponseActionScanOutputContent,
  ResponseActionRunScriptOutputContent,
  LogsEndpointAction,
} from '../../../common/endpoint/types';
import { getFileDownloadId } from '../../../common/endpoint/service/response_actions/get_file_download_id';
import {
  ENDPOINT_ACTION_RESPONSES_INDEX,
  ENDPOINT_ACTIONS_INDEX,
  FILE_STORAGE_DATA_INDEX,
  FILE_STORAGE_METADATA_INDEX,
} from '../../../common/endpoint/constants';
import { sendEndpointMetadataUpdate } from './endpoint_metadata_services';
import { checkInFleetAgent } from './fleet_services';
import { generateFileMetadataDocumentMock } from '../../../server/endpoint/services/actions/mocks';

const ES_INDEX_OPTIONS = { headers: { 'X-elastic-product-origin': 'fleet' } };
export const fleetActionGenerator = new FleetActionGenerator();
export const endpointActionGenerator = new EndpointActionGenerator();
export const sleep = (ms: number = 1000) => new Promise((r) => setTimeout(r, ms));

export const sendFleetActionResponse = async (
  esClient: Client,
  action: ActionDetails,
  { state }: { state?: 'success' | 'failure' } = {}
): Promise<EndpointActionResponse> => {
  let fleetResponse: EndpointActionResponse;

  for (const agentId of action.agents) {
    fleetResponse = fleetActionGenerator.generateResponse({
      action_id: action.id,
      agent_id: agentId,
      action_response: { endpoint: { ack: true } },
    });

    // 20% of the time we generate an error
    if (state === 'failure' || (!state && fleetActionGenerator.randomFloat() < 0.2)) {
      fleetResponse.action_response = {};
      fleetResponse.error = 'Agent failed to deliver message to endpoint due to unknown error';
    } else {
      // show it as success (generator currently always generates a `error`, so delete it)
      delete fleetResponse.error;
    }

    await esClient
      .index(
        {
          index: AGENT_ACTIONS_RESULTS_INDEX,
          body: fleetResponse,
          refresh: 'wait_for',
        },
        ES_INDEX_OPTIONS
      )
      .catch(catchAxiosErrorFormatAndThrow);
  }

  // @ts-expect-error
  return fleetResponse;
};
export const sendEndpointActionResponse = async (
  esClient: Client,
  action: ActionDetails,
  { state }: { state?: 'success' | 'failure' } = {}
): Promise<LogsEndpointActionResponse> => {
  let endpointResponse: LogsEndpointActionResponse;

  for (const actionAgentId of action.agents) {
    endpointResponse = endpointActionGenerator.generateResponse<EndpointActionResponseDataOutput>({
      agent: { id: actionAgentId },
      EndpointActions: {
        action_id: action.id,
        data: {
          command: action.command as EndpointActionData['command'],
          comment: '',
          ...getOutputDataIfNeeded(action),
        },
        started_at: action.startedAt,
      },
    });

    // 20% of the time we generate an error
    if (
      state === 'failure' ||
      (state !== 'success' && endpointActionGenerator.randomFloat() < 0.2)
    ) {
      endpointResponse.error = {
        message: 'Endpoint encountered an error and was unable to apply action to host',
      };

      if (
        endpointResponse.EndpointActions.data.command === 'get-file' &&
        endpointResponse.EndpointActions.data.output
      ) {
        (
          endpointResponse.EndpointActions.data.output
            .content as unknown as ResponseActionGetFileOutputContent
        ).code = endpointActionGenerator.randomGetFileFailureCode();
      }

      if (
        endpointResponse.EndpointActions.data.command === 'scan' &&
        endpointResponse.EndpointActions.data.output
      ) {
        (
          endpointResponse.EndpointActions.data.output
            .content as unknown as ResponseActionScanOutputContent
        ).code = endpointActionGenerator.randomScanFailureCode();
      }

      if (
        endpointResponse.EndpointActions.data.command === 'execute' &&
        endpointResponse.EndpointActions.data.output
      ) {
        (
          endpointResponse.EndpointActions.data.output
            .content as unknown as ResponseActionExecuteOutputContent
        ).stderr = 'execute command timed out';
      }
      if (
        endpointResponse.EndpointActions.data.command === 'runscript' &&
        endpointResponse.EndpointActions.data.output
      ) {
        (
          endpointResponse.EndpointActions.data.output
            .content as unknown as ResponseActionRunScriptOutputContent
        ).stderr = 'runscript command timed out';
      }

      if (
        endpointResponse.EndpointActions.data.command === 'cancel' &&
        endpointResponse.EndpointActions.data.output
      ) {
        (endpointResponse.EndpointActions.data.output.content as unknown as { code: string }).code =
          'ra_cancel_error';
      }
    }

    await esClient
      .index({
        index: ENDPOINT_ACTION_RESPONSES_INDEX,
        body: endpointResponse,
        refresh: 'wait_for',
      })
      .catch(catchAxiosErrorFormatAndThrow);

    // ------------------------------------------
    // Post Action Response tasks
    // ------------------------------------------

    // For isolate, If the response is not an error, then also send a metadata update
    if (action.command === 'isolate' && !endpointResponse.error) {
      await Promise.all([
        sendEndpointMetadataUpdate(esClient, actionAgentId, {
          Endpoint: { state: { isolation: true } },
        }),

        checkInFleetAgent(esClient, actionAgentId),
      ]);
    }

    // For UnIsolate, if response is not an Error, then also send metadata update
    if (action.command === 'unisolate' && !endpointResponse.error) {
      await Promise.all([
        sendEndpointMetadataUpdate(esClient, actionAgentId, {
          Endpoint: { state: { isolation: false } },
        }),

        checkInFleetAgent(esClient, actionAgentId),
      ]);
    }

    // For `get-file`, upload a file to ES
    if (
      (action.command === 'execute' ||
        action.command === 'get-file' ||
        action.command === 'runscript') &&
      !endpointResponse.error
    ) {
      const filePath =
        action.command === 'execute'
          ? '/execute/file/path'
          : (
              action as unknown as ActionDetails<
                ResponseActionGetFileOutputContent,
                ResponseActionGetFileParameters
              >
            )?.parameters?.path ?? '/execute/file/path';

      const fileName = basename(filePath.replace(/\\/g, '/'));
      const fileMetaDoc: FileUploadMetadata = generateFileMetadataDocumentMock({
        action_id: action.id,
        agent_id: actionAgentId,
        upload_start: Date.now(),
        contents: [
          {
            sha256: '8d61673c9d782297b3c774ded4e3d88f31a8869a8f25cf5cdd402ba6822d1d28',
            file_name: fileName ?? 'bad_file.txt',
            path: filePath,
            size: 4,
            type: 'file',
          },
        ],
        file: {
          attributes: ['archive', 'compressed'],
          ChunkSize: 4194304,
          compression: 'deflate',
          hash: {
            sha256: '8d61673c9d782297b3c774ded4e3d88f31a8869a8f25cf5cdd402ba6822d1d28',
          },
          mime_type: 'application/zip',
          name: action.command === 'execute' ? 'full-output.zip' : 'upload.zip',
          extension: 'zip',
          size: 125,
          Status: 'READY',
          type: 'file',
        },
        src: 'endpoint',
      });

      // Index the file's metadata
      const fileMeta = await esClient
        .index({
          index: FILE_STORAGE_METADATA_INDEX,
          id: getFileDownloadId(action, actionAgentId),
          op_type: 'create',
          refresh: 'wait_for',
          body: fileMetaDoc,
        })
        .catch(catchAxiosErrorFormatAndThrow);

      // Index the file content (just one chunk)
      // call to `.index()` copied from File plugin here:
      // https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/files/server/blob_storage_service/adapters/es/content_stream/content_stream.ts#L195
      await esClient
        .index(
          {
            index: FILE_STORAGE_DATA_INDEX,
            id: `${fileMeta._id}.0`,
            document: encode({
              bid: fileMeta._id,
              last: true,
              '@timestamp': new Date().toISOString(),
              data: Buffer.from(
                'UEsDBAoACQAAAFZeRFWpAsDLHwAAABMAAAAMABwAYmFkX2ZpbGUudHh0VVQJAANTVjxjU1Y8Y3V4CwABBPUBAAAEFAAAAMOcoyEq/Q4VyG02U9O0LRbGlwP/y5SOCfRKqLz1rsBQSwcIqQLAyx8AAAATAAAAUEsBAh4DCgAJAAAAVl5EVakCwMsfAAAAEwAAAAwAGAAAAAAAAQAAAKSBAAAAAGJhZF9maWxlLnR4dFVUBQADU1Y8Y3V4CwABBPUBAAAEFAAAAFBLBQYAAAAAAQABAFIAAAB1AAAAAAA=',
                'base64'
              ),
            }),
            refresh: 'wait_for',
            op_type: 'create',
          },
          {
            headers: {
              'content-type': 'application/cbor',
              accept: 'application/json',
            },
          }
        )
        .catch(catchAxiosErrorFormatAndThrow)
        .then(() => sleep(2000));
    }

    // For `cancel` of an `agentType` of `endpoint` - also send a response for the action that was canceled
    if (isCancelAction(action) && state !== 'failure') {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const canceledActionId = action.parameters!.id;
      const canceledActionCommandName = await esClient
        .search<LogsEndpointAction>({
          index: ENDPOINT_ACTIONS_INDEX,
          query: {
            match: {
              'EndpointActions.action_id': canceledActionId,
            },
          },
        })
        .then(
          (response) => response.hits?.hits[0]?._source?.EndpointActions.data.command || 'runscript'
        )
        .catch(catchAxiosErrorFormatAndThrow);

      const canceledActionResponse =
        endpointActionGenerator.generateResponse<EndpointActionResponseDataOutput>({
          agent: { id: actionAgentId },
          error: { message: 'action was canceled' },
          EndpointActions: {
            action_id: canceledActionId,
            started_at: action.startedAt,
            data: {
              command: canceledActionCommandName,
              comment: '',
              output: {
                type: 'json',
                content: {
                  code: `ra_${canceledActionCommandName}_error_canceled`,
                  canceled_by: 'action',
                  canceled_id: action.id,
                },
              },
            },
          },
        });

      await esClient
        .index({
          index: ENDPOINT_ACTION_RESPONSES_INDEX,
          body: canceledActionResponse,
          refresh: 'wait_for',
        })
        .catch(catchAxiosErrorFormatAndThrow);
    }
  }

  // @ts-expect-error
  return endpointResponse as unknown as LogsEndpointActionResponse;
};

type ResponseOutput<
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput
> = Pick<LogsEndpointActionResponse<TOutputContent>['EndpointActions']['data'], 'output'>;

const getOutputDataIfNeeded = (action: ActionDetails): ResponseOutput => {
  const commentUppercase = (action?.comment ?? '').toUpperCase();

  switch (action.command) {
    case 'running-processes':
      return {
        output: {
          type: 'json',
          content: {
            entries: endpointActionGenerator.randomResponseActionProcesses(100),
          },
        },
      } as unknown as ResponseOutput<GetProcessesActionOutputContent>;

    case 'get-file':
      return {
        output: {
          type: 'json',
          content: {
            code: 'ra_get-file_success_done',
            zip_size: 123,
            contents: [
              {
                type: 'file',
                path: (
                  action as unknown as ActionDetails<
                    ResponseActionGetFileOutputContent,
                    ResponseActionGetFileParameters
                  >
                ).parameters?.path,
                size: 1234,
                file_name: 'bad_file.txt',
                sha256: '9558c5cb39622e9b3653203e772b129d6c634e7dbd7af1b244352fc1d704601f',
              },
            ],
          },
        },
      } as unknown as ResponseOutput<ResponseActionGetFileOutputContent>;

    case 'execute':
    case 'runscript':
      const executeOutput: Partial<ResponseActionExecuteOutputContent> = {
        output_file_id: getFileDownloadId(action, action.agents[0]),
      };

      // Error?
      if (commentUppercase.indexOf('EXECUTE:FAILURE') > -1) {
        executeOutput.stdout = '';
        executeOutput.stdout_truncated = false;
        executeOutput.output_file_stdout_truncated = false;
      } else {
        executeOutput.stderr = '';
        executeOutput.stderr_truncated = false;
        executeOutput.output_file_stderr_truncated = false;
      }

      return {
        output: endpointActionGenerator.generateExecuteActionResponseOutput({
          content: executeOutput,
        }),
      } as unknown as ResponseOutput<ResponseActionExecuteOutputContent>;

    case 'cancel': {
      const successCodes = Object.keys(endpointActionResponseCodes).filter((key) =>
        key.startsWith('ra_cancel_success')
      );

      return {
        output: {
          type: 'json',
          content: {
            code: endpointActionGenerator.randomChoice(successCodes) ?? 'ra_cancel_success_done',
          },
        },
      } as unknown as ResponseOutput;
    }

    case 'memory-dump':
      return {
        output: {
          type: 'json',
          content: {
            code: 'ra_memory-dump_success_done',
            file_size: 2322000,
            path: `/tmp/elastic_defend/memory_dump/dump.${new Date().toISOString()}.zip`,
            disk_free_space: 123045678009,
          },
        },
      } as unknown as ResponseOutput;

    default:
      return { output: undefined };
  }
};

export async function getLatestActionDoc(
  esClient: Client
): Promise<SearchHit<EndpointAction> | undefined> {
  return (
    await esClient
      .search<EndpointAction>({
        index: AGENT_ACTIONS_INDEX,
        ignore_unavailable: true,
        query: {
          match: {
            type: 'INPUT_ACTION',
          },
        },
        sort: {
          '@timestamp': {
            order: 'desc',
          },
        },
        size: 1,
      })
      .catch(catchAxiosErrorFormatAndThrow)
  ).hits.hits.at(0);
}

export async function waitForNewActionDoc(
  esClient: Client,
  previousActionDoc?: SearchHit<EndpointAction>,
  options: {
    maxAttempts: number;
    interval: number;
  } = { maxAttempts: 3, interval: 10000 }
): Promise<SearchHit<EndpointAction> | undefined> {
  const { maxAttempts, interval } = options;
  let attempts = 1;
  let latestDoc = await getLatestActionDoc(esClient);
  while ((!latestDoc || latestDoc._id === previousActionDoc?._id) && attempts <= maxAttempts) {
    await new Promise((res) => setTimeout(res, interval));
    latestDoc = await getLatestActionDoc(esClient);
    attempts++;
  }

  return latestDoc;
}

export function updateActionDoc<T = unknown>(esClient: Client, id: string, doc: T) {
  return esClient
    .update({
      index: AGENT_ACTIONS_INDEX,
      id,
      doc,
      refresh: 'wait_for',
    })
    .catch(catchAxiosErrorFormatAndThrow);
}
