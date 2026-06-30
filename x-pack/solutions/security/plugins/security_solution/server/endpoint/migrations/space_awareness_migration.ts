/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable require-atomic-updates */

import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { UpdateExceptionListItemOptions } from '@kbn/lists-plugin/server';
import pMap from 'p-map';
import { type Logger } from '@kbn/core/server';
import type {
  BulkRequest,
  SearchRequest,
  SearchTotalHits,
} from '@elastic/elasticsearch/lib/api/types';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import { clone, pick } from 'lodash';
import { ALLOWED_ACTION_REQUEST_TAGS } from '../services/actions/constants';
import { GLOBAL_ARTIFACT_TAG } from '../../../common/endpoint/service/artifacts';
import { ensureActionRequestsIndexIsConfigured } from '../services';
import { CROWDSTRIKE_HOST_INDEX_PATTERN } from '../../../common/endpoint/service/response_actions/crowdstrike';
import { SENTINEL_ONE_AGENT_INDEX_PATTERN } from '../../../common/endpoint/service/response_actions/sentinel_one';
import { MICROSOFT_DEFENDER_ENDPOINT_LOG_INDEX_PATTERN } from '../../../common/endpoint/service/response_actions/microsoft_defender';
import type { ResponseActionAgentType } from '../../../common/endpoint/service/response_actions/constants';
import { RESPONSE_ACTIONS_SUPPORTED_INTEGRATION_TYPES } from '../../../common/endpoint/service/response_actions/constants';
import { EndpointError } from '../../../common/endpoint/errors';
import type {
  LogsEndpointAction,
  MicrosoftDefenderEndpointLogEsDoc,
} from '../../../common/endpoint/types';
import { createEsSearchIterable } from '../utils/create_es_search_iterable';
import { stringify } from '../utils/stringify';
import type { MigrationMetadata, ReferenceDataClientInterface } from '../lib/reference_data';
import { REF_DATA_KEYS } from '../lib/reference_data';
import {
  buildSpaceOwnerIdTag,
  hasArtifactOwnerSpaceId,
  hasGlobalOrPerPolicyTag,
} from '../../../common/endpoint/service/artifacts/utils';
import { catchAndWrapError } from '../utils';
import { QueueProcessor } from '../utils/queue_processor';
import type { EndpointAppContextService } from '../endpoint_app_context_services';
import type { ReferenceDataSavedObject } from '../lib/reference_data/types';
import { ENDPOINT_ACTIONS_INDEX } from '../../../common/endpoint/constants';

const LOGGER_KEY = 'migrateEndpointDataToSupportSpaces';
export const ARTIFACTS_MIGRATION_REF_DATA_ID = REF_DATA_KEYS.spaceAwarenessArtifactMigration;
export const RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID =
  REF_DATA_KEYS.spaceAwarenessResponseActionsMigration;
export const NOT_FOUND_VALUE = 'MIGRATION:NOT-FOUND';

export type MigrationStateReferenceData = ReferenceDataSavedObject<MigrationMetadata>;

type PolicyPartialUpdate = Pick<LogsEndpointAction, 'originSpaceId'> & {
  tags?: LogsEndpointAction['tags'];
  agent: Pick<LogsEndpointAction['agent'], 'policy'>;
};

export const migrateEndpointDataToSupportSpaces = async (
  endpointService: EndpointAppContextService
): Promise<void> => {
  await Promise.all([
    migrateArtifactsToSpaceAware(endpointService),
    migrateResponseActionsToSpaceAware(endpointService),
  ]);
};

const getMigrationState = async (
  refDataClient: ReferenceDataClientInterface,
  id: typeof ARTIFACTS_MIGRATION_REF_DATA_ID | typeof RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID
): Promise<MigrationStateReferenceData> => {
  return refDataClient.get<MigrationStateReferenceData['metadata']>(id);
};

const updateMigrationState = async (
  refDataClient: ReferenceDataClientInterface,
  id: typeof ARTIFACTS_MIGRATION_REF_DATA_ID | typeof RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID,
  update: MigrationStateReferenceData
): Promise<MigrationStateReferenceData> => {
  return refDataClient.update<MigrationStateReferenceData['metadata']>(id, update);
};

