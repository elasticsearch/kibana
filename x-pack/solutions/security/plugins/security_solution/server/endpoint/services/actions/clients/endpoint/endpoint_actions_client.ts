/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { FleetActionRequest } from '@kbn/fleet-plugin/server/services/actions';
import { v4 as uuidv4 } from 'uuid';
import type { Mutable } from 'utility-types';
import { isResponseActionCancelable } from '../../../../../../common/endpoint/service/response_actions/is_response_action_cancelable';
import { getActionDetailsById } from '../../action_details_by_id';
import type { CustomScriptsRequestQueryParams } from '../../../../../../common/api/endpoint/custom_scripts/get_custom_scripts_route';
import type { MemoryDumpActionRequestBody } from '../../../../../../common/api/endpoint/actions/response_actions/memory_dump';
import type { CancelActionRequestBody } from '../../../../../../common/api/endpoint/actions/response_actions/cancel';
import { CustomHttpRequestError } from '../../../../../utils/custom_http_request_error';
import { getActionRequestExpiration } from '../../utils';
import { ResponseActionsClientError } from '../errors';
import { stringify } from '../../../../utils/stringify';
import type { HapiReadableStream } from '../../../../../types';
import type {
  ResponseActionsApiCommandNames,
  ResponseActionAgentType,
} from '../../../../../../common/endpoint/service/response_actions/constants';
import type {
  ExecuteActionRequestBody,
  GetProcessesRequestBody,
  IsolationRouteRequestBody,
  ResponseActionGetFileRequestBody,
  UploadActionApiRequestBody,
  ResponseActionsRequestBody,
  ScanActionRequestBody,
  SuspendProcessRequestBody,
  KillProcessRequestBody,
  UnisolationRouteRequestBody,
  RunScriptActionRequestBody,
  EndpointRunScriptActionRequestParams,
} from '../../../../../../common/api/endpoint';
import {
  ResponseActionsClientImpl,
  type ResponseActionsClientValidateRequestResponse,
  type ResponseActionsClientWriteActionRequestToEndpointIndexOptions,
} from '../lib/base_response_actions_client';
import type {
  ActionDetails,
  HostMetadata,
  GetProcessesActionOutputContent,
  KillProcessActionOutputContent,
  ResponseActionExecuteOutputContent,
  ResponseActionGetFileOutputContent,
  ResponseActionGetFileParameters,
  ResponseActionParametersWithProcessData,
  ResponseActionsExecuteParameters,
  ResponseActionUploadOutputContent,
  ResponseActionUploadParameters,
  SuspendProcessActionOutputContent,
  LogsEndpointAction,
  UploadedFileInfo,
  ResponseActionScanParameters,
  ResponseActionScanOutputContent,
  ResponseActionMemoryDumpOutputContent,
  ResponseActionMemoryDumpParameters,
  ResponseActionRunScriptOutputContent,
  ResponseActionRunScriptParameters,
  ResponseActionCancelOutputContent,
  ResponseActionCancelParameters,
  EndpointScript,
  EndpointActionDataParameterTypes,
  ResponseActionScriptsApiResponse,
} from '../../../../../../common/endpoint/types';
import type {
  CommonResponseActionMethodOptions,
  GetFileDownloadMethodResponse,
  OmitUnsupportedAttributes,
} from '../lib/types';
import { DEFAULT_EXECUTE_ACTION_TIMEOUT } from '../../../../../../common/endpoint/service/response_actions/constants';

const getInvalidAgentsWarning = (invalidAgents: string[]) =>
  invalidAgents.length
    ? `The following agent ids are not valid: ${JSON.stringify(
        invalidAgents
      )} and will not be included in action request`
    : '';

export class EndpointActionsClient extends ResponseActionsClientImpl {
  protected readonly agentType: ResponseActionAgentType = 'endpoint';

  protected async fetchAgentPolicyInfo(
    agentIds: string[]
  ): Promise<LogsEndpointAction['agent']['policy']> {
    const cacheKey = `fetchAgentPolicyInfo:${agentIds.sort().join('#')}`;
    const cacheResponse = this.cache.get<LogsEndpointAction['agent']['policy']>(cacheKey);

    if (cacheResponse) {
      this.log.debug(
        () => `Cached agent policy info. found - returning it:\n${stringify(cacheResponse)}`
      );
      return cacheResponse;
    }

    const agentPolicyInfo = await this.fetchFleetInfoForAgents(agentIds);

    this.cache.set(cacheKey, agentPolicyInfo);
    return agentPolicyInfo;
  }

