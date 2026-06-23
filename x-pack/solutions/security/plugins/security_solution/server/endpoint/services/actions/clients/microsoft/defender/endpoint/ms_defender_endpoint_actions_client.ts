/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
import {
  CONNECTOR_ID as MICROSOFT_DEFENDER_ENDPOINT_CONNECTOR_ID,
  SUB_ACTION as MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION,
} from '@kbn/connector-schemas/microsoft_defender_endpoint';
import type {
  MicrosoftDefenderEndpointAgentDetailsParams,
  MicrosoftDefenderEndpointIsolateHostParams,
  MicrosoftDefenderEndpointCancelParams,
  MicrosoftDefenderEndpointMachine,
  MicrosoftDefenderEndpointMachineAction,
  MicrosoftDefenderEndpointGetActionsParams,
  MicrosoftDefenderEndpointGetActionsResponse,
  MicrosoftDefenderEndpointRunScriptParams,
  MicrosoftDefenderGetLibraryFilesResponse,
} from '@kbn/connector-schemas/microsoft_defender_endpoint';
import { groupBy } from 'lodash';
import { Writable, type Readable } from 'stream';
import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import { isResponseActionCancelable } from '../../../../../../../../common/endpoint/service/response_actions/is_response_action_cancelable';
import { buildIndexNameWithNamespace } from '../../../../../../../../common/endpoint/utils/index_name_utilities';
import { MICROSOFT_DEFENDER_INDEX_PATTERNS_BY_INTEGRATION } from '../../../../../../../../common/endpoint/service/response_actions/microsoft_defender';
import type {
  IsolationRouteRequestBody,
  RunScriptActionRequestBody,
  UnisolationRouteRequestBody,
  MSDefenderRunScriptActionRequestParams,
  CancelActionRequestBody,
} from '../../../../../../../../common/api/endpoint';
import type {
  ActionDetails,
  ResponseActionScriptsApiResponse,
  EndpointActionDataParameterTypes,
  EndpointActionResponseDataOutput,
  LogsEndpointAction,
  LogsEndpointActionResponse,
  MicrosoftDefenderEndpointActionRequestCommonMeta,
  MicrosoftDefenderEndpointActionRequestFileMeta,
  MicrosoftDefenderEndpointLogEsDoc,
  ResponseActionCancelParameters,
  ResponseActionCancelOutputContent,
  ResponseActionRunScriptOutputContent,
  ResponseActionRunScriptParameters,
  UploadedFileInfo,
  ActionResponseOutput,
} from '../../../../../../../../common/endpoint/types';
import type {
  ResponseActionAgentType,
  ResponseActionsApiCommandNames,
} from '../../../../../../../../common/endpoint/service/response_actions/constants';
import type { NormalizedExternalConnectorClient } from '../../../lib/normalized_external_connector_client';
import {
  type ResponseActionsClientPendingAction,
  type ResponseActionsClientValidateRequestResponse,
  type ResponseActionsClientWriteActionRequestToEndpointIndexOptions,
  ResponseActionsClientImpl,
  type ResponseActionsClientOptions,
} from '../../../lib/base_response_actions_client';
import { stringify } from '../../../../../../utils/stringify';
import {
  ResponseActionAgentResponseEsDocNotFound,
  ResponseActionsClientError,
} from '../../../errors';
import type {
  CommonResponseActionMethodOptions,
  GetFileDownloadMethodResponse,
  OmitUnsupportedAttributes,
  ProcessPendingActionsMethodOptions,
} from '../../../lib/types';
import { catchAndWrapError } from '../../../../../../utils';

/**
 * Validation result for MDE action details
 */
export interface ActionValidationResult {
  isValid: boolean;
  error?: string;
}

export type MicrosoftDefenderActionsClientOptions = ResponseActionsClientOptions & {
  connectorActions: NormalizedExternalConnectorClient;
};

const MDE_ACTION_FETCH_RETRY_CONFIG = {
  retries: 5,
  minTimeout: 300,
  maxTimeout: 1500,
  factor: 1.5,
};

// max size of script output file to retrieve
// little more than endpoint execute stderr/stdout threshold of 2kB
// to account for mde output file containing extra metadata and both stderr and stdout
const RUNSCRIPT_OUTPUT_FILE_MAX_SIZE_BYTES = 4.5 * 1024; // 4.5 KB

export class MicrosoftDefenderEndpointActionsClient extends ResponseActionsClientImpl {
  protected readonly agentType: ResponseActionAgentType = 'microsoft_defender_endpoint';
  private readonly connectorActionsClient: NormalizedExternalConnectorClient;

  constructor({ connectorActions, ...options }: MicrosoftDefenderActionsClientOptions) {
    super(options);
    this.connectorActionsClient = connectorActions;
    connectorActions.setup(MICROSOFT_DEFENDER_ENDPOINT_CONNECTOR_ID);
  }

