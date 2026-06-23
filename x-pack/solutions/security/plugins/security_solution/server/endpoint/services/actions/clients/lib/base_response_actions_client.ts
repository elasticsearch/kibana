/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { CasesClient } from '@kbn/cases-plugin/server';
import type { Logger } from '@kbn/logging';
import { v4 as uuidv4 } from 'uuid';
import type { BulkCreateAttachmentsRequestV2 } from '@kbn/cases-plugin/common/types/api/attachment/v2';
import { i18n } from '@kbn/i18n';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import { SECURITY_ENDPOINT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { MemoryDumpActionRequestBody } from '../../../../../../common/api/endpoint/actions/response_actions/memory_dump';
import type { CustomScriptsRequestQueryParams } from '../../../../../../common/api/endpoint/custom_scripts/get_custom_scripts_route';
import type { ResponseActionRequestTag } from '../../constants';
import { ALLOWED_ACTION_REQUEST_TAGS } from '../../constants';
import { getUnExpiredActionsEsQuery } from '../../utils/fetch_space_ids_with_maybe_pending_actions';
import { catchAndWrapError } from '../../../../utils';
import {
  ENDPOINT_RESPONSE_ACTION_SENT_EVENT,
  ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT,
  ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT,
} from '../../../../../lib/telemetry/event_based/events';
import { NotFoundError } from '../../../../errors';
import { fetchActionRequestById } from '../../utils/fetch_action_request_by_id';
import { SimpleMemCache } from '../../../../lib/simple_mem_cache';
import {
  fetchActionResponses,
  fetchEndpointActionResponses,
} from '../../utils/fetch_action_responses';
import { createEsSearchIterable } from '../../../../utils/create_es_search_iterable';
import {
  ensureActionRequestsIndexIsConfigured,
  getActionCompletionInfo,
  getActionRequestExpiration,
  mapResponsesByActionId,
  mapToNormalizedActionRequest,
} from '../../utils';
import { isActionSupportedByAgentType } from '../../../../../../common/endpoint/service/response_actions/is_response_action_supported';
import type { EndpointAppContextService } from '../../../../endpoint_app_context_services';
import { APP_ID } from '../../../../../../common';
import type {
  ResponseActionAgentType,
  ResponseActionsApiCommandNames,
} from '../../../../../../common/endpoint/service/response_actions/constants';
import { RESPONSE_ACTIONS_SUPPORTED_INTEGRATION_TYPES } from '../../../../../../common/endpoint/service/response_actions/constants';
import { getActionDetailsById } from '../../action_details_by_id';
import { ResponseActionsClientError, ResponseActionsNotSupportedError } from '../errors';
import {
  ENDPOINT_ACTION_RESPONSES_INDEX,
  ENDPOINT_ACTIONS_INDEX,
} from '../../../../../../common/endpoint/constants';
import type {
  CommonResponseActionMethodOptions,
  GetFileDownloadMethodResponse,
  OmitUnsupportedAttributes,
  ProcessPendingActionsMethodOptions,
  ResponseActionsClient,
} from './types';
import type {
  ActionDetails,
  EndpointActionDataParameterTypes,
  EndpointActionResponseDataOutput,
  GetProcessesActionOutputContent,
  KillProcessActionOutputContent,
  LogsEndpointAction,
  LogsEndpointActionResponse,
  ResponseActionExecuteOutputContent,
  ResponseActionGetFileOutputContent,
  ResponseActionGetFileParameters,
  ResponseActionParametersWithProcessData,
  ResponseActionRunScriptOutputContent,
  ResponseActionRunScriptParameters,
  ResponseActionScanOutputContent,
  ResponseActionsExecuteParameters,
  ResponseActionScanParameters,
  ResponseActionUploadOutputContent,
  ResponseActionUploadParameters,
  ResponseActionCancelOutputContent,
  ResponseActionCancelParameters,
  SuspendProcessActionOutputContent,
  UploadedFileInfo,
  WithAllKeys,
  ResponseActionScriptsApiResponse,
  ResponseActionMemoryDumpParameters,
  ResponseActionMemoryDumpOutputContent,
} from '../../../../../../common/endpoint/types';
import type {
  ExecuteActionRequestBody,
  GetProcessesRequestBody,
  IsolationRouteRequestBody,
  KillProcessRequestBody,
  ResponseActionGetFileRequestBody,
  ResponseActionsRequestBody,
  RunScriptActionRequestBody,
  ScanActionRequestBody,
  SuspendProcessRequestBody,
  UnisolationRouteRequestBody,
  UploadActionApiRequestBody,
  CancelActionRequestBody,
} from '../../../../../../common/api/endpoint';
import { stringify } from '../../../../utils/stringify';
import { EMPTY_COMMENT } from '../../../../utils/translations';

const ELASTIC_RESPONSE_ACTION_MESSAGE = (
  username: string = 'system',
  command: ResponseActionsApiCommandNames,
  responseActionId: string
): string => {
  return i18n.translate('xpack.securitySolution.responseActions.comment.message', {
    values: { username, command, responseActionId },
    defaultMessage: `Action triggered from Elastic Security by user [{username}] for action [{command} (action id: {responseActionId})]`,
  });
};

const ENTERPRISE_LICENSE_REQUIRED_MSG = i18n.translate(
  'xpack.securitySolution.responseActionsList.error.licenseTooLow',
  {
    defaultMessage: 'At least Enterprise license is required to use Response Actions.',
  }
);

export const HOST_NOT_ENROLLED = i18n.translate(
  'xpack.securitySolution.responseActionsList.error.hostNotEnrolled',
  {
    defaultMessage: 'The host does not have Elastic Defend integration installed',
  }
);

export interface ResponseActionsClientOptions {
  endpointService: EndpointAppContextService;
  esClient: ElasticsearchClient;
  spaceId: string;
  casesClient?: CasesClient;
  /** Username that will be stored along with the action's ES documents */
  username: string;
  /**
   * Is the instance of the client being used for automated response actions.
   * When set to `true`, additional checks will be performed and the Endpoint response action
   * request will (almost) always be created, even if there certain errors occur along the way
   */
  isAutomated?: boolean;
}

export interface ResponseActionsClientUpdateCasesOptions {
  /** The Response Action that was taken */
  command: ResponseActionsApiCommandNames;
  /** the list of hosts that received the response action `command` */
  hosts: Array<{
    hostname: string;
    hostId: string;
  }>;
  caseIds?: string[];
  /** If defined, any case that the alert is included in will also receive an update */
  alertIds?: string[];
  /** Comment to include in the Case attachment */
  comment?: string;
  /** The id of the action that was taken */
  actionId: string;
}

export type ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
  TParameters extends EndpointActionDataParameterTypes = undefined,
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TMeta extends {} = {}
> = Omit<ResponseActionsRequestBody, 'parameters'> & {
  parameters?: TParameters;
} & Pick<CommonResponseActionMethodOptions, 'ruleName' | 'ruleId' | 'hosts' | 'error'> &
  Pick<LogsEndpointAction<TParameters, TOutputContent, TMeta>, 'meta'> & {
    command: ResponseActionsApiCommandNames;
    actionId?: string;
    tags?: ResponseActionRequestTag[];
  };

export type ResponseActionsClientWriteActionResponseToEndpointIndexOptions<
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TMeta extends {} = {}
> = {
  agentId: LogsEndpointActionResponse['agent']['id'];
  actionId: string;
} & Pick<LogsEndpointActionResponse<TOutputContent, TMeta>, 'error' | 'meta'> &
  Pick<LogsEndpointActionResponse<TOutputContent>['EndpointActions'], 'data'>;

export type ResponseActionsClientValidateRequestResponse =
  | {
      isValid: true;
      error: undefined;
    }
  | {
      isValid: false;
      error: ResponseActionsClientError;
    };

export interface FetchActionResponseEsDocsResponse<
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TMeta extends {} = {}
> {
  [agentId: string]: LogsEndpointActionResponse<TOutputContent, TMeta>;
}

export interface ResponseActionsClientPendingAction<
  TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
  TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
  TMeta extends {} = {}
> {
  action: LogsEndpointAction<TParameters, TOutputContent, TMeta>;
  pendingAgentIds: string[];
}

/**
 * Base class for a Response Actions client
 */
export abstract class ResponseActionsClientImpl implements ResponseActionsClient {
  protected readonly log: Logger;

  protected readonly cache = new SimpleMemCache();

  protected abstract readonly agentType: ResponseActionAgentType;

  constructor(protected readonly options: ResponseActionsClientOptions) {
    this.log = options.endpointService.createLogger(
      this.constructor.name ?? 'ResponseActionsClient'
    );
  }

  /**
   * Ensures that the Action Request Index is setup correctly (ex. has required mappings)
   * @internal
   */
  private async ensureActionRequestsIndexIsConfigured(): Promise<void> {
    this.log.debug(`checking index [${ENDPOINT_ACTIONS_INDEX}] is configured as expected`);

    const CACHE_KEY = 'ensureActionRequestsIndexIsConfigured';
    const cachedResult = this.cache.get<Promise<void>>(CACHE_KEY);

    if (cachedResult) {
      this.log.debug(`Checking has already been done - returned cached result`);
      return cachedResult;
    }

    const resultPromise = ensureActionRequestsIndexIsConfigured(this.options.endpointService);

    this.cache.set(CACHE_KEY, resultPromise);

    return resultPromise;
  }

  /**
   * Fetches information about the policies for each agent id that the response action is being sent to.
   * Must be implemented by each subclass, since "agentId" for 3rd party EDRs agent IDs will need to
   * to be mapped to elastic agent ids.
   *
   * @param agentIds
   * @protected
   */
  protected abstract fetchAgentPolicyInfo(
    /**
     * The agent IDs that the response action is being sent to.  For 3rd party EDRs, these will be
     * the IDs of the agent in the 3rd party system and NOT the Elastic Agent ID.
     * The `fetchFleetInfoForAgents()` method can be used in conjunction with this method retrieve info.
     * from Fleet once the Fleet Agent Ids have been calculated.
     */
    agentIds: string[]
  ): Promise<LogsEndpointAction['agent']['policy']>;

  /**
   * Fetches Fleet agent information for each of the Fleet agent ids provided on input.
   * @param agentIds
   * @protected
   */
  protected async fetchFleetInfoForAgents(
    /** Fleet Agent IDs */
    agentIds: string[]
  ): Promise<LogsEndpointAction['agent']['policy']> {
    const integrations = [...RESPONSE_ACTIONS_SUPPORTED_INTEGRATION_TYPES[this.agentType]];

    if (integrations.length === 0) {
      throw new ResponseActionsClientError(
        `No integration names defined for agent type [${this.agentType}]`
      );
    }

    const spaceId = this.options.spaceId;
    const fleetServices = this.options.endpointService.getInternalFleetServices(spaceId);
    const soClient = fleetServices.savedObjects.createInternalScopedSoClient({ spaceId });
    const agentPolicyIds = new Set<string>();
    const policyInfo: LogsEndpointAction['agent']['policy'] = [];

    // Get a list of Agent records so we can identify the Agent Policy ID
    const agents = await fleetServices.agent.getByIds(agentIds).catch(catchAndWrapError);

    this.log.debug(
      () => `Fleet agent records for agent IDs [${agentIds.join(' | ')}]:\n${stringify(agents, 2)}`
    );

    for (const agent of agents) {
      if (agent.policy_id) {
        agentPolicyIds.add(agent.policy_id);
      }
    }

    // Get a list of integration policies that are associated with the agent policies identified
    const kuery = `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: (${integrations.join(
      ' OR '
    )}) AND ${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.policy_ids: (${Array.from(agentPolicyIds.values())
      .map((id) => `"${id}"`)
      .join(' OR ')})`;

    this.log.debug(
      () => `Looking for integration policies in fleet using filter (kuery):\n${kuery}`
    );

    const integrationPolicies = await fleetServices.packagePolicy
      .list(soClient, { perPage: 10_000, kuery })
      .catch(catchAndWrapError);

    this.log.debug(() => `Integration policies found ${integrationPolicies.items.length}`);

    const agentPolicyToIntegrationPolicyMap: Record<string, PackagePolicy> = {};

    for (const integrationPolicy of integrationPolicies.items) {
      for (const agentPolicyId of integrationPolicy.policy_ids) {
        agentPolicyToIntegrationPolicyMap[agentPolicyId] = integrationPolicy;
      }
    }

    for (const agent of agents) {
      if (agent.policy_id) {
        policyInfo.push({
          agentId: agent.id,
          elasticAgentId: agent.id,
          agentPolicyId: agent.policy_id,
          integrationPolicyId: agentPolicyToIntegrationPolicyMap[agent.policy_id].id,
        });
      }
    }

    return policyInfo;
  }

  /**
   * Update cases with information about the hosts that received a response action.
   *
   * **NOTE:** Failures during update will not cause this operation to fail - it will only log the errors
   * @protected
   */
  protected async updateCases({
    command,
    hosts,
    caseIds = [],
    alertIds = [],
    comment = '',
    actionId,
  }: ResponseActionsClientUpdateCasesOptions): Promise<void> {
    if (caseIds.length === 0 && alertIds.length === 0) {
      this.log.debug(`No updates to Cases needed. 'caseIds' and 'alertIds' are empty`);
      return;
    }

    if (hosts.length === 0) {
      this.log.debug(`No updates to Cases needed. 'hosts' is empty`);
      return;
    }

    const casesClient = this.options.casesClient;

    if (!casesClient) {
      this.log.debug(`No CasesClient available. Skipping updates to Cases!`);
      return;
    }

    const casesFromAlertIds = await Promise.all(
      alertIds.map((alertID) => {
        return casesClient.cases
          .getCasesByAlertID({ alertID, options: { owner: APP_ID } })
          .then((casesFound) => {
            return casesFound.map((caseInfo) => caseInfo.id);
          })
          .catch((err) => {
            this.log.warn(
              `Attempt to get cases for alertID [${alertID}][owner: ${APP_ID}] failed with: ${err.message}`
            );

            // We don't fail everything here. Just log it and keep going
            return [] as string[];
          });
      })
    ).then((results) => {
      return results.flat();
    });

    const allCases = [...new Set([...caseIds, ...casesFromAlertIds])];

    if (allCases.length === 0) {
      this.log.debug(`No updates to Cases needed. Alert IDs are not tied to Cases`);
      return;
    }

    this.log.debug(() => `Updating cases:\n${stringify(allCases)}`);

    const targets = hosts.map(({ hostId: endpointId, hostname }) => ({
      endpointId,
      hostname,
      agentType: this.agentType,
    }));

    const attachments: BulkCreateAttachmentsRequestV2 = [
      {
        type: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
        attachmentId: actionId,
        data: { content: comment || EMPTY_COMMENT },
        metadata: {
          targets,
          command,
        },
        owner: APP_ID,
      },
    ];

    const casesUpdateResponse = await Promise.all(
      allCases.map(async (caseId) => {
        try {
          return await casesClient.attachments.bulkCreate({
            caseId,
            attachments,
          });
        } catch (err) {
          this.log.warn(
            `Attempt to update case ID [${caseId}] failed: ${err.message}\n${stringify(err)}`
          );
          return null;
        }
      })
    );

    this.log.debug(() => `Update to cases done:\n${stringify(casesUpdateResponse)}`);
  }

  protected getMethodOptions<
    T extends CommonResponseActionMethodOptions = CommonResponseActionMethodOptions
  >(options: Partial<T> = {}): WithAllKeys<CommonResponseActionMethodOptions> {
    return {
      hosts: undefined,
      ruleId: undefined,
      ruleName: undefined,
      error: undefined,
      ...options,
    };
  }

  /**
   * Returns the action details for a given response action id
   * @param actionId
   * @param bypassSpaceValidation
   * @protected
   */
  protected async fetchActionDetails<T extends ActionDetails = ActionDetails>(
    actionId: string,
    /**
     * if `true`, then no space validations will be done on the action retrieved. Default is `false`.
     * USE IT CAREFULLY!
     */
    bypassSpaceValidation: boolean = false
  ): Promise<T> {
    return getActionDetailsById(this.options.endpointService, this.options.spaceId, actionId, {
      bypassSpaceValidation,
    });
  }

  /**
   * Fetches the Action request ES document for a given action id
   * @param actionId
   * @protected
   */
  protected async fetchActionRequestEsDoc<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(actionId: string): Promise<LogsEndpointAction<TParameters, TOutputContent, TMeta>> {
    const cacheKey = `fetchActionRequestEsDoc-${actionId}`;
    const cachedResponse =
      this.cache.get<LogsEndpointAction<TParameters, TOutputContent, TMeta>>(cacheKey);

    if (cachedResponse) {
      this.log.debug(
        `fetchActionRequestEsDoc(): returning cached response for action id ${actionId}`
      );
      return cachedResponse;
    }

    return fetchActionRequestById<TParameters, TOutputContent, TMeta>(
      this.options.endpointService,
      this.options.spaceId,
      actionId
    ).then((actionRequestDoc) => {
      this.cache.set(cacheKey, actionRequestDoc);
      return actionRequestDoc;
    });
  }

  /**
   * Fetches the Response Action ES response documents for a given action id
   * @param actionId
   * @param agentIds
   * @protected
   */
  protected async fetchActionResponseEsDocs<
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(
    actionId: string,
    /** Specific Agent IDs to retrieve. default is to retrieve all */
    agentIds?: string[]
  ): Promise<FetchActionResponseEsDocsResponse<TOutputContent, TMeta>> {
    const responseDocs = await fetchEndpointActionResponses<TOutputContent, TMeta>({
      esClient: this.options.esClient,
      actionIds: [actionId],
      agentIds,
    });

    return responseDocs.reduce<FetchActionResponseEsDocsResponse<TOutputContent, TMeta>>(
      (acc, response) => {
        const agentId = Array.isArray(response.agent.id) ? response.agent.id[0] : response.agent.id;

        acc[agentId] = response;

        return acc;
      },
      {}
    );
  }

  /**
   * Provides validations against a response action request and returns the result.
   * Checks made should be generic to all response actions and not specific to any one action.
   *
   * @param actionRequest
   * @protected
   */
  protected async validateRequest(
    actionRequest: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<any, any, any>
  ): Promise<ResponseActionsClientValidateRequestResponse> {
    // Validation for Automated Response actions
    if (this.options.isAutomated) {
      // Automated response actions is an Enterprise level feature
      if (!this.options.endpointService.getLicenseService().isEnterprise()) {
        return {
          isValid: false,
          error: new ResponseActionsClientError(ENTERPRISE_LICENSE_REQUIRED_MSG, 403),
        };
      }
    }

    if (actionRequest.endpoint_ids.length === 0) {
      return {
        isValid: false,
        error: new ResponseActionsClientError(HOST_NOT_ENROLLED, 400),
      };
    }

    if (
      !isActionSupportedByAgentType(
        this.agentType,
        actionRequest.command,
        this.options.isAutomated ? 'automated' : 'manual'
      )
    ) {
      return {
        isValid: false,
        error: new ResponseActionsNotSupportedError(actionRequest.command),
      };
    }

    // if space awareness is enabled, then validate that agents are valid for active space.
    // We do this validation by just calling `fetchAgentPolicyInfo()` which will throw if agents
    // are not found in active space
    try {
      await this.fetchAgentPolicyInfo(actionRequest.endpoint_ids);
    } catch (err) {
      return { isValid: false, error: err };
    }

    return { isValid: true, error: undefined };
  }

  /**
   * Creates a Response Action request document in the Endpoint index (`.logs-endpoint.actions-default`)
   * @protected
   */
  protected async writeActionRequestToEndpointIndex<
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
    let errorMsg = String(actionRequest.error ?? '').trim();

    if (!errorMsg) {
      const validation = await this.validateRequest(actionRequest);

      if (!validation.isValid) {
        if (this.options.isAutomated) {
          errorMsg = validation.error.message;
        } else {
          throw validation.error;
        }
      }
    }

    this.notifyUsage(actionRequest.command);

    // It's possible with Automated Response actions that we could reach this point with
    // no endpoint IDs in the action request - case where they are no longer enrolled.
    // In these cases, we don't attempt to build the agent policy info and instead add
    // the `integration deleted` tag to the action request, which means these are only
    // visible in the space configured (via ref. data) show orphaned actions
    const agentPolicyInfo: LogsEndpointAction['agent']['policy'] =
      actionRequest.endpoint_ids.length > 0
        ? await this.fetchAgentPolicyInfo(actionRequest.endpoint_ids)
        : [];
    const tags: LogsEndpointAction['tags'] = actionRequest.tags ?? [];
    const actionId = actionRequest.actionId || uuidv4();

    if (agentPolicyInfo.length === 0) {
      tags.push(ALLOWED_ACTION_REQUEST_TAGS.integrationPolicyDeleted);
    }

    const doc: LogsEndpointAction<TParameters, TOutputContent, TMeta> = {
      '@timestamp': new Date().toISOString(),
      originSpaceId: this.options.spaceId,
      tags,
      agent: {
        id: actionRequest.endpoint_ids,
        policy: agentPolicyInfo,
      },
      EndpointActions: {
        action_id: actionId,
        expiration: getActionRequestExpiration(),
        type: 'INPUT_ACTION',
        input_type: this.agentType,
        data: {
          command: actionRequest.command,
          comment: actionRequest.comment ?? undefined,
          ...(actionRequest.alert_ids ? { alert_id: actionRequest.alert_ids } : {}),
          ...(actionRequest.hosts ? { hosts: actionRequest.hosts } : {}),
          parameters: actionRequest.parameters as TParameters,
        },
      },
      user: {
        id: this.options.username,
      },
      meta: actionRequest.meta,
      ...(errorMsg ? { error: { message: errorMsg } } : {}),
      ...(actionRequest.ruleId && actionRequest.ruleName
        ? { rule: { id: actionRequest.ruleId, name: actionRequest.ruleName } }
        : {}),
    };

    await this.ensureActionRequestsIndexIsConfigured();

    this.log.debug(() => `creating action request document:\n${stringify(doc)}`);

    try {
      const logsEndpointActionsResult = await this.options.esClient.index<LogsEndpointAction>(
        {
          index: ENDPOINT_ACTIONS_INDEX,
          document: doc,
          refresh: 'wait_for',
        },
        { meta: true }
      );

      if (logsEndpointActionsResult.statusCode !== 201) {
        throw new ResponseActionsClientError(
          `Failed to create (index) action request document. StatusCode: [${logsEndpointActionsResult.statusCode}] Result: ${logsEndpointActionsResult.body.result}`,
          500,
          logsEndpointActionsResult
        );
      }

      this.sendActionCreationTelemetry(doc);

      return doc;
    } catch (err) {
      this.sendActionCreationErrorTelemetry(actionRequest.command, err);
      this.log.debug(
        () => `attempt to index document into ${ENDPOINT_ACTIONS_INDEX} failed:\n${stringify(err)}`
      );

      if (!(err instanceof ResponseActionsClientError)) {
        throw new ResponseActionsClientError(
          `Failed to create action request document: ${err.message}`,
          500,
          err
        );
      }

      throw err;
    }
  }

  protected buildActionResponseEsDoc<
    // Default type purposely set to empty object in order to ensure proper types are used when calling the method
    TOutputContent extends EndpointActionResponseDataOutput = Record<string, never>,
    TMeta extends {} = {}
  >({
    actionId,
    error,
    agentId,
    data,
    meta,
  }: ResponseActionsClientWriteActionResponseToEndpointIndexOptions<
    TOutputContent,
    TMeta
  >): LogsEndpointActionResponse<TOutputContent, TMeta> {
    const timestamp = new Date().toISOString();
    const doc: LogsEndpointActionResponse<TOutputContent, TMeta> = {
      '@timestamp': timestamp,
      agent: {
        id: agentId,
      },
      EndpointActions: {
        action_id: actionId,
        input_type: this.agentType,
        started_at: timestamp,
        completed_at: timestamp,
        data,
      },
      error,
      meta,
    };

    return doc;
  }

  /**
   * Writes a Response Action response document to the Endpoint index
   * @param options
   * @protected
   */
  protected async writeActionResponseToEndpointIndex<
    // Default type purposely set to empty object in order to ensure proper types are used when calling the method
    TOutputContent extends EndpointActionResponseDataOutput = Record<string, never>
  >(
    options: ResponseActionsClientWriteActionResponseToEndpointIndexOptions<TOutputContent>
  ): Promise<LogsEndpointActionResponse<TOutputContent>> {
    // FIXME:PT need to ensure we use a index below that has the proper `namespace` when agent type is Endpoint
    //        Background: Endpoint responses require that the document be written to an index that has the
    //        correct `namespace` as defined by the Integration/Agent policy and that logic is not currently implemented.

    const doc = this.buildActionResponseEsDoc(options);

    this.log.debug(() => `Writing response action response:\n${stringify(doc)}`);

    await this.options.esClient
      .index<LogsEndpointActionResponse<TOutputContent>>({
        index: ENDPOINT_ACTION_RESPONSES_INDEX,
        document: doc,
        refresh: 'wait_for',
      })
      .catch((err) => {
        throw new ResponseActionsClientError(
          `Failed to create action response document: ${err.message}`,
          500,
          err
        );
      });

    return doc;
  }

  protected notifyUsage(responseAction: ResponseActionsApiCommandNames): void {
    const usageService = this.options.endpointService.getFeatureUsageService();
    const featureKey = usageService.getResponseActionFeatureKey(responseAction);

    if (!featureKey) {
      this.log.warn(
        `Response action [${responseAction}] does not have a usage feature key defined!`
      );
      return;
    }

    usageService.notifyUsage(featureKey);
  }

  /**
   * Builds a comment for use in response action requests sent to external EDR systems
   * @protected
   */
  protected buildExternalComment(
    actionRequestIndexOptions: ResponseActionsClientWriteActionRequestToEndpointIndexOptions<
      any,
      any,
      any
    >
  ): string {
    const { actionId = uuidv4(), comment, command } = actionRequestIndexOptions;

    // If the action request index options does not yet have an actionId assigned to it, then do it now.
    // Need to ensure we have an action id for cross-reference.
    if (!actionRequestIndexOptions.actionId) {
      actionRequestIndexOptions.actionId = actionId;
    }

    return (
      ELASTIC_RESPONSE_ACTION_MESSAGE(this.options.username, command, actionId) +
      (comment ? `: ${comment}` : '')
    );
  }

  protected async ensureValidActionId(actionId: string): Promise<void> {
    const actionRequest = await this.fetchActionRequestEsDoc(actionId);

    if (actionRequest.EndpointActions.input_type !== this.agentType) {
      throw new NotFoundError(
        `Action id [${actionId}] with agent type of [${this.agentType}] not found`
      );
    }
  }

  protected fetchAllPendingActions<
    TParameters extends EndpointActionDataParameterTypes = EndpointActionDataParameterTypes,
    TOutputContent extends EndpointActionResponseDataOutput = EndpointActionResponseDataOutput,
    TMeta extends {} = {}
  >(): AsyncIterable<
    Array<ResponseActionsClientPendingAction<TParameters, TOutputContent, TMeta>>
  > {
    const esClient = this.options.esClient;
    const query: QueryDslQueryContainer = getUnExpiredActionsEsQuery(this.agentType);

    return createEsSearchIterable<
      LogsEndpointAction,
      Array<ResponseActionsClientPendingAction<TParameters, TOutputContent, TMeta>>
    >({
      esClient,
      searchRequest: {
        index: ENDPOINT_ACTIONS_INDEX,
        sort: '@timestamp',
        query,
      },
      resultsMapper: async (
        data
      ): Promise<Array<ResponseActionsClientPendingAction<TParameters, TOutputContent, TMeta>>> => {
        const actionRequests = data.hits.hits.map((hit) => hit._source as LogsEndpointAction);
        const pendingRequests: Array<
          ResponseActionsClientPendingAction<TParameters, TOutputContent, TMeta>
        > = [];

        if (actionRequests.length > 0) {
          const actionResults = await fetchActionResponses({
            esClient,
            actionIds: actionRequests.map((action) => action.EndpointActions.action_id),
          });
          const responsesByActionId = mapResponsesByActionId(actionResults);

          // Determine what actions are still pending
          for (const actionRequest of actionRequests) {
            const actionCompleteInfo = getActionCompletionInfo(
              mapToNormalizedActionRequest(actionRequest),
              responsesByActionId[actionRequest.EndpointActions.action_id] ?? {
                endpointResponses: [],
                fleetResponses: [],
              }
            );

            // If not completed, add action to the pending list and calculate the list of agent IDs
            // whose response we are still waiting on
            if (!actionCompleteInfo.isCompleted) {
              const pendingActionData = {
                action: actionRequest,
                pendingAgentIds: [],
              } as unknown as ResponseActionsClientPendingAction<
                TParameters,
                TOutputContent,
                TMeta
              >;

              for (const [agentId, agentIdState] of Object.entries(actionCompleteInfo.agentState)) {
                if (!agentIdState.isCompleted) {
                  pendingActionData.pendingAgentIds.push(agentId);
                }
              }

              pendingRequests.push(pendingActionData);
            }
          }
        }

        return pendingRequests;
      },
    });
  }

  protected sendActionCreationTelemetry(actionRequest: LogsEndpointAction): void {
    this.options.endpointService
      .getTelemetryService()
      .reportEvent(ENDPOINT_RESPONSE_ACTION_SENT_EVENT.eventType, {
        responseActions: {
          actionId: actionRequest.EndpointActions.action_id,
          agentType: this.agentType,
          command: actionRequest.EndpointActions.data.command,
          isAutomated: this.options.isAutomated ?? false,
        },
      });
  }

  protected sendActionCreationErrorTelemetry(
    command: ResponseActionsApiCommandNames,
    error: Error
  ): void {
    this.options.endpointService
      .getTelemetryService()
      .reportEvent(ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT.eventType, {
        responseActions: {
          agentType: this.agentType,
          command,
          error: error.message,
        },
      });
  }

  protected sendActionResponseTelemetry(responseList: LogsEndpointActionResponse[]): void {
    for (const response of responseList) {
      this.options.endpointService
        .getTelemetryService()
        .reportEvent(ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT.eventType, {
          responseActions: {
            actionId: response.EndpointActions.action_id,
            agentType: this.agentType,
            actionStatus: response.EndpointActions.data?.output?.content.canceled_by
              ? 'canceled'
              : response.error
              ? 'failed'
              : 'successful',
            command: response.EndpointActions.data.command,
          },
        });
    }
  }

  public async isolate(
    actionRequest: IsolationRouteRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails> {
    throw new ResponseActionsNotSupportedError('isolate');
  }

  public async release(
    actionRequest: UnisolationRouteRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails> {
    throw new ResponseActionsNotSupportedError('unisolate');
  }

  public async killProcess(
    actionRequest: KillProcessRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<KillProcessActionOutputContent, ResponseActionParametersWithProcessData>
  > {
    throw new ResponseActionsNotSupportedError('kill-process');
  }

  public async suspendProcess(
    actionRequest: SuspendProcessRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<SuspendProcessActionOutputContent, ResponseActionParametersWithProcessData>
  > {
    throw new ResponseActionsNotSupportedError('suspend-process');
  }

  public async runningProcesses(
    actionRequest: GetProcessesRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<GetProcessesActionOutputContent>> {
    throw new ResponseActionsNotSupportedError('running-processes');
  }

  public async getFile(
    actionRequest: ResponseActionGetFileRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionGetFileOutputContent, ResponseActionGetFileParameters>> {
    throw new ResponseActionsNotSupportedError('get-file');
  }

  public async execute(
    actionRequest: ExecuteActionRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionExecuteOutputContent, ResponseActionsExecuteParameters>> {
    throw new ResponseActionsNotSupportedError('execute');
  }

  public async upload(
    actionRequest: UploadActionApiRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters>> {
    throw new ResponseActionsNotSupportedError('upload');
  }

  public async scan(
    actionRequest: ScanActionRequestBody,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionScanOutputContent, ResponseActionScanParameters>> {
    throw new ResponseActionsNotSupportedError('scan');
  }

  public async runscript(
    actionRequest: OmitUnsupportedAttributes<RunScriptActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<ResponseActionRunScriptOutputContent, ResponseActionRunScriptParameters>
  > {
    throw new ResponseActionsNotSupportedError('runscript');
  }

  public async cancel(
    actionRequest: OmitUnsupportedAttributes<CancelActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<ActionDetails<ResponseActionCancelOutputContent, ResponseActionCancelParameters>> {
    throw new ResponseActionsNotSupportedError('cancel');
  }

  public async memoryDump(
    actionRequest: OmitUnsupportedAttributes<MemoryDumpActionRequestBody>,
    options?: CommonResponseActionMethodOptions
  ): Promise<
    ActionDetails<ResponseActionMemoryDumpOutputContent, ResponseActionMemoryDumpParameters>
  > {
    throw new ResponseActionsNotSupportedError('memory-dump');
  }

  public async getCustomScripts(
    options?: Omit<CustomScriptsRequestQueryParams, 'agentType'>
  ): Promise<ResponseActionScriptsApiResponse> {
    throw new ResponseActionsNotSupportedError('getCustomScripts');
  }

  public async processPendingActions(_: ProcessPendingActionsMethodOptions): Promise<void> {
    this.log.debug(`#processPendingActions() method is not implemented for ${this.agentType}!`);
  }

  public async getFileDownload(
    actionId: string,
    fileId: string
  ): Promise<GetFileDownloadMethodResponse> {
    throw new ResponseActionsNotSupportedError('getFileDownload');
  }

  public async getFileInfo(actionId: string, fileId: string): Promise<UploadedFileInfo> {
    throw new ResponseActionsNotSupportedError('getFileInfo');
  }
}