  private async checkAgentIds(ids: string[]): Promise<{
    valid: string[];
    invalid: string[];
    allValid: boolean;
    hosts: HostMetadata[];
  }> {
    const uniqueIds = [...new Set(ids)];
    const foundEndpointHosts = await this.options.endpointService
      .getEndpointMetadataService(this.options.spaceId)
      .getMetadataForEndpoints(uniqueIds);
    const validIds = foundEndpointHosts.map((endpoint: HostMetadata) => endpoint.elastic.agent.id);
    const invalidIds = ids.filter((id) => !validIds.includes(id));

    if (invalidIds.length) {
      this.log.warn(getInvalidAgentsWarning(invalidIds));
    }

    return {
      valid: validIds,
      invalid: invalidIds,
      allValid: invalidIds.length === 0,
      hosts: foundEndpointHosts,
    };
  }

  protected async validateRequest(
    actionRequest: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<any, any, any>
  ): Promise<ResponseActionsClientValidateRequestResponse> {
    // Memory Dump: ensure that agents/Endpoint support this command
    if (actionRequest.command === 'memory-dump') {
      const endpointMetadata = await this.options.endpointService
        .getEndpointMetadataService(this.options.spaceId)
        .findHostMetadataForFleetAgents(actionRequest.endpoint_ids);

      const memDumpType = actionRequest.parameters.type;
      const unsupportedAgents: string[] = [];

      for (const endpointMeta of endpointMetadata) {
        if (
          (memDumpType === 'kernel' &&
            !endpointMeta.Endpoint.capabilities?.includes('memdump_kernel')) ||
          (memDumpType === 'process' &&
            !endpointMeta.Endpoint.capabilities?.includes('memdump_process'))
        ) {
          unsupportedAgents.push(
            `${endpointMeta.agent.id} (agent v.${endpointMeta.agent.version})`
          );
        }
      }

      if (unsupportedAgents.length > 0) {
        return {
          isValid: false,
          error: new ResponseActionsClientError(
            `The following agent IDs do not support memory dump: ${unsupportedAgents.join(', ')}`
          ),
        };
      }
    }

    if (actionRequest.command === 'runscript') {
      let scriptDetails: EndpointScript;

      try {
        scriptDetails = await this.fetchScript(actionRequest.parameters.scriptId);
      } catch (error) {
        return { isValid: false, error };
      }

      if (scriptDetails.requiresInput && !(actionRequest.parameters.scriptInput ?? '').trim()) {
        return {
          isValid: false,
          error: new ResponseActionsClientError(
            `The script [${scriptDetails.name}] requires arguments to be specified.`
          ),
        };
      }
    }

    if (actionRequest.command === 'cancel') {
      try {
        const actionToCancel = await getActionDetailsById(
          this.options.endpointService,
          this.options.spaceId,
          actionRequest.parameters.id
        );

        if (actionToCancel.agentType !== 'endpoint') {
          throw new ResponseActionsClientError(
            `Action [${actionRequest.parameters.id} / ${actionToCancel.command} / ${actionToCancel.agentType}] agent type is not 'endpoint'`,
            400
          );
        }

        for (const endpointId of actionRequest.endpoint_ids) {
          if (!actionToCancel.agents.includes(endpointId)) {
            throw new ResponseActionsClientError(
              `Endpoint [${endpointId}] is not associated with action [${actionToCancel.id}]`,
              400
            );
          }

          // Check to ensure that this endpoint's response is still pending
          if (actionToCancel.agentState[endpointId].isCompleted) {
            throw new ResponseActionsClientError(
              `Action [${actionRequest.parameters.id}] is already completed for agent [${endpointId}] and cannot be canceled.`,
              400
            );
          }
        }

        if (!isResponseActionCancelable(actionToCancel.command, this.agentType)) {
          throw new ResponseActionsClientError(
            `[${actionToCancel.command}] response action cannot be canceled.`,
            400
          );
        }

        // Ensure this endpoint supports `cancel`
        const endpointDetails = await this.options.endpointService
          .getEndpointMetadataService(this.options.spaceId)
          .getMetadataForEndpoints(actionRequest.endpoint_ids);

        for (const endpointMeta of endpointDetails) {
          if (!endpointMeta.Endpoint.capabilities?.includes('cancel')) {
            throw new ResponseActionsClientError(
              `Endpoint [${endpointMeta.host.hostname || endpointMeta.host.name} / ${
                endpointMeta.agent.id
              }] running [v${endpointMeta.agent.version}] does not support cancel action.`,
              400
            );
          }
        }
      } catch (error) {
        return { isValid: false, error };
      }
    }

    return super.validateRequest(actionRequest);
  }