const migrateArtifactsToSpaceAware = async (
  endpointService: EndpointAppContextService
): Promise<void> => {
  const logger = endpointService.createLogger(LOGGER_KEY, 'artifacts');
  const refDataClient = endpointService.getReferenceDataClient();
  const migrationState = await getMigrationState(refDataClient, ARTIFACTS_MIGRATION_REF_DATA_ID);

  // If migration has already been run and the version was 2 or higher -or- the status is pending (already running),
  // then we don't need to run it again
  if (
    (migrationState.metadata.status === 'complete' &&
      (migrationState.metadata.version ?? 0) >= 2) ||
    migrationState.metadata.status === 'pending'
  ) {
    logger.debug(
      `Migration (v2) for endpoint artifacts in support of spaces has a status of [${migrationState.metadata.status}], version [${migrationState.metadata.version}]. Nothing to do.`
    );
    return;
  }

  logger.debug(`starting migration (v2) of endpoint artifacts in support of spaces`);

  // If there are statuses about a prior run, then store a clone of it in the migration object for reference
  const priorRunData =
    migrationState.metadata.status === 'complete' ? clone(migrationState.metadata) : undefined;

  // Migration version history:
  // V1: original migration of artifacts with release 9.1.0
  // v2: fixes for migration issue: https://github.com/elastic/kibana/issues/238711
  migrationState.metadata.version = 2;
  migrationState.metadata.status = 'pending';
  migrationState.metadata.started = new Date().toISOString();
  migrationState.metadata.finished = '';
  migrationState.metadata.data = undefined;

  await updateMigrationState(refDataClient, ARTIFACTS_MIGRATION_REF_DATA_ID, migrationState);

  const exceptionsClient = endpointService.getExceptionListsClient();
  const listIds: string[] = Object.values(ENDPOINT_ARTIFACT_LISTS).map(({ id }) => id);

  logger.debug(`artifact list ids to process: ${listIds.join(', ')}`);

  const migrationStats = {
    totalItems: 0,
    itemsNeedingUpdates: 0,
    successUpdates: 0,
    failedUpdates: 0,
    artifacts: listIds.reduce((acc, listId) => {
      acc[listId] = {
        success: 0,
        failed: 0,
        errors: [],
      };

      return acc;
    }, {} as Record<string, { success: number; failed: number; errors: string[] }>),
    priorRuns: [] as Array<typeof migrationState.metadata>,
  };

  migrationState.metadata.data = migrationStats;

  if (priorRunData) {
    migrationStats.priorRuns.push(
      ...((priorRunData.data as typeof migrationStats)?.priorRuns ?? [])
    );

    migrationStats.priorRuns.push({
      ...(pick(priorRunData, [
        'status',
        'started',
        'finished',
        'version',
      ]) as typeof migrationState.metadata),
      data: pick(priorRunData.data as typeof migrationStats, [
        'totalItems',
        'itemsNeedingUpdates',
        'successUpdates',
        'failedUpdates',
        'artifacts',
      ]),
    });
  }

  const updateProcessor = new QueueProcessor<UpdateExceptionListItemOptions & { listId: string }>({
    batchSize: 50,
    batchHandler: async ({ data: artifactUpdates }) => {
      migrationStats.itemsNeedingUpdates += artifactUpdates.length;

      await pMap(
        artifactUpdates,
        async ({ listId, ...artifactUpdate }) => {
          try {
            const updatedArtifact = await exceptionsClient.updateExceptionListItem(artifactUpdate);

            if (updatedArtifact) {
              migrationStats.successUpdates++;
              migrationStats.artifacts[listId].success++;
            }
          } catch (err) {
            migrationStats.failedUpdates++;
            migrationStats.artifacts[listId].failed++;
            migrationStats.artifacts[listId].errors.push(
              `Update to [${listId}] item ID [${artifactUpdate.itemId}] failed with: ${err.message}`
            );
          }
        },
        { stopOnError: false, concurrency: 10 }
      );

      await updateMigrationState(refDataClient, ARTIFACTS_MIGRATION_REF_DATA_ID, migrationState);
    },
  });

  await exceptionsClient
    .findExceptionListItemsPointInTimeFinder({
      listId: listIds,
      namespaceType: listIds.map(() => 'agnostic'),
      filter: listIds.map(
        // Find all artifacts that do NOT have a space owner id tag
        () => `NOT exception-list-agnostic.attributes.tags:(ownerSpaceId*)`
      ),
      perPage: 1_000,
      sortField: undefined,
      sortOrder: undefined,
      maxSize: undefined,
      executeFunctionOnStream: ({ page, total, data }) => {
        logger.debug(
          `Checking page [${page}] with [${data.length}] items out of a total of [${total}] artifact entries need updates`
        );

        if (migrationStats.totalItems < total) {
          migrationStats.totalItems = total;
        }

        for (const artifact of data) {
          if (!hasArtifactOwnerSpaceId(artifact)) {
            const artifactUpdate: UpdateExceptionListItemOptions & { listId: string } = {
              _version: undefined,
              comments: artifact.comments,
              description: artifact.description,
              entries: artifact.entries,
              expireTime: artifact.expire_time,
              id: artifact.id,
              itemId: artifact.item_id,
              listId: artifact.list_id,
              meta: artifact.meta,
              name: artifact.name,
              namespaceType: artifact.namespace_type,
              osTypes: artifact.os_types,
              type: artifact.type,
              tags: [...(artifact.tags ?? []), buildSpaceOwnerIdTag(DEFAULT_SPACE_ID)],
            };

            // Ensure that Endpoint Exceptions all have the `global` tag if no assignment tag is currently assigned to the artifact
            if (
              artifact.list_id === ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id &&
              !hasGlobalOrPerPolicyTag(artifact)
            ) {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              artifactUpdate.tags!.push(GLOBAL_ARTIFACT_TAG);
            }

            updateProcessor.addToQueue(artifactUpdate);
          }
        }
      },
    })
    .catch(catchAndWrapError);

  await updateProcessor.complete();

  migrationState.metadata.status = 'complete';
  migrationState.metadata.finished = new Date().toISOString();
  await updateMigrationState(refDataClient, ARTIFACTS_MIGRATION_REF_DATA_ID, migrationState);

  logger.debug(
    `migration of endpoint artifacts in support of spaces done.\n${JSON.stringify(
      migrationStats,
      null,
      2
    )}`
  );
};