  /**
   * Returns a list of all indexes for Microsoft Defender data supported for response actions
   * @internal
   */
  private async fetchIndexNames(): Promise<string[]> {
    const cachedInfo = this.cache.get<string[]>('fetchIndexNames');

    if (cachedInfo) {
      this.log.debug(
        `Returning cached response with list of index names:\n${stringify(cachedInfo)}`
      );
      return cachedInfo;
    }

    const integrationNames = Object.keys(MICROSOFT_DEFENDER_INDEX_PATTERNS_BY_INTEGRATION);
    const fleetServices = this.options.endpointService.getInternalFleetServices(
      this.options.spaceId
    );
    const indexNamespaces = await fleetServices.getIntegrationNamespaces(integrationNames);
    const indexNames: string[] = [];

    for (const [integrationName, namespaces] of Object.entries(indexNamespaces)) {
      if (namespaces.length > 0) {
        const indexPatterns =
          MICROSOFT_DEFENDER_INDEX_PATTERNS_BY_INTEGRATION[
            integrationName as keyof typeof MICROSOFT_DEFENDER_INDEX_PATTERNS_BY_INTEGRATION
          ];

        for (const indexPattern of indexPatterns) {
          indexNames.push(
            ...namespaces.map((namespace) => buildIndexNameWithNamespace(indexPattern, namespace))
          );
        }
      }
    }

    this.cache.set('fetchIndexNames', indexNames);
    this.log.debug(() => `MS Defender indexes with namespace:\n${stringify(indexNames)}`);

    return indexNames;
  }

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

    const esClient = this.options.esClient;
    const esSearchRequest: SearchRequest = {
      index: await this.fetchIndexNames(),
      query: { bool: { filter: [{ terms: { 'cloud.instance.id': agentIds } }] } },
      collapse: {
        field: 'cloud.instance.id',
        inner_hits: {
          name: 'most_recent',
          size: 1,
          _source: ['agent', 'cloud.instance.id', 'event.created'],
          sort: [{ 'event.created': 'desc' }],
        },
      },
      _source: false,
      ignore_unavailable: true,
    };

    if (!esSearchRequest.index || esSearchRequest.index.length === 0) {
      throw new ResponseActionsClientError(
        `Unable to build list of indexes while retrieving policy information for Microsoft Defender agents [${agentIds.join(
          ', '
        )}]. Check to ensure at least one integration policy exists.`,
        400
      );
    }

    this.log.debug(() => `Searching for agents with:\n${stringify(esSearchRequest)}`);

    const msDefenderLogEsResults = await esClient
      .search<
        MicrosoftDefenderEndpointLogEsDoc,
        { most_recent: MicrosoftDefenderEndpointLogEsDoc }
      >(esSearchRequest)
      .catch(catchAndWrapError);

    this.log.debug(
      () => `MS Defender Log records found:\n${stringify(msDefenderLogEsResults, 20)}`
    );

    const agentIdsFound: string[] = [];
    const fleetAgentIdToMsDefenderAgentIdMap: Record<string, string> = (
      msDefenderLogEsResults.hits.hits ?? []
    ).reduce((acc, esDoc) => {
      const doc = esDoc.inner_hits?.most_recent.hits.hits[0]._source;

      if (doc) {
        agentIdsFound.push(doc.cloud.instance.id);
        acc[doc.agent.id] = doc.cloud.instance.id;
      }

      return acc;
    }, {} as Record<string, string>);
    const elasticAgentIds = Object.keys(fleetAgentIdToMsDefenderAgentIdMap);

    if (elasticAgentIds.length === 0) {
      throw new ResponseActionsClientError(
        `Unable to find Elastic agent IDs for Microsoft Defender agent ids: [${agentIds.join(
          ', '
        )}]`,
        400
      );
    }

    // ensure all MS agent ids were found
    for (const agentId of agentIds) {
      if (!agentIdsFound.includes(agentId)) {
        throw new ResponseActionsClientError(
          `Microsoft Defender agent id [${agentId}] not found`,
          404
        );
      }
    }

    const agentPolicyInfo = await this.fetchFleetInfoForAgents(elasticAgentIds);

    for (const agentInfo of agentPolicyInfo) {
      agentInfo.agentId = fleetAgentIdToMsDefenderAgentIdMap[agentInfo.elasticAgentId];
    }