  private async handleResponseAction<
    TOptions extends ResponseActionsRequestBody = ResponseActionsRequestBody,
    TResponse extends ActionDetails = ActionDetails,
    TMethodOptions extends CommonResponseActionMethodOptions = CommonResponseActionMethodOptions
  >(
    command: ResponseActionsApiCommandNames,
    actionReq: TOptions,
    options?: TMethodOptions
  ): Promise<TResponse> {
    const validatedAgents = await this.checkAgentIds(actionReq.endpoint_ids);
    const actionId = uuidv4();
    const { error: validationError } = await this.validateRequest({
      ...actionReq,
      command,
      endpoint_ids: validatedAgents.valid || [],
    });
    const { hosts, ruleName, ruleId, error } = this.getMethodOptions<TMethodOptions>(options);
    let actionError: string | undefined = validationError?.message || error;
    let actionRequestMeta: Record<string, unknown> | undefined;

    if (actionError && !this.options.isAutomated) {
      throw new ResponseActionsClientError(actionError, 400);
    }

    // Dispatch action to Endpoint using Fleet
    if (!actionError) {
      let actionParams = actionReq.parameters;

      // For runscript, we pass allow some additional data to the Endpoint which does
      // not come from the action request
      if (command === 'runscript') {
        const runscriptActionParams = actionParams as EndpointRunScriptActionRequestParams;
        const scriptDetails = await this.fetchScript(runscriptActionParams.scriptId);
        const scriptInfo = {
          file_id: scriptDetails.fileId,
          file_sha256: scriptDetails.fileHash,
          file_name: scriptDetails.fileName,
          file_size: scriptDetails.fileSize,
          path_to_executable: scriptDetails.pathToExecutable,
        };

        actionParams = {
          ...actionParams,
          ...scriptInfo,
        };

        // For reference and because the file information is not stored in the Action Request list of `parameters`,
        // we store the script info. in the action request `meta` field.
        actionRequestMeta = {
          ...(actionRequestMeta ?? {}),
          ...scriptInfo,
        };

        // Prepend the script name to the `comment` field for reference
        const scriptNameComment = `(Script name: ${scriptDetails.name} / File name: ${scriptDetails.fileName})`;

        if (!(actionReq.comment ?? '').startsWith(scriptNameComment)) {
          (actionReq as Mutable<TOptions>).comment = `${scriptNameComment}${
            actionReq.comment ? ` ${actionReq.comment}` : ''
          }`;
        }
      }

      try {
        await this.dispatchActionViaFleet({
          actionId,
          agents: validatedAgents.valid,
          data: {
            command,
            comment: actionReq.comment,
            parameters: actionParams as EndpointActionDataParameterTypes,
          },
        });
      } catch (e) {
        // If not in Automated mode, then just throw, else save the error and write
        // it to the Endpoint Action request doc
        if (!this.options.isAutomated) {
          throw e;
        }

        actionError = e.message;
      }
    }

    // Append warning message to comment if there are invalid agents
    const commentMessage = actionReq.comment ? actionReq.comment : '';
    const warningMessage = `(WARNING: ${getInvalidAgentsWarning(validatedAgents.invalid)})`;
    const comment = validatedAgents.invalid.length
      ? commentMessage
        ? `${commentMessage}. ${warningMessage}`
        : warningMessage
      : actionReq.comment;

    // Write action to endpoint index
    await this.writeActionRequestToEndpointIndex({
      ...actionReq,
      endpoint_ids: validatedAgents.valid,
      error: actionError,
      ruleId,
      ruleName,
      hosts,
      actionId,
      command,
      comment,
      meta: actionRequestMeta,
    } as ResponseActionsClientWriteActionRequestToEndpointIndexOptions);

    // Update cases
    await this.updateCases({
      command,
      actionId,
      comment,
      caseIds: actionReq.case_ids,
      alertIds: actionReq.alert_ids,
      hosts: validatedAgents.valid.map((hostId) => {
        return {
          hostId,
          hostname:
            validatedAgents.hosts.find((host) => host.agent.id === hostId)?.host.hostname ??
            hosts?.[hostId].name ??
            '',
        };
      }),
    });

    // We bypass space validation when retrieving the action details to ensure that if a failed
    // action was created, and it did not contain the agent policy information (and space is enabled)
    // we don't trigger an error.
    return this.fetchActionDetails<TResponse>(actionId, true);
  }