const migrateResponseActionsToSpaceAware = async (
  endpointService: EndpointAppContextService
): Promise<void> => {
  const logger = endpointService.createLogger(LOGGER_KEY, 'responseActions');
  const refDataClient = endpointService.getReferenceDataClient();
  const migrationState = await getMigrationState(
    refDataClient,
    RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID
  );

  if (migrationState.metadata.status !== 'not-started') {
    logger.debug(
      `Migration for endpoint response actions in support of spaces has a status of [${migrationState.metadata.status}]. Nothing to do.`
    );
    return;
  }

  logger.debug(`starting migration of endpoint response actions in support of spaces`);

  const migrationStats = {
    totalItems: 0,
    itemsNeedingUpdates: 0,
    successUpdates: 0,
    failedUpdates: 0,
    warnings: [] as string[],
    errors: [] as string[],
  };

  migrationState.metadata.status = 'pending';
  migrationState.metadata.started = new Date().toISOString();
  migrationState.metadata.data = migrationStats;
  await updateMigrationState(refDataClient, RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID, migrationState);

  const indexInfo = await ensureResponseActionsIndexHasRequiredMappings(endpointService);

  if (indexInfo.error) {
    migrationStats.errors.push(indexInfo.error);
  }

  if (!indexInfo.successful) {
    migrationState.metadata.status = 'complete';
    migrationState.metadata.finished = new Date().toISOString();
    await updateMigrationState(
      refDataClient,
      RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID,
      migrationState
    );

    return;
  }

  if (!indexInfo.indexExists) {
    const exitMessage = `Response actions index [${ENDPOINT_ACTIONS_INDEX}] does not exist. Nothing to migrate`;

    logger.debug(exitMessage);
    migrationState.metadata.status = 'complete';
    migrationState.metadata.finished = new Date().toISOString();
    migrationStats.warnings.push(exitMessage);
    await updateMigrationState(
      refDataClient,
      RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID,
      migrationState
    );

    return;
  }

  const policyInfoBuilder = new AgentPolicyInfoBuilder(endpointService, logger);
  const esClient = endpointService.getInternalEsClient();
  const updateProcessor = new QueueProcessor<{
    index: string;
    docId: string;
    actionId: string;
    update: PolicyPartialUpdate;
  }>({
    batchSize: 50,
    logger,
    batchHandler: async ({ data: actionUpdates }) => {
      migrationStats.itemsNeedingUpdates += actionUpdates.length;
      const docIdToResponseActionIdMap: Record<string, string> = {};
      const bulkOperations: Required<BulkRequest>['operations'] = [];

      for (const actionUpdateInfo of actionUpdates) {
        docIdToResponseActionIdMap[actionUpdateInfo.docId] = actionUpdateInfo.actionId;

        bulkOperations.push(
          { update: { _index: actionUpdateInfo.index, _id: actionUpdateInfo.docId } },
          { doc: actionUpdateInfo.update }
        );
      }

      logger.debug(`Calling esClient.bulk() with [${actionUpdates.length}] updates`);

      try {
        const bulkUpdateResponse = await esClient.bulk({ operations: bulkOperations });

        if (!bulkUpdateResponse.errors) {
          migrationStats.successUpdates += actionUpdates.length;
        } else {
          for (const operationResult of bulkUpdateResponse.items) {
            const updateResponse = operationResult.update;

            if (updateResponse?.error) {
              migrationStats.failedUpdates++;
              migrationStats.errors.push(
                `Update to response action [${
                  docIdToResponseActionIdMap[updateResponse._id ?? '']
                }] _id [${updateResponse._id}] failed: ${updateResponse.error.reason}`
              );
            } else {
              migrationStats.successUpdates++;
            }
          }
        }
      } catch (err) {
        logger.error(`ES Bulk update failed with: ${stringify(err)}`);

        migrationStats.failedUpdates += actionUpdates.length;

        migrationStats.errors.push(
          `Bulk update of action ids [${Object.values(docIdToResponseActionIdMap).join(
            ', '
          )}] failed with: ${err.message}`
        );
      }

      // Write stats so we can see intermediate stats if required
      await updateMigrationState(
        refDataClient,
        RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID,
        migrationState
      );
    },
  });

  const responseActionsFetcher = createEsSearchIterable<LogsEndpointAction>({
    esClient,
    searchRequest: {
      index: ENDPOINT_ACTIONS_INDEX,
      sort: '@timestamp',
      size: 50,
      query: {
        bool: { must_not: { exists: { field: 'originSpaceId' } } },
      },
    },
  });

  const updateBuilderPromises: Array<Promise<unknown>> = [];

  for await (const actionRequestSearchResults of responseActionsFetcher) {
    const actionRequests = actionRequestSearchResults.hits.hits;
    const totalItems = (actionRequestSearchResults.hits.total as SearchTotalHits).value ?? 0;

    if (migrationStats.totalItems !== totalItems) {
      migrationStats.totalItems = totalItems;
    }

    for (const actionHit of actionRequests) {
      const action = actionHit._source;

      if (action) {
        updateBuilderPromises.push(
          // We don't `await` here. These can just run in the background so that migration runs a little faster
          policyInfoBuilder.buildPolicyUpdate(action).then((updateContent) => {
            if (updateContent.warnings.length > 0) {
              migrationStats.warnings.push(...updateContent.warnings);
            }

            updateProcessor.addToQueue({
              actionId: action.EndpointActions.action_id,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              docId: actionHit._id!,
              index: actionHit._index,
              update: updateContent.policyUpdate,
            });
          })
        );
      }
    }
  }

  await Promise.allSettled(updateBuilderPromises);
  await updateProcessor.complete();

  migrationState.metadata.status = 'complete';
  migrationState.metadata.finished = new Date().toISOString();
  await updateMigrationState(refDataClient, RESPONSE_ACTIONS_MIGRATION_REF_DATA_ID, migrationState);

  logger.debug(
    `migration of endpoint response actions in support of spaces done.\n${JSON.stringify(
      migrationStats,
      null,
      2
    )}`
  );
};