    this.cache.set(cacheKey, agentPolicyInfo);
    return agentPolicyInfo;
  }

  protected async handleResponseActionCreation<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(
    actionRequestOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      TParameters,
      TOutputContent,
      TMeta
    >
  ): Promise<{
    actionEsDoc: LogsEndpointAction<TParameters, TOutputContent, TMeta>;
    actionDetails: ActionDetails<TOutputContent, TParameters>;
  }> {
    const actionRequestDoc = await this.writeActionRequestToEndpointIndex<
      TParameters,
      TOutputContent,
      TMeta
    >(actionRequestOptions);

    await this.updateCases({
      command: actionRequestOptions.command,
      caseIds: actionRequestOptions.case_ids,
      alertIds: actionRequestOptions.alert_ids,
      actionId: actionRequestDoc.EndpointActions.action_id,
      hosts: actionRequestOptions.endpoint_ids.map((agentId) => {
        return {
          hostId: agentId,
          hostname: actionRequestDoc.EndpointActions.data.hosts?.[agentId].name ?? '',
        };
      }),
      comment: actionRequestOptions.comment,
    });

    return {
      actionEsDoc: actionRequestDoc,
      actionDetails: await this.fetchActionDetails<ActionDetails<TOutputContent, TParameters>>(
        actionRequestDoc.EndpointActions.action_id
      ),
    };
  }

  /**
   * Sends actions to Ms Defender for Endpoint directly (via Connector)
   * @internal
   */
  private async sendAction<
    TResponse = unknown,
    TParams extends Record<string, unknown> = Record<string, unknown>
  >(
    actionType: MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION,
    actionParams: TParams
  ): Promise<ActionTypeExecutorResult<TResponse>> {
    const executeOptions: Parameters<typeof this.connectorActionsClient.execute>[0] = {
      params: {
        subAction: actionType,
        subActionParams: actionParams,
      },
    };

    this.log.debug(
      () =>
        `calling connector actions 'execute()' for Microsoft Defender for Endpoint with:\n${stringify(
          executeOptions
        )}`
    );

    const actionSendResponse = await this.connectorActionsClient.execute(executeOptions);

    if (actionSendResponse.status === 'error') {
      this.log.error(stringify(actionSendResponse));

      throw new ResponseActionsClientError(
        `Attempt to send [${actionType}] to Microsoft Defender for Endpoint failed: ${
          actionSendResponse.serviceMessage || actionSendResponse.message
        }`,
        500,
        actionSendResponse
      );
    }

    this.log.debug(() => `Response:\n${stringify(actionSendResponse)}`);

    return actionSendResponse as ActionTypeExecutorResult<TResponse>;
  }

  protected async writeActionRequestToEndpointIndex<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = MicrosoftDefenderEndpointActionRequestCommonMeta
  >(
    actionRequest: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      TParameters,
      TOutputContent,
      TMeta
    >
  ): Promise<LogsEndpointAction<TParameters, TOutputContent, TMeta>> {
    const agentId = actionRequest.endpoint_ids[0];
    const agentDetails = await this.getAgentDetails(agentId);

    const doc = await super.writeActionRequestToEndpointIndex<TParameters, TOutputContent, TMeta>({
      ...actionRequest,
      hosts: {
        [agentId]: { name: agentDetails.computerDnsName },
      },
    });

    return doc;
  }

  /** Gets agent details directly from MS Defender for Endpoint */
  private async getAgentDetails(agentId: string): Promise<MicrosoftDefenderEndpointMachine> {
    const cacheKey = `getAgentDetails:${agentId}`;
    const cachedEntry = this.cache.get<MicrosoftDefenderEndpointMachine>(cacheKey);

    if (cachedEntry) {
      this.log.debug(
        `Found cached agent details for UUID [${agentId}]:\n${stringify(cachedEntry)}`
      );
      return cachedEntry;
    }

    let msDefenderEndpointGetMachineDetailsApiResponse:
      | MicrosoftDefenderEndpointMachine
      | undefined;

    try {
      const agentDetailsResponse = await this.sendAction<
        MicrosoftDefenderEndpointMachine,
        MicrosoftDefenderEndpointAgentDetailsParams
      >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_AGENT_DETAILS, { id: agentId });

      msDefenderEndpointGetMachineDetailsApiResponse = agentDetailsResponse.data;
    } catch (err) {
      throw new ResponseActionsClientError(
        `Error while attempting to retrieve Microsoft Defender for Endpoint host with agent id [${agentId}]: ${err.message}`,
        500,
        err
      );
    }

    if (!msDefenderEndpointGetMachineDetailsApiResponse) {
      throw new ResponseActionsClientError(
        `Microsoft Defender for Endpoint agent id [${agentId}] not found`,
        404
      );
    }

    this.cache.set(cacheKey, msDefenderEndpointGetMachineDetailsApiResponse);

    return msDefenderEndpointGetMachineDetailsApiResponse;
  }

  /**
   * Validates that an MDE runscript action matches the expected script name and action ID.
   * This detects when MDE throttles/replaces our action with an existing one.
   *
   * @param actionDetails The action details returned by MDE
   * @param expectedScriptName The script name we requested
   * @param expectedActionId The Kibana action ID we included in the comment
   * @returns Validation result with isValid flag and error message if validation fails
   * @internal
   */
  private checkRunscriptActionMatches(
    actionDetails: MicrosoftDefenderEndpointMachineAction,
    expectedScriptName: string,
    expectedActionId: string
  ): ActionValidationResult {
    // Validate inputs
    if (!expectedScriptName || !expectedActionId) {
      return {
        isValid: false,
        error: 'Unable to validate action. Missing required parameters.',
      };
    }

    const commandEntry = actionDetails.commands?.[0];
    if (!commandEntry || !commandEntry.command?.params) {
      return {
        isValid: false,
        error: 'Unable to verify action details. The action information is incomplete.',
      };
    }

    const scriptNameParam = commandEntry.command.params.find((p) => p.key === 'ScriptName');
    const actualScriptName = scriptNameParam?.value;
    // Validate script name exists
    if (!actualScriptName) {
      return {
        isValid: false,
        error: 'Unable to verify which script is running. The action information is incomplete.',
      };
    }

    // Validate action ID is in comment
    if (!actionDetails.requestorComment?.includes(expectedActionId)) {
      return {
        isValid: false,
        error: `Cannot run script '${actualScriptName}' because an identical script is already in progress on this host (MDE action ID: ${actionDetails.id}). Please wait for the current script to complete or cancel it before trying again.`,
      };
    }

    // Validate script name matches
    if (actualScriptName !== expectedScriptName) {
      return {
        isValid: false,
        error: `Cannot run script '${expectedScriptName}' because another script ('${actualScriptName}') is already in progress on this host (MDE action ID: ${actionDetails.id}). Please wait for the current script to complete or cancel it before trying again.`,
      };
    }

    // All validations passed - this is our action
    return {
      isValid: true,
    };
  }

  /**
   * Fetches and validates the details of a specific runscript action from Microsoft Defender for Endpoint.
   * This method ensures that the action returned by MDE matches our expected script name and action ID,
   * detecting when MDE throttles/replaces our action with an existing one.
   *
   * @param machineActionId - The Microsoft Defender machine action ID returned from sendAction
   * @param expectedScriptName - The script name we requested to run
   * @param expectedActionId - The Kibana action ID we included in the comment
   * @returns Validation result with isValid flag and error message if validation fails
   * @internal
   */
  private async fetchAndValidateRunscriptActionDetails(
    machineActionId: string,
    expectedScriptName: string,
    expectedActionId: string
  ): Promise<ActionValidationResult> {
    this.log.debug(`Fetching action details from MDE API for machineActionId [${machineActionId}]`);

    try {
      // Retry fetching action details to handle MDE API indexing lag.
      // When MDE accepts a new action, there's a delay before it appears in their GET actions API.
      // We retry request with linear increase in time delay (300ms → 450ms → 675ms → 1012ms → 1518ms) up to 5 times
      // to give MDE's internal indexing sufficient time to make the action available.
      const actionDetails = await pRetry(
        async () => {
          this.log.debug(`Attempting to fetch MDE action [${machineActionId}]`);

          const params: MicrosoftDefenderEndpointGetActionsParams = {
            id: [machineActionId],
            pageSize: 1,
          };

          const response = await this.sendAction<
            MicrosoftDefenderEndpointGetActionsResponse,
            MicrosoftDefenderEndpointGetActionsParams
          >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS, params);

          const action = response.data?.value?.[0];

          if (!action) {
            throw new Error(
              `Action not yet available in MDE API for machineActionId [${machineActionId}]`
            );
          }

          return action;
        },
        {
          ...MDE_ACTION_FETCH_RETRY_CONFIG,
          onFailedAttempt: ({ attemptNumber, retriesLeft, message }) => {
            this.log.debug(
              `Attempt ${attemptNumber} to fetch MDE action [${machineActionId}] failed. ${retriesLeft} retries left. [ERROR: ${message}]`
            );
          },
        }
      );

      this.log.debug(
        `Successfully fetched action details for machineActionId [${machineActionId}]: status=${actionDetails.status}, type=${actionDetails.type}`
      );

      // Validate if the response action matches the MDE action
      return this.checkRunscriptActionMatches(actionDetails, expectedScriptName, expectedActionId);
    } catch (error) {
      this.log.error(
        `Failed to fetch action details from MDE API for machineActionId [${machineActionId}]: ${error.message}`
      );

      return {
        isValid: false,
        error: `Action details not found in Microsoft Defender for machineActionId [${machineActionId}]. The action may not have been created successfully.`,
      };
    }
  }

  protected async validateRequest(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<any, any, any>
  ): Promise<ResponseActionsClientValidateRequestResponse> {
    // TODO: support multiple agents
    if (payload.endpoint_ids.length > 1) {
      return {
        isValid: false,
        error: new ResponseActionsClientError(
          `[body.endpoint_ids]: Multiple agents IDs not currently supported for Microsoft Defender for Endpoint`,
          400
        ),
      };
    }

    // For cancel actions, perform comprehensive validation
    if (payload.command === 'cancel') {
      const { microsoftDefenderEndpointCancelEnabled } =
        this.options.endpointService.experimentalFeatures;

      if (!microsoftDefenderEndpointCancelEnabled) {
        throw new ResponseActionsClientError(
          'Cancel operation is not enabled for Microsoft Defender for Endpoint',
          400
        );
      }

      const actionId = payload.parameters?.id;
      if (!actionId) {
        return {
          isValid: false,
          error: new ResponseActionsClientError(
            'id is required in parameters for cancel action',
            400
          ),
        };
      }

      try {
        // Fetch the original action to validate cancel request
        const originalAction = await this.fetchActionDetails(actionId);

        // Check if action is already completed
        if (originalAction.isCompleted) {
          const statusMessage = originalAction.wasSuccessful ? 'completed successfully' : 'failed';
          return {
            isValid: false,
            error: new ResponseActionsClientError(
              `Cannot cancel action [${actionId}] because it has already ${statusMessage}.`,
              400
            ),
          };
        }

        // Validate endpoint ID association if provided
        const requestEndpointId = payload.endpoint_ids?.[0];
        if (requestEndpointId && originalAction.agents) {
          const originalActionAgentIds = Array.isArray(originalAction.agents)
            ? originalAction.agents
            : [originalAction.agents];

          if (!originalActionAgentIds.includes(requestEndpointId)) {
            return {
              isValid: false,
              error: new ResponseActionsClientError(
                `Endpoint '${requestEndpointId}' is not associated with action '${actionId}'`,
                400
              ),
            };
          }
        }

        // Validate command information exists
        if (!originalAction.command) {
          return {
            isValid: false,
            error: new ResponseActionsClientError(
              `Unable to determine command type for action '${actionId}'`,
              500
            ),
          };
        }

        // Check if we're trying to cancel a cancel action (business rule validation)
        if (!isResponseActionCancelable(originalAction.command, this.agentType)) {
          return {
            isValid: false,
            error: new ResponseActionsClientError(
              `[${originalAction.command}] response action cannot be canceled.`,
              400
            ),
          };
        }
      } catch (error) {
        // If we can't fetch the action details (e.g., action not found),
        // return a validation error
        if (error instanceof Error && error.message.includes('not found')) {
          return {
            isValid: false,
            error: new ResponseActionsClientError(`Action with id '${actionId}' not found.`, 404),
          };
        }
        // For other errors, let them bubble up
        throw error;
      }
    }

    return super.validateRequest(payload);
  }

  async isolate(
    actionRequest: IsolationRouteRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails> {
    const reqIndexOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      undefined,
      {},
      MicrosoftDefenderEndpointActionRequestCommonMeta
    > = {
      ...actionRequest,
      ...this.getMethodOptions(options),
      parameters: undefined,
      command: 'isolate',
    };

    if (!reqIndexOptions.error) {
      let error = (await this.validateRequest(reqIndexOptions)).error;

      if (!error) {
        try {
          const msActionResponse = await this.sendAction<
            MicrosoftDefenderEndpointMachineAction,
            MicrosoftDefenderEndpointIsolateHostParams
          >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.ISOLATE_HOST, {
            id: actionRequest.endpoint_ids[0],
            comment: this.buildExternalComment(reqIndexOptions),
          });

          if (msActionResponse?.data?.id) {
            reqIndexOptions.meta = { machineActionId: msActionResponse.data.id };
          } else {
            throw new ResponseActionsClientError(
              `Isolate request was sent to Microsoft Defender, but Machine Action Id was not provided!`
            );
          }
        } catch (err) {
          error = err;
        }
      }

      reqIndexOptions.error = error?.message;

      if (!this.options.isAutomated && error) {
        throw error;
      }
    }

    const { actionDetails } = await this.handleResponseActionCreation(reqIndexOptions);

    return actionDetails;
  }

  async release(
    actionRequest: UnisolationRouteRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails> {
    const reqIndexOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      undefined,
      {},
      MicrosoftDefenderEndpointActionRequestCommonMeta
    > = {
      ...actionRequest,
      ...this.getMethodOptions(options),
      parameters: undefined,
      command: 'unisolate',
    };

    if (!reqIndexOptions.error) {
      let error = (await this.validateRequest(reqIndexOptions)).error;

      if (!error) {
        try {
          const msActionResponse = await this.sendAction<
            MicrosoftDefenderEndpointMachineAction,
            MicrosoftDefenderEndpointIsolateHostParams
          >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.RELEASE_HOST, {
            id: actionRequest.endpoint_ids[0],
            comment: this.buildExternalComment(reqIndexOptions),
          });

          if (msActionResponse?.data?.id) {
            reqIndexOptions.meta = { machineActionId: msActionResponse.data.id };
          } else {
            throw new ResponseActionsClientError(
              `Un-Isolate request was sent to Microsoft Defender, but Machine Action Id was not provided!`
            );
          }
        } catch (err) {
          error = err;
        }
      }

      reqIndexOptions.error = error?.message;

      if (!this.options.isAutomated && error) {
        throw error;
      }
    }

    const { actionDetails } = await this.handleResponseActionCreation(reqIndexOptions);

    return actionDetails;
  }

  public async runscript(
    actionRequest: OmitUnsupportedAttributes<RunScriptActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<ResponseActionRunScriptOutputContent, ResponseActionRunScriptParameters>
  > {
    const reqIndexOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      MSDefenderRunScriptActionRequestParams,
      {},
      MicrosoftDefenderEndpointActionRequestCommonMeta
    > & { parameters: MSDefenderRunScriptActionRequestParams } = {
      ...actionRequest,
      ...this.getMethodOptions(options),
      parameters: actionRequest.parameters as MSDefenderRunScriptActionRequestParams,
      command: 'runscript',
    };
    const { scriptName, args } = reqIndexOptions.parameters;

    if (!reqIndexOptions.error) {
      let reqValidationError = (await this.validateRequest(reqIndexOptions)).error;

      if (!reqValidationError) {
        try {
          const msActionResponse = await this.sendAction<
            MicrosoftDefenderEndpointMachineAction,
            MicrosoftDefenderEndpointRunScriptParams
          >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.RUN_SCRIPT, {
            id: reqIndexOptions.endpoint_ids[0],
            comment: this.buildExternalComment(reqIndexOptions),
            parameters: {
              scriptName,
              args,
            },
          });

          const machineActionId = msActionResponse?.data?.id;
          if (!machineActionId) {
            throw new ResponseActionsClientError(
              `Run Script request was sent to Microsoft Defender, but Machine Action Id was not provided!`
            );
          }

          // Ensure actionId is set for validation. While buildExternalComment() should have already
          // set it via side effect, TypeScript doesn't track this, and defensive programming dictates
          // we guarantee it exists.
          if (!reqIndexOptions.actionId) {
            reqIndexOptions.actionId = uuidv4();
          }

          const mdeActionValidation = await this.fetchAndValidateRunscriptActionDetails(
            machineActionId,
            scriptName,
            reqIndexOptions.actionId
          );

          if (!mdeActionValidation.isValid) {
            throw new ResponseActionsClientError(
              mdeActionValidation.error ?? 'A runscript action is already pending in MS Defender.',
              409,
              {
                machineActionId,
                requestedScript: scriptName,
              }
            );
          }

          reqIndexOptions.meta = { machineActionId };
        } catch (err) {
          reqValidationError = err;
        }
      }

      reqIndexOptions.error = reqValidationError?.message;

      if (!this.options.isAutomated && reqValidationError) {
        throw reqValidationError;
      }
    }

    const { actionDetails } = await this.handleResponseActionCreation(reqIndexOptions);

    return actionDetails as ActionDetails<
      ResponseActionRunScriptOutputContent,
      ResponseActionRunScriptParameters
    >;
  }

  async cancel(
    actionRequest: CancelActionRequestBody,
    options: CommonResponseActionMethodOptions = {}
  ): Promise<ActionDetails<ResponseActionCancelOutputContent, ResponseActionCancelParameters>> {
    const actionId = actionRequest.parameters?.id;

    const reqIndexOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      ResponseActionCancelParameters,
      {},
      MicrosoftDefenderEndpointActionRequestCommonMeta
    > = {
      ...actionRequest,
      ...this.getMethodOptions(options),
      command: 'cancel',
      parameters: {
        id: actionId,
      },
    };

    if (!reqIndexOptions.error) {
      let error = (await this.validateRequest(reqIndexOptions)).error;

      if (!error) {
        try {
          // Get the external action ID from the internal response action ID
          const actionRequestWithExternalId = await this.fetchActionRequestEsDoc<
            EndpointActionDataParameterTypes,
            EndpointActionResponseDataOutput,
            MicrosoftDefenderEndpointActionRequestCommonMeta
          >(actionId);
          const externalActionId = actionRequestWithExternalId?.meta?.machineActionId;
          if (!externalActionId) {
            throw new ResponseActionsClientError(
              `Unable to resolve Microsoft Defender machine action ID for action [${actionId}]`,
              500
            );
          }

          const msActionResponse = await this.sendAction<
            MicrosoftDefenderEndpointMachineAction,
            MicrosoftDefenderEndpointCancelParams
          >(MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.CANCEL_ACTION, {
            actionId: externalActionId,
            comment: this.buildExternalComment(reqIndexOptions),
          });

          if (msActionResponse?.data?.id) {
            reqIndexOptions.meta = { machineActionId: msActionResponse.data.id };
          } else {
            throw new ResponseActionsClientError(
              `Cancel request was sent to Microsoft Defender, but Machine Action Id was not provided!`
            );
          }
        } catch (err) {
          error = err;
        }
      }

      reqIndexOptions.error = error?.message;

      if (!this.options.isAutomated && error) {
        throw error;
      }
    }

    const { actionDetails } = await this.handleResponseActionCreation(reqIndexOptions);

    return actionDetails as ActionDetails<
      ResponseActionCancelOutputContent,
      ResponseActionCancelParameters
    >;
  }

  async processPendingActions({
    abortSignal,
    addToQueue,
  }: ProcessPendingActionsMethodOptions): Promise<void> {
    if (abortSignal.aborted) {
      return;
    }

    const addResponsesToQueueIfAny = (responseList: LogsEndpointActionResponse[]): void => {
      if (responseList.length > 0) {
        addToQueue(...responseList);

        this.sendActionResponseTelemetry(responseList);
      }
    };

    for await (const pendingActions of this.fetchAllPendingActions<
      EndpointActionDataParameterTypes,
      EndpointActionResponseDataOutput,
      MicrosoftDefenderEndpointActionRequestCommonMeta
    >()) {
      if (abortSignal.aborted) {
        return;
      }

      const pendingActionsByType = groupBy(pendingActions, 'action.EndpointActions.data.command');

      for (const [actionType, typePendingActions] of Object.entries(pendingActionsByType)) {
        if (abortSignal.aborted) {
          return;
        }

        switch (actionType as ResponseActionsApiCommandNames) {
          case 'isolate':
          case 'unisolate':
          case 'cancel':
          case 'runscript':
            addResponsesToQueueIfAny(
              await this.checkPendingActions(
                typePendingActions as Array<
                  ResponseActionsClientPendingAction<
                    undefined,
                    {},
                    MicrosoftDefenderEndpointActionRequestCommonMeta
                  >
                >
              )
            );
            break;
        }
      }
    }
  }

  private async checkPendingActions(
    actionRequests: Array<
      ResponseActionsClientPendingAction<
        undefined,
        {},
        MicrosoftDefenderEndpointActionRequestCommonMeta
      >
    >
  ): Promise<LogsEndpointActionResponse[]> {
    const completedResponses: LogsEndpointActionResponse[] = [];
    const warnings: string[] = [];
    const actionsByMachineId: Record<
      string,
      Array<LogsEndpointAction<undefined, {}, MicrosoftDefenderEndpointActionRequestCommonMeta>>
    > = {};
    const machineActionIds: string[] = [];
    const msApiOptions: MicrosoftDefenderEndpointGetActionsParams = {
      id: machineActionIds,
      pageSize: 1000,
    };

    for (const { action } of actionRequests) {
      const command = action.EndpointActions.data.command;
      const machineActionId = action.meta?.machineActionId;

      if (!machineActionId) {
        warnings.push(
          `${command} response action ID [${action.EndpointActions.action_id}] is missing Microsoft Defender for Endpoint machine action id, thus unable to check on it's status. Forcing it to complete as failure.`
        );

        completedResponses.push(
          this.buildActionResponseEsDoc({
            actionId: action.EndpointActions.action_id,
            agentId: Array.isArray(action.agent.id) ? action.agent.id[0] : action.agent.id,
            data: { command },
            error: {
              message: `Unable to verify if action completed. Microsoft Defender machine action id ('meta.machineActionId') missing from the action request document!`,
            },
          })
        );
      } else {
        if (!actionsByMachineId[machineActionId]) {
          actionsByMachineId[machineActionId] = [];
        }

        actionsByMachineId[machineActionId].push(action);
        machineActionIds.push(machineActionId);
      }
    }

    const { data: machineActions } =
      await this.sendAction<MicrosoftDefenderEndpointGetActionsResponse>(
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTIONS,
        msApiOptions
      );

    if (machineActions?.value) {
      for (const machineAction of machineActions.value) {
        const machineActionId = machineAction.id;
        const mdeCommand = machineAction.type;

        const {
          isPending,
          isError,
          message: machineStateMessage,
        } = this.calculateMachineActionState(machineAction);
        const message: string =
          machineAction.commands?.[0]?.errors?.join('\n') || machineStateMessage;

        // completed actions -> failed | succeeded - build response docs for all associated action requests
        if (!isPending) {
          const completeActionRequests = actionsByMachineId[machineActionId] ?? [];

          for (const actionRequest of completeActionRequests) {
            const actionId = actionRequest.EndpointActions.action_id;
            const command = actionRequest.EndpointActions.data.command;
            const isCancelledAction = machineAction.status === 'Cancelled' && command === 'cancel';
            // Special handling for cancelled actions:
            // Cancel actions that successfully cancel something should show as success
            // Actions that were cancelled by another action should have an `error.message` set
            const shouldUpdateErrorMessage = !isCancelledAction && isError;

            const isRunscriptAction = mdeCommand === 'LiveResponse' && command === 'runscript';
            let output: ActionResponseOutput<EndpointActionResponseDataOutput> | undefined;
            let meta: {} | undefined;

            // If not a `cancel` response action and the MS Defender action status is `Canceled`, then
            // set the `canceled_by` and `canceled_id` fields in the output content so that we show the
            // action with a status of cancel in kibana
            if (machineAction.status === 'Cancelled' && command !== `cancel`) {
              output = output ?? { type: 'json', content: {} };
              output.content.canceled_by = 'action';
              output.content.canceled_id = '';
            }

            if (isRunscriptAction) {
              const outputFile = await this.fetchMachineLiveResponseFile(machineActionId);

              output = output ?? { type: 'json', content: {} };
              Object.assign(output.content, {
                stdout: outputFile?.stdout || '',
                stderr: outputFile?.stderr || '',
                code: outputFile?.code || '0',
              });
              meta = {
                machineActionId,
                filename: `runscript_output_${machineActionId}_0.json`,
                createdAt: new Date().toISOString(),
              };
            }

            completedResponses.push(
              this.buildActionResponseEsDoc({
                actionId,
                agentId: Array.isArray(actionRequest.agent.id)
                  ? actionRequest.agent.id[0]
                  : actionRequest.agent.id,
                data: {
                  command: actionRequest.EndpointActions.data.command,
                  output,
                },
                error: shouldUpdateErrorMessage ? { message } : undefined,
                meta,
              })
            );
          }
        }
      }
    }

    this.log.debug(
      () =>
        `${completedResponses.length} action responses generated:\n${stringify(completedResponses)}`
    );

    if (warnings.length > 0) {
      this.log.warn(warnings.join('\n'));
    }

    return completedResponses;
  }

  private calculateMachineActionState(machineAction: MicrosoftDefenderEndpointMachineAction): {
    isPending: boolean;
    isError: boolean;
    message: string;
  } {
    let isPending = true;
    let isError = false;
    let message = '';

    switch (machineAction.status) {
      case 'Failed':
      case 'TimeOut':
        isPending = false;
        isError = true;
        message = `Response action ${machineAction.status} (Microsoft Defender for Endpoint machine action ID: ${machineAction.id})`;
        break;

      case 'Cancelled':
        isPending = false;
        isError = true;
        message = `Response action was canceled by [${
          machineAction.cancellationRequestor
        }] (Microsoft Defender for Endpoint machine action ID: ${machineAction.id})${
          machineAction.cancellationComment ? `: ${machineAction.cancellationComment}` : ''
        }`;
        break;

      case 'Succeeded':
        isPending = false;
        isError = false;
        break;

      default:
        // covers 'Pending' | 'InProgress'
        isPending = true;
        isError = false;
    }

    return { isPending, isError, message };
  }

  async getCustomScripts(): Promise<ResponseActionScriptsApiResponse> {
    try {
      const customScriptsResponse = (await this.sendAction(
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_LIBRARY_FILES,
        {}
      )) as ActionTypeExecutorResult<MicrosoftDefenderGetLibraryFilesResponse>;

      const scripts = customScriptsResponse.data?.value || [];

      // Transform MS Defender scripts to ResponseActionScriptsApiResponse format
      const data = scripts.map((script) => ({
        // due to External EDR's schema nature - we expect a maybe() everywhere - empty strings are needed
        id: script.fileName || '',
        name: script.fileName || '',
        description: script.description || '',
      }));

      return { data } as ResponseActionScriptsApiResponse;
    } catch (err) {
      const error = new ResponseActionsClientError(
        `Failed to fetch Microsoft Defender for Endpoint scripts, failed with: ${err.message}`,
        500,
        err
      );
      this.log.error(error);
      throw error;
    }
  }

  async getFileInfo(actionId: string, agentId: string): Promise<UploadedFileInfo> {
    await this.ensureValidActionId(actionId);
    const {
      EndpointActions: {
        data: { command },
      },
    } = await this.fetchActionRequestEsDoc(actionId);

    const { microsoftDefenderEndpointRunScriptEnabled } =
      this.options.endpointService.experimentalFeatures;
    if (command === 'runscript' && !microsoftDefenderEndpointRunScriptEnabled) {
      throw new ResponseActionsClientError(
        `File downloads are not supported for ${this.agentType} agent type. Feature disabled.`,
        400
      );
    }

    const fileInfo: UploadedFileInfo = {
      actionId,
      agentId,
      id: agentId,
      agentType: this.agentType,
      status: 'AWAITING_UPLOAD',
      created: '',
      name: '',
      size: 0,
      mimeType: '',
    };

    try {
      switch (command) {
        case 'runscript':
          {
            const agentResponse = await this.fetchEsResponseDocForAgentId<
              {},
              MicrosoftDefenderEndpointActionRequestFileMeta
            >(actionId, agentId);

            fileInfo.status = 'READY';
            fileInfo.created = agentResponse.meta?.createdAt ?? '';
            fileInfo.name = agentResponse.meta?.filename ?? '';
            fileInfo.mimeType = 'application/octet-stream';
          }
          break;

        default:
          throw new ResponseActionsClientError(`${command} does not support file downloads`, 400);
      }
    } catch (e) {
      // Ignore "no response doc" error for the agent and just return the file info with the status of 'AWAITING_UPLOAD'
      if (!(e instanceof ResponseActionAgentResponseEsDocNotFound)) {
        throw e;
      }
    }

    return fileInfo;
  }

  async getFileDownload(actionId: string, agentId: string): Promise<GetFileDownloadMethodResponse> {
    await this.ensureValidActionId(actionId);
    const {
      EndpointActions: {
        data: { command },
      },
    } = await this.fetchActionRequestEsDoc(actionId);

    const { microsoftDefenderEndpointRunScriptEnabled } =
      this.options.endpointService.experimentalFeatures;
    if (command === 'runscript' && !microsoftDefenderEndpointRunScriptEnabled) {
      throw new ResponseActionsClientError(
        `File downloads are not supported for ${this.agentType} agent type. Feature disabled.`,
        400
      );
    }

    let downloadStream: Readable | undefined;
    let fileName: string = 'download.json';

    try {
      switch (command) {
        case 'runscript':
          {
            const runscriptAgentResponse = await this.fetchEsResponseDocForAgentId<
              {},
              MicrosoftDefenderEndpointActionRequestFileMeta
            >(actionId, agentId);

            if (!runscriptAgentResponse.meta?.machineActionId) {
              throw new ResponseActionsClientError(
                `Unable to retrieve file from Microsoft Defender for Endpoint. Response ES document is missing [meta.machineActionId]`
              );
            }

            const { data } = await this.sendAction<Readable>(
              MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
              { id: runscriptAgentResponse.meta?.machineActionId }
            );

            if (data) {
              downloadStream = data;
              fileName = runscriptAgentResponse.meta.filename;
            }
          }
          break;
      }

      if (!downloadStream) {
        throw new ResponseActionsClientError(
          `Unable to establish a file download Readable stream with Microsoft Defender for Endpoint for response action [${command}] [${actionId}]`
        );
      }
    } catch (e) {
      this.log.debug(
        () =>
          `Attempt to get file download stream from Microsoft Defender for Endpoint for response action failed with:\n${stringify(
            e
          )}`
      );

      throw e;
    }

    return {
      stream: downloadStream,
      mimeType: undefined,
      fileName,
    };
  }

  private async fetchEsResponseDocForAgentId<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(actionId: string, agentId: string): Promise<LogsEndpointActionResponse<TOutputContent, TMeta>> {
    const agentResponse = (
      await this.fetchActionResponseEsDocs<TOutputContent, TMeta>(actionId, [agentId])
    )[agentId];

    if (!agentResponse) {
      throw new ResponseActionAgentResponseEsDocNotFound(
        `Action ID [${actionId}] for agent ID [${agentId}] is still pending`,
        404
      );
    }

    return agentResponse;
  }

  private async fetchMachineLiveResponseFile(
    machineActionId: string
  ): Promise<ResponseActionRunScriptOutputContent | null> {
    try {
      const { data: readableStream } = await this.sendAction<Readable>(
        MICROSOFT_DEFENDER_ENDPOINT_SUB_ACTION.GET_ACTION_RESULTS,
        { id: machineActionId }
      );

      if (!readableStream) {
        this.log.debug(`No download stream available for machine action ${machineActionId}`);
        return null;
      }

      if (readableStream.readableLength > RUNSCRIPT_OUTPUT_FILE_MAX_SIZE_BYTES) {
        this.log.debug(
          `Download stream for machine action ${machineActionId} exceeds max size of ${RUNSCRIPT_OUTPUT_FILE_MAX_SIZE_BYTES} bytes`
        );
        readableStream.destroy();
        return {
          stdout: '',
          stderr: 'The output file is too large to download and display.',
          code: '413',
        };
      }

      return this.processStreamOutput(readableStream);
    } catch ({ message, statusCode }) {
      this.log.error(
        `Failed to fetch runscript output for machine action ${machineActionId}: ${message}`
      );

      return {
        stdout: '',
        stderr: message,
        code: statusCode,
      };
    }
  }

  private async processStreamOutput(
    stream: Readable
  ): Promise<ResponseActionRunScriptOutputContent> {
    try {
      let jsonStr = '';
      const writable = new Writable({
        write(chunk, _, callback) {
          jsonStr += chunk.toString('utf8');
          callback();
        },
      });

      const output = await new Promise<{
        script_output: string;
        script_errors: string;
        exit_code: string;
      }>((resolve, reject) => {
        writable
          .on('finish', () => {
            try {
              resolve(JSON.parse(jsonStr));
            } catch (parseError) {
              this.log.error(`Failed to parse runscript output file JSON: ${parseError.message}`);
              reject(parseError);
            }
          })
          .on('error', reject);
        stream.pipe(writable);
      });

      return {
        stdout: output.script_output,
        stderr: output.script_errors,
        code: output.exit_code,
      };
    } catch (_error) {
      const error = `Failed to process runscript output file: ${_error.message}`;
      this.log.error(error, { error: _error });

      return {
        stdout: '',
        stderr: error,
        code: '1',
      };
    }
  }
}