  private async dispatchActionViaFleet({
    actionId = uuidv4(),
    agents,
    data,
  }: Pick<FleetActionRequest, 'agents'> & {
    actionId?: string;
    data: LogsEndpointAction['EndpointActions']['data'];
  }): Promise<FleetActionRequest> {
    const [messageSigningService, fleetActionsService] = await Promise.all([
      this.options.endpointService.getMessageSigningService(),
      this.options.endpointService.getFleetActionsClient(),
    ]);
    const fleetActionDoc: FleetActionRequest = {
      '@timestamp': new Date().toISOString(),
      input_type: 'endpoint',
      type: 'INPUT_ACTION',
      timeout: 300, // 5 minutes
      expiration: getActionRequestExpiration(),
      user_id: this.options.username,
      action_id: actionId || uuidv4(),
      agents,
      // Casting needed because Fleet type definition, which accepts any object, but was not defined using `any`
      data: data as unknown as FleetActionRequest['data'],
    };
    const signedAction = await messageSigningService.sign(fleetActionDoc);

    fleetActionDoc.signed = {
      data: signedAction.data.toString('base64'),
      signature: signedAction.signature,
    };

    this.log.debug(`Signed Fleet endpoint action request:\n${stringify(fleetActionDoc)}`);

    return fleetActionsService.create(fleetActionDoc).catch((err) => {
      const error = new ResponseActionsClientError(
        `Attempt to create Fleet [${
          data.command
        }] response action request for agents [${agents.join(', ')}] failed with: ${err.message}`,
        500,
        err
      );
      this.log.error(error);
      throw error;
    });
  }

  protected async fetchScript(scriptId: string): Promise<EndpointScript> {
    const cacheKey = `script:${scriptId}`;
    const cacheResponse = this.cache.get<EndpointScript>(cacheKey);

    if (cacheResponse) {
      this.log.debug(
        () => `Cached script details found for script id [${scriptId}] - returning it`
      );

      return cacheResponse;
    }

    const scriptsLibraryClient = this.options.endpointService.getScriptsLibraryClient(
      this.options.spaceId,
      this.options.username
    );
    const scriptDetails = await scriptsLibraryClient.get(scriptId);

    this.cache.set(cacheKey, scriptDetails);

    return scriptDetails;
  }