interface AgentPolicyInfo {
  warnings: string[];
  agentInfo: LogsEndpointAction['agent']['policy'][number];
}

interface ActionPolicyInfo {
  warnings: string[];
  policyUpdate: PolicyPartialUpdate;
}

interface PolicyIdInfo {
  found: boolean;
  warning: string;
  policyId: string;
}

interface AgentIdInfo {
  found: boolean;
  warning: string;
  agentId: string;
}

class AgentPolicyInfoBuilder {
  // Cache of previously processed Agent IDs
  private agentIdCache = new Map<string, Promise<AgentPolicyInfo>>();
  private agentIdToAgentPolicyIdCache = new Map<string, Promise<PolicyIdInfo>>();
  private agentPolicyIdToIntegrationPolicyId = new Map<string, Promise<PolicyIdInfo>>();
  private externalEdrAgentIdToElasticAgentIdMapCache = new Map<string, Promise<AgentIdInfo>>();

  constructor(
    private readonly endpointService: EndpointAppContextService,
    private readonly logger: Logger
  ) {}

  public async buildPolicyUpdate(actionRequest: LogsEndpointAction): Promise<ActionPolicyInfo> {
    const agentsPolicyInfo = (
      Array.isArray(actionRequest.agent.id) ? actionRequest.agent.id : [actionRequest.agent.id]
    ).map((agentId) => {
      let agentPolicyInfoPromise = this.agentIdCache.get(agentId);

      if (!agentPolicyInfoPromise) {
        this.logger.debug(
          `Agent ID [${agentId}] policy info content not yet created. Building it now`
        );

        agentPolicyInfoPromise = this.fetchAgentPolicyInfo(agentId, actionRequest);
        this.agentIdCache.set(agentId, agentPolicyInfoPromise);
        return agentPolicyInfoPromise;
      } else {
        this.logger.debug(
          `Found cached policy info for agent ID [${agentId}]. No need to build it.`
        );
      }

      return agentPolicyInfoPromise;
    });

    const response: ActionPolicyInfo = {
      warnings: [],
      policyUpdate: {
        originSpaceId: DEFAULT_SPACE_ID,
        agent: { policy: [] },
      },
    };

    await Promise.all(agentsPolicyInfo).then((agentsInfo) => {
      for (const agentPolicyInfo of agentsInfo) {
        if (agentPolicyInfo.warnings.length > 0) {
          response.warnings.push(...agentPolicyInfo.warnings);
        }

        response.policyUpdate.agent.policy.push(agentPolicyInfo.agentInfo);

        if (agentPolicyInfo.agentInfo.integrationPolicyId === NOT_FOUND_VALUE) {
          response.policyUpdate.tags = [
            ...(actionRequest.tags || []),
            ALLOWED_ACTION_REQUEST_TAGS.integrationPolicyDeleted,
          ];
        }
      }
    });

    this.logger.debug(
      () =>
        `Action [${actionRequest.EndpointActions.action_id}] update: ${JSON.stringify(response)}`
    );

    return response;
  }

  private async fetchAgentPolicyInfo(
    _agentId: string,
    actionRequest: LogsEndpointAction
  ): Promise<AgentPolicyInfo> {
    let agentId = _agentId;

    if (actionRequest.EndpointActions.input_type !== 'endpoint') {
      const externalEdrAgentId = await this.fetchElasticAgentIdFor3rdPartyEdr(
        _agentId,
        actionRequest
      );

      if (!externalEdrAgentId.found) {
        return {
          warnings: [externalEdrAgentId.warning],
          agentInfo: {
            agentId: _agentId,
            elasticAgentId: NOT_FOUND_VALUE,
            agentPolicyId: NOT_FOUND_VALUE,
            integrationPolicyId: NOT_FOUND_VALUE,
          },
        };
      }

      agentId = externalEdrAgentId.agentId;
    }

    const agentPolicyId = await this.fetchAgentPolicyIdForAgent(agentId);

    // If the agent policy is not found, then no need to go any further because we will not be able
    // to determine what integration policy the agent was/is running with.
    if (!agentPolicyId.found) {
      return {
        warnings: [agentPolicyId.warning],
        agentInfo: {
          agentId: _agentId,
          elasticAgentId: agentId,
          agentPolicyId: NOT_FOUND_VALUE,
          integrationPolicyId: NOT_FOUND_VALUE,
        },
      };
    }

    const integrationPolicyId = await this.fetchAgentPolicyIntegrationPolicyId(
      agentPolicyId.policyId,
      actionRequest.EndpointActions.input_type
    );

    return {
      warnings: integrationPolicyId.found ? [] : [integrationPolicyId.warning],
      agentInfo: {
        agentId: _agentId,
        elasticAgentId: agentId,
        agentPolicyId: agentPolicyId.policyId,
        integrationPolicyId: integrationPolicyId.policyId,
      },
    };
  }