  async isolate(
    actionRequest: IsolationRouteRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails> {
    return this.handleResponseAction<IsolationRouteRequestBody, ActionDetails>(
      'isolate',
      actionRequest,
      options
    );
  }

  async release(
    actionRequest: UnisolationRouteRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails> {
    return this.handleResponseAction<UnisolationRouteRequestBody, ActionDetails>(
      'unisolate',
      actionRequest,
      options
    );
  }

  async killProcess(
    actionRequest: KillProcessRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<
    ActionDetails<KillProcessActionOutputContent, ResponseActionParametersWithProcessData>
  > {
    return this.handleResponseAction<
      KillProcessRequestBody,
      ActionDetails<KillProcessActionOutputContent, ResponseActionParametersWithProcessData>
    >('kill-process', actionRequest, options);
  }

  async suspendProcess(
    actionRequest: SuspendProcessRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<
    ActionDetails<SuspendProcessActionOutputContent, ResponseActionParametersWithProcessData>
  > {
    return this.handleResponseAction<
      SuspendProcessRequestBody,
      ActionDetails<SuspendProcessActionOutputContent, ResponseActionParametersWithProcessData>
    >('suspend-process', actionRequest, options);
  }

  async runningProcesses(
    actionRequest: GetProcessesRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<GetProcessesActionOutputContent>> {
    return this.handleResponseAction<
      GetProcessesRequestBody,
      ActionDetails<GetProcessesActionOutputContent>
    >('running-processes', actionRequest, options);
  }

  async getFile(
    actionRequest: ResponseActionGetFileRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<ResponseActionGetFileOutputContent, ResponseActionGetFileParameters>> {
    return this.handleResponseAction<
      ResponseActionGetFileRequestBody,
      ActionDetails<ResponseActionGetFileOutputContent, ResponseActionGetFileParameters>
    >('get-file', actionRequest, options);
  }

  async execute(
    actionRequest: ExecuteActionRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<ResponseActionExecuteOutputContent, ResponseActionsExecuteParameters>> {
    let actionRequestWithDefaults = actionRequest;

    // Default for `timeout` applied here if not defined on request
    if (!actionRequestWithDefaults.parameters.timeout) {
      actionRequestWithDefaults = {
        ...actionRequest,
        parameters: {
          ...actionRequest.parameters,
          timeout: DEFAULT_EXECUTE_ACTION_TIMEOUT,
        },
      };
    }

    return this.handleResponseAction<
      ExecuteActionRequestBody,
      ActionDetails<ResponseActionExecuteOutputContent, ResponseActionsExecuteParameters>
    >('execute', actionRequestWithDefaults, options);
  }

  async scan(
    actionRequest: ScanActionRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<ResponseActionScanOutputContent, ResponseActionScanParameters>> {
    return this.handleResponseAction<
      ScanActionRequestBody,
      ActionDetails<ResponseActionScanOutputContent, ResponseActionScanParameters>
    >('scan', actionRequest, options);
  }

  async upload(
    actionRequest: UploadActionApiRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>> {
    const fleetFiles = await this.options.endpointService.getFleetToHostFilesClient();
    const fileStream = actionRequest.file as HapiReadableStream;
    const { file: _, parameters: userParams, ...actionPayload } = actionRequest;
    const uploadParameters: ResponseActionUploadParameters = {
      ...userParams,
      file_id: '',
      file_name: '',
      file_sha256: '',
      file_size: 0,
    };

    const createdFile = await fleetFiles.create(fileStream, actionPayload.endpoint_ids);

    uploadParameters.file_id = createdFile.id;
    uploadParameters.file_name = createdFile.name;
    uploadParameters.file_sha256 = createdFile.sha256;
    uploadParameters.file_size = createdFile.size;

    const createFileActionOptions = {
      ...actionPayload,
      parameters: uploadParameters,
      command: 'upload' as ResponseActionsApiCommandNames,
    };

    try {
      const createdAction = await this.handleResponseAction<
        typeof createFileActionOptions,
        ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>
      >('upload', createFileActionOptions, options);

      // Update the file meta to include the action id, and if any errors (unlikely),
      // then just log them and still allow api to return success since the action has
      // already been created and potentially dispatched to Endpoint. Action ID is not
      // needed by the Endpoint or fleet-server's API, so no need to fail here
      try {
        await fleetFiles.update(uploadParameters.file_id, { actionId: createdAction.id });
      } catch (e) {
        this.log.warn(`Attempt to update File meta with Action ID failed: ${e.message}`, e);
      }

      return createdAction;
    } catch (err) {
      if (uploadParameters.file_id) {
        // Try to delete the created file since creating the action threw an error
        try {
          await fleetFiles.delete(uploadParameters.file_id);
        } catch (e) {
          this.log.error(
            `Attempt to clean up file id [${uploadParameters.file_id}] (after action creation was unsuccessful) failed; ${e.message}`,
            e
          );
        }
      }

      throw err;
    }
  }

  async memoryDump(
    actionRequest: OmitUnsupportedAttributes<MemoryDumpActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<ResponseActionMemoryDumpOutputContent, ResponseActionMemoryDumpParameters>
  > {
    if (!this.options.endpointService.experimentalFeatures.responseActionsEndpointMemoryDump) {
      throw new ResponseActionsClientError('Memory dump operation is not enabled', 400);
    }

    return this.handleResponseAction<
      MemoryDumpActionRequestBody,
      ActionDetails<ResponseActionMemoryDumpOutputContent, ResponseActionMemoryDumpParameters>
    >('memory-dump', actionRequest, options);
  }

  async cancel(
    actionRequest: OmitUnsupportedAttributes<CancelActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionCancelOutputContent, ResponseActionCancelParameters>> {
    if (!this.options.endpointService.experimentalFeatures.responseActionsEndpointCancel) {
      throw new ResponseActionsClientError('Elastic Defend cancel operation is not enabled', 400);
    }

    return this.handleResponseAction<
      CancelActionRequestBody,
      ActionDetails<ResponseActionCancelOutputContent, ResponseActionCancelParameters>
    >('cancel', actionRequest, options);
  }

  async runscript(
    actionRequest: OmitUnsupportedAttributes<RunScriptActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<ResponseActionRunScriptOutputContent, ResponseActionRunScriptParameters>
  > {
    if (
      !this.options.endpointService.experimentalFeatures.responseActionsEndpointRunScript ||
      (this.options.isAutomated &&
        !this.options.endpointService.experimentalFeatures
          .responseActionsEndpointAutomatedRunScript)
    ) {
      throw new ResponseActionsClientError(
        'Elastic Defend runscript operation is not enabled',
        400
      );
    }

    let runscriptActionRequestParams = actionRequest;

    // Apply default for `timeout` if not set on request payload
    if (
      !(runscriptActionRequestParams.parameters as EndpointRunScriptActionRequestParams).timeout
    ) {
      runscriptActionRequestParams = {
        ...runscriptActionRequestParams,
        parameters: {
          ...runscriptActionRequestParams.parameters,
          timeout: DEFAULT_EXECUTE_ACTION_TIMEOUT,
        },
      };
    }

    return this.handleResponseAction<
      RunScriptActionRequestBody,
      ActionDetails<ResponseActionRunScriptOutputContent, ResponseActionRunScriptParameters>
    >('runscript', runscriptActionRequestParams, options);
  }

  async getCustomScripts({
    osType,
  }: Omit<
    CustomScriptsRequestQueryParams,
    'agentType'
  > = {}): Promise<ResponseActionScriptsApiResponse> {
    if (
      !this.options.endpointService.experimentalFeatures.responseActionsEndpointRunScript ||
      !this.options.endpointService.experimentalFeatures.responseActionsScriptLibraryManagement
    ) {
      throw new ResponseActionsClientError(
        'Elastic Defend runscript operation is not enabled',
        400
      );
    }

    const scriptsClient = this.options.endpointService.getScriptsLibraryClient(
      this.options.spaceId,
      this.options.username
    );

    const scriptList = await scriptsClient.list({
      sortField: 'name',
      sortDirection: 'asc',
      pageSize: 10_000,
      kuery: osType ? `platform: "${osType}"` : undefined,
    });

    return {
      data: scriptList.data.map((script) => {
        return {
          id: script.id,
          name: script.name,
          description: script.description ?? '',
          meta: script,
        };
      }),
    };
  }

  async getFileDownload(actionId: string, fileId: string): Promise<GetFileDownloadMethodResponse> {
    await this.ensureValidActionId(actionId);

    const fleetFiles = await this.options.endpointService.getFleetFromHostFilesClient();
    const file = await fleetFiles.get(fileId);

    if (file.actionId !== actionId) {
      throw new CustomHttpRequestError(`Invalid file id [${fileId}] for action [${actionId}]`, 400);
    }

    return fleetFiles.download(fileId);
  }

  async getFileInfo(actionId: string, fileId: string): Promise<UploadedFileInfo> {
    await this.ensureValidActionId(actionId);

    const fleetFiles = await this.options.endpointService.getFleetFromHostFilesClient();
    const {
      name,
      id,
      mimeType,
      size,
      status,
      created,
      agents,
      actionId: fileActionId,
    } = await fleetFiles.get(fileId);

    if (fileActionId !== actionId) {
      throw new ResponseActionsClientError(
        `Invalid file ID. File [${fileId}] not associated with action ID [${actionId}]`
      );
    }

    return {
      name,
      id,
      mimeType,
      size,
      status,
      created,
      actionId,
      agentId: agents[0],
      agentType: this.agentType,
    };
  }
}