  private async fetchAgentPolicyIdForAgent(agentId: string): Promise<PolicyIdInfo> {
    let agentPolicyIdPromise = this.agentIdToAgentPolicyIdCache.get(agentId);

    if (!agentPolicyIdPromise) {
      const fleetServices = this.endpointService.getInternalFleetServices(undefined, true);

      agentPolicyIdPromise = fleetServices.agent
        .getAgent(agentId)
        .then((agent) => {
          if (!agent.policy_id) {
            throw new EndpointError(
              `Agent id [${agentId}] was found, but it does not contain a 'policy_id'`
            );
          }

          return { found: true, warning: '', policyId: agent.policy_id };
        })
        .catch((err) => {
          return {
            found: false,
            warning: `Unable to retrieve agent id [${agentId}]: ${err.message}`,
            policyId: NOT_FOUND_VALUE,
          };
        });

      this.agentIdToAgentPolicyIdCache.set(agentId, agentPolicyIdPromise);

      return agentPolicyIdPromise;
    }

    return agentPolicyIdPromise;
  }

  private async fetchAgentPolicyIntegrationPolicyId(
    agentPolicyId: string,
    agentType: ResponseActionAgentType
  ): Promise<PolicyIdInfo> {
    // An agent policy - especially one for agentless integration (3rd party EDRs) - could include
    // multiple integration for the supported agent types, so we keep a cache for each agent type
    const cacheKey = `${agentPolicyId}#${agentType}`;
    let integrationPolicyIdPromise = this.agentPolicyIdToIntegrationPolicyId.get(cacheKey);

    if (!integrationPolicyIdPromise) {
      const fleetServices = this.endpointService.getInternalFleetServices(undefined, true);

      integrationPolicyIdPromise = fleetServices.packagePolicy
        .list(fleetServices.getSoClient(), {
          kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: (${RESPONSE_ACTIONS_SUPPORTED_INTEGRATION_TYPES[
            agentType
          ].join(' OR ')}) AND (${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.policy_ids:"${agentPolicyId}")`,
          perPage: 1,
        })
        .then((response) => {
          const integrationPolicy = response.items[0];

          if (!integrationPolicy) {
            throw new EndpointError(
              `Unable to find [${agentType}] integration policies for agent policy id [${agentPolicyId}]`
            );
          }

          return {
            found: true,
            warning: '',
            policyId: integrationPolicy.id,
          };
        })
        .catch((err) => {
          return {
            found: false,
            warning:
              err instanceof EndpointError
                ? err.message
                : `Failed to find [${agentType}] integration polices for agent policy [${agentPolicyId}]: ${err.message}`,
            policyId: NOT_FOUND_VALUE,
          };
        });

      this.agentPolicyIdToIntegrationPolicyId.set(cacheKey, integrationPolicyIdPromise);
    }

    return integrationPolicyIdPromise;
  }

  async fetchElasticAgentIdFor3rdPartyEdr(
    externalEdrAgentId: string,
    actionRequest: LogsEndpointAction
  ): Promise<AgentIdInfo> {
    const agentType = actionRequest.EndpointActions.input_type;
    const elasticAgentIdPromise =
      this.externalEdrAgentIdToElasticAgentIdMapCache.get(externalEdrAgentId);

    if (elasticAgentIdPromise) {
      this.logger.debug(`Returning cached result [${agentType}] agent id [${externalEdrAgentId}]`);
      return elasticAgentIdPromise;
    }

    this.externalEdrAgentIdToElasticAgentIdMapCache.set(
      externalEdrAgentId,
      new Promise(async (resolve, reject) => {
        try {
          const esClient = this.endpointService.getInternalEsClient();

          this.logger.debug(
            `Retrieving Elastic agent id for [${agentType}] agent [${externalEdrAgentId}]`
          );

          const esSearchRequest: SearchRequest = {
            index: '', // value by switch statement below
            // query: {} set by switch statement below
            _source: ['agent'],
            sort: [{ 'event.created': 'desc' }],
            ignore_unavailable: true,
            allow_no_indices: true,
            size: 1,
          };

          switch (agentType) {
            case 'microsoft_defender_endpoint':
              esSearchRequest.index = MICROSOFT_DEFENDER_ENDPOINT_LOG_INDEX_PATTERN;
              esSearchRequest.query = {
                bool: { filter: [{ term: { 'cloud.instance.id': externalEdrAgentId } }] },
              };
              break;

            case 'sentinel_one':
              esSearchRequest.index = SENTINEL_ONE_AGENT_INDEX_PATTERN;
              esSearchRequest.query = {
                bool: { filter: [{ term: { 'sentinel_one.agent.agent.id': externalEdrAgentId } }] },
              };
              break;

            case 'crowdstrike':
              esSearchRequest.index = CROWDSTRIKE_HOST_INDEX_PATTERN;
              esSearchRequest.query = {
                bool: { filter: [{ term: { 'device.id': externalEdrAgentId } }] },
              };
              break;

            default:
              resolve({
                found: false,
                warning: `Response action [${actionRequest.EndpointActions.action_id}] has an unsupported agent type [${agentType}].]`,
                agentId: '',
              });
              return;
          }

          this.logger.debug(
            () =>
              `Searching [${agentType}] data to identify elastic agent used to ingest data for external agent id [${externalEdrAgentId}]:${stringify(
                esSearchRequest
              )}`
          );

          const esSearchResult = await esClient
            .search<MicrosoftDefenderEndpointLogEsDoc>(esSearchRequest)
            .catch(catchAndWrapError);
          const hitSource = esSearchResult.hits.hits[0]?._source;

          if (hitSource && hitSource.agent.id) {
            resolve({
              found: true,
              warning: '',
              agentId: hitSource.agent.id,
            });
            return;
          }

          resolve({
            found: false,
            warning: `Unable to determine elastic agent id used to ingest data for [${agentType}] external agent id [${externalEdrAgentId}]`,
            agentId: '',
          });
        } catch (error) {
          reject(error);
        }
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.externalEdrAgentIdToElasticAgentIdMapCache.get(externalEdrAgentId)!;
  }
}

interface EnsureResponseActionsIndexHasRequiredMappingsResponse {
  successful: boolean;
  indexExists: boolean;
  error: string | undefined;
}

const ensureResponseActionsIndexHasRequiredMappings = async (
  endpointService: EndpointAppContextService
): Promise<EnsureResponseActionsIndexHasRequiredMappingsResponse> => {
  const logger = endpointService.createLogger(
    LOGGER_KEY,
    'ensureResponseActionsIndexHasRequiredMappings'
  );

  logger.debug(`Checking index [${ENDPOINT_ACTIONS_INDEX}] mappings`);

  const response: EnsureResponseActionsIndexHasRequiredMappingsResponse = {
    successful: true,
    indexExists: true,
    error: undefined,
  };
  const esClient = endpointService.getInternalEsClient();
  const fleetServices = endpointService.getInternalFleetServices();
  const [indexExists, installedEndpointPackages] = await Promise.all([
    esClient.indices.exists({ index: ENDPOINT_ACTIONS_INDEX }).catch(catchAndWrapError),

    fleetServices.packages.getInstalledPackages({
      perPage: 100,
      sortOrder: 'desc',
      nameQuery: 'endpoint',
    }),
  ]);

  response.indexExists = indexExists;

  logger.debug(
    () =>
      `Does DS index already exists: ${indexExists}\nCurrently installed endpoint package:${stringify(
        installedEndpointPackages
      )}`
  );

  // If the index does not exist and Endpoint package is not installed, then this must be an env.
  // where the use of security and/or Fleet is not being utilized.
  if (!indexExists && installedEndpointPackages.total === 0) {
    logger.debug(
      `Index [${ENDPOINT_ACTIONS_INDEX}] does not yet exist and no endpoint package installed. Nothing to do.`
    );
    return response;
  }

  // if we got this far, then endpoint package is installed. Ensure index exists and add mappings
  await ensureActionRequestsIndexIsConfigured(endpointService).catch((error) => {
    response.error = `Attempt to add new mappings to [${ENDPOINT_ACTIONS_INDEX}] index failed with:${stringify(
      error
    )}`;
    response.successful = false;
    return response;
  });

  response.indexExists = true;

  logger.debug(`New mappings to index [${ENDPOINT_ACTIONS_INDEX}] have been added successfully.`);

  return response;
};
