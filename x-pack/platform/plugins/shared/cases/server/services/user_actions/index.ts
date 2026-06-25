/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectsFindResponse,
  SavedObjectsFindResult,
  SavedObjectsRawDoc,
} from '@kbn/core/server';

import type { estypes } from '@elastic/elasticsearch';
import type { KueryNode } from '@kbn/es-query';
import type { CaseUserActionDeprecatedResponse } from '../../../common/types/api';
import { AttachmentType, UserActionActions, UserActionTypes } from '../../../common/types/domain';
import { decodeOrThrow } from '../../common/runtime_types';
import {
  CASE_COMMENT_SAVED_OBJECT,
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  MAX_DOCS_PER_PAGE,
} from '../../../common/constants';
import { buildFilter, combineFilters } from '../../client/utils';
import type {
  CaseConnectorActivity,
  CaseConnectorFields,
  ConnectorActivityAggsResult,
  ConnectorFieldsBeforePushAggsResult,
  GetUsersResponse,
  MultipleCasesUserActionsTotalAggsResult,
  ParticipantsAggsResult,
  PushInfo,
  PushTimeFrameInfo,
  ServiceContext,
  TimeFrameInfo,
  TopHits,
  UserActionsStatsAggsResult,
} from './types';
import { defaultSortField } from '../../common/utils';
import { UserActionPersister } from './operations/create';
import { UserActionFinder } from './operations/find';
import { transformToExternalModel, legacyTransformFindResponseToExternalModel } from './transform';
import type {
  UserActionPersistedAttributes,
  UserActionSavedObjectTransformed,
} from '../../common/types/user_actions';
import { UserActionTransformedAttributesRt } from '../../common/types/user_actions';
import { CaseUserActionDeprecatedResponseRt } from '../../../common/types/api';
import { isCommentAttachmentType } from '../../../common/utils/attachments';

export class CaseUserActionService {
  private readonly _creator: UserActionPersister;
  private readonly _finder: UserActionFinder;

  constructor(private readonly context: ServiceContext) {
    this._creator = new UserActionPersister(context);
    this._finder = new UserActionFinder(context);
  }

  public get creator() {
    return this._creator;
  }

  public get finder() {
    return this._finder;
  }

  public async getConnectorFieldsBeforeLatestPush(
    caseId: string,
    pushes: PushInfo[]
  ): Promise<CaseConnectorFields> {
    try {
      this.context.log.debug(
        `Attempting to retrieve the connector fields before the last push for case id: ${caseId}`
      );

      if (pushes.length <= 0) {
        return new Map();
      }

      const connectorsFilter = buildFilter({
        filters: [UserActionTypes.connector, UserActionTypes.create_case],
        field: 'type',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const response = await this.context.unsecuredSavedObjectsClient.find<
        UserActionPersistedAttributes,
        ConnectorFieldsBeforePushAggsResult
      >({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        page: 1,
        perPage: 1,
        sortField: defaultSortField,
        aggs: CaseUserActionService.buildConnectorFieldsUsedInPushAggs(pushes),
        filter: connectorsFilter,
      });

      return this.createCaseConnectorFieldsUsedInPushes(response.aggregations);
    } catch (error) {
      this.context.log.error(
        `Error while retrieving the connector fields before the last push: ${caseId}: ${error}`
      );
      throw error;
    }
  }

  private static buildConnectorFieldsUsedInPushAggs(
    pushes: PushInfo[]
  ): Record<string, estypes.AggregationsAggregationContainer> {
    const filters: estypes.AggregationsBuckets<estypes.QueryDslQueryContainer> = {};

    /**
     * Group the user actions by the unique connector ids and bound the time range
     * for that connector's push event. We want to search for the fields before the push timestamp.
     */
    for (const push of pushes) {
      filters[push.connectorId] = {
        bool: {
          filter: [
            {
              // Search for connector field user action prior to the push occurrence
              range: {
                [`${CASE_USER_ACTION_SAVED_OBJECT}.created_at`]: {
                  lt: push.date.toISOString(),
                },
              },
            },
            {
              nested: {
                path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
                query: {
                  bool: {
                    filter: [
                      {
                        // We only want to search a time frame for a specific connector id
                        term: {
                          [`${CASE_USER_ACTION_SAVED_OBJECT}.references.id`]: {
                            value: push.connectorId,
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      };
    }

    return {
      references: {
        nested: {
          path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
        },
        aggregations: {
          connectors: {
            filter: {
              // Only search for user actions that have a connector reference aka a reference with type action
              term: {
                [`${CASE_USER_ACTION_SAVED_OBJECT}.references.type`]: 'action',
              },
            },
            aggregations: {
              reverse: {
                reverse_nested: {},
                aggregations: {
                  ids: {
                    filters: {
                      filters,
                    },
                    aggregations: {
                      mostRecent: {
                        top_hits: {
                          sort: [
                            {
                              [`${CASE_USER_ACTION_SAVED_OBJECT}.created_at`]: {
                                order: 'desc',
                              },
                            },
                          ],
                          size: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  private createCaseConnectorFieldsUsedInPushes(
    aggsResults?: ConnectorFieldsBeforePushAggsResult
  ): CaseConnectorFields {
    const connectorFields: CaseConnectorFields = new Map();

    if (!aggsResults) {
      return connectorFields;
    }

    for (const connectorId of Object.keys(aggsResults.references.connectors.reverse.ids.buckets)) {
      const fields = aggsResults.references.connectors.reverse.ids.buckets[connectorId];

      if (fields.mostRecent.hits.hits.length > 0) {
        const rawFieldsDoc = fields.mostRecent.hits.hits[0];
        const doc =
          this.context.savedObjectsSerializer.rawToSavedObject<UserActionPersistedAttributes>(
            rawFieldsDoc
          );

        const res = transformToExternalModel(doc);

        const decodeRes = decodeOrThrow(UserActionTransformedAttributesRt)(res.attributes);

        const fieldsDoc = Object.assign(res, {
          attributes: decodeRes,
        });

        connectorFields.set(connectorId, fieldsDoc);
      }
    }

    return connectorFields;
  }

  public async getMostRecentUserAction(
    caseId: string,
    hasAdditionalUserActionsConnector = false
  ): Promise<UserActionSavedObjectTransformed | undefined> {
    try {
      this.context.log.debug(
        `Attempting to retrieve the most recent user action for case id: ${caseId}`
      );

      const id = caseId;
      const type = CASE_SAVED_OBJECT;

      const connectorsFilter = buildFilter({
        filters: [
          UserActionTypes.comment,
          UserActionTypes.description,
          UserActionTypes.title,
          /**
           * TODO: Remove when all connectors support the status, severity
           * and tags user actions or if there is a mechanism to
           * define supported user actions per connector type
           */
          ...(hasAdditionalUserActionsConnector
            ? [UserActionTypes.severity, UserActionTypes.status, UserActionTypes.tags]
            : []),
        ],
        field: 'type',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const userActions =
        await this.context.unsecuredSavedObjectsClient.find<UserActionPersistedAttributes>({
          type: CASE_USER_ACTION_SAVED_OBJECT,
          hasReference: { type, id },
          page: 1,
          perPage: 1,
          sortField: 'created_at',
          sortOrder: 'desc',
          filter: connectorsFilter,
        });

      if (userActions.saved_objects.length <= 0) {
        return;
      }

      const res = transformToExternalModel(userActions.saved_objects[0]);

      const decodeRes = decodeOrThrow(UserActionTransformedAttributesRt)(res.attributes);

      return {
        ...res,
        attributes: decodeRes,
      };
    } catch (error) {
      this.context.log.error(
        `Error while retrieving the most recent user action for case id: ${caseId}: ${error}`
      );
      throw error;
    }
  }

  public async getCaseConnectorInformation(caseId: string): Promise<CaseConnectorActivity[]> {
    try {
      this.context.log.debug(`Attempting to find connector information for case id: ${caseId}`);

      const connectorsFilter = buildFilter({
        filters: [UserActionTypes.connector, UserActionTypes.create_case, UserActionTypes.pushed],
        field: 'type',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const response = await this.context.unsecuredSavedObjectsClient.find<
        UserActionPersistedAttributes,
        ConnectorActivityAggsResult
      >({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        page: 1,
        perPage: 1,
        sortField: defaultSortField,
        aggs: CaseUserActionService.buildConnectorInfoAggs(),
        filter: connectorsFilter,
      });

      return this.createCaseConnectorInformation(response.aggregations);
    } catch (error) {
      this.context.log.error(
        `Error while retrieving the connector information for case id: ${caseId} ${error}`
      );
      throw error;
    }
  }

  private createCaseConnectorInformation(
    aggsResults?: ConnectorActivityAggsResult
  ): CaseConnectorActivity[] {
    const caseConnectorInfo: CaseConnectorActivity[] = [];

    if (!aggsResults) {
      return caseConnectorInfo;
    }

    for (const connectorInfo of aggsResults.references.connectors.ids.buckets) {
      const changeConnector = connectorInfo.reverse.connectorActivity.buckets.changeConnector;
      const createCase = connectorInfo.reverse.connectorActivity.buckets.createCase;
      let rawFieldsDoc: SavedObjectsRawDoc | undefined;

      if (changeConnector.mostRecent.hits.hits.length > 0) {
        rawFieldsDoc = changeConnector.mostRecent.hits.hits[0];
      } else if (createCase.mostRecent.hits.hits.length > 0) {
        /**
         * If there is ever a connector update user action that takes precedence over the information stored
         * in the create case user action because it indicates that the connector's fields were changed
         */
        rawFieldsDoc = createCase.mostRecent.hits.hits[0];
      }

      let fieldsDoc: UserActionSavedObjectTransformed | undefined;
      if (rawFieldsDoc != null) {
        const doc =
          this.context.savedObjectsSerializer.rawToSavedObject<UserActionPersistedAttributes>(
            rawFieldsDoc
          );

        const res = transformToExternalModel(doc);

        const decodeRes = decodeOrThrow(UserActionTransformedAttributesRt)(res.attributes);

        fieldsDoc = { ...res, attributes: decodeRes };
      }

      const pushDocs = this.getPushDocs(connectorInfo.reverse.connectorActivity.buckets.pushInfo);

      if (fieldsDoc != null) {
        caseConnectorInfo.push({
          connectorId: connectorInfo.key,
          fields: fieldsDoc,
          push: pushDocs,
        });
      } else {
        this.context.log.warn(`Unable to find fields for connector id: ${connectorInfo.key}`);
      }
    }

    return caseConnectorInfo;
  }

  private getPushDocs(pushTimeFrameInfo: TimeFrameInfo): PushTimeFrameInfo | undefined {
    const mostRecentPushDoc = this.getTopHitsDoc(pushTimeFrameInfo.mostRecent);
    const oldestPushDoc = this.getTopHitsDoc(pushTimeFrameInfo.oldest);

    if (mostRecentPushDoc && oldestPushDoc) {
      return {
        mostRecent: mostRecentPushDoc,
        oldest: oldestPushDoc,
      };
    }
  }

  private getTopHitsDoc(topHits: TopHits): UserActionSavedObjectTransformed | undefined {
    if (topHits.hits.hits.length > 0) {
      const rawPushDoc = topHits.hits.hits[0];

      const doc =
        this.context.savedObjectsSerializer.rawToSavedObject<UserActionPersistedAttributes>(
          rawPushDoc
        );

      const res = transformToExternalModel(doc);

      const decodeRes = decodeOrThrow(UserActionTransformedAttributesRt)(res.attributes);
      return { ...res, attributes: decodeRes };
    }
  }

  private static buildConnectorInfoAggs(): Record<
    string,
    estypes.AggregationsAggregationContainer
  > {
    return {
      references: {
        nested: {
          path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
        },
        aggregations: {
          connectors: {
            filter: {
              term: {
                [`${CASE_USER_ACTION_SAVED_OBJECT}.references.type`]: 'action',
              },
            },
            aggregations: {
              ids: {
                // Bucket by connector id
                terms: {
                  field: `${CASE_USER_ACTION_SAVED_OBJECT}.references.id`,
                  // We're assuming that a case will not have more than 1000 connectors
                  size: 1000,
                },
                aggregations: {
                  reverse: {
                    reverse_nested: {},
                    aggregations: {
                      connectorActivity: {
                        filters: {
                          filters: {
                            // look for connector fields user actions from "change connector" occurrence
                            changeConnector: {
                              term: {
                                [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.type`]:
                                  UserActionTypes.connector,
                              },
                            },
                            // If the case was initialized with a connector, the fields could exist in the create_case
                            // user action
                            createCase: {
                              term: {
                                [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.type`]:
                                  UserActionTypes.create_case,
                              },
                            },
                            // Also grab the most recent push occurrence for the connector
                            pushInfo: {
                              term: {
                                [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.type`]:
                                  UserActionTypes.pushed,
                              },
                            },
                          },
                        },
                        aggregations: {
                          mostRecent: {
                            top_hits: {
                              sort: [
                                {
                                  [`${CASE_USER_ACTION_SAVED_OBJECT}.created_at`]: {
                                    order: 'desc',
                                  },
                                },
                              ],
                              size: 1,
                            },
                          },
                          oldest: {
                            top_hits: {
                              sort: [
                                {
                                  [`${CASE_USER_ACTION_SAVED_OBJECT}.created_at`]: {
                                    order: 'asc',
                                  },
                                },
                              ],
                              size: 1,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  public async getAll(
    caseId: string
  ): Promise<SavedObjectsFindResponse<CaseUserActionDeprecatedResponse>> {
    try {
      const id = caseId;
      const type = CASE_SAVED_OBJECT;

      const userActions =
        await this.context.unsecuredSavedObjectsClient.find<UserActionPersistedAttributes>({
          type: CASE_USER_ACTION_SAVED_OBJECT,
          hasReference: { type, id },
          page: 1,
          perPage: MAX_DOCS_PER_PAGE,
          sortField: 'created_at',
          sortOrder: 'asc',
        });

      const transformedUserActions = legacyTransformFindResponseToExternalModel(userActions);

      const validatedUserActions: Array<SavedObjectsFindResult<CaseUserActionDeprecatedResponse>> =
        [];
      for (const so of transformedUserActions.saved_objects) {
        const validatedAttributes = decodeOrThrow(CaseUserActionDeprecatedResponseRt)(
          so.attributes
        );

        validatedUserActions.push(Object.assign(so, { attributes: validatedAttributes }));
      }

      return Object.assign(transformedUserActions, { saved_objects: validatedUserActions });
    } catch (error) {
      this.context.log.error(`Error on GET case user action case id: ${caseId}: ${error}`);
      throw error;
    }
  }

  public async getUserActionIdsForCases(caseIds: string[]) {
    try {
      this.context.log.debug(
        `Attempting to retrieve user actions associated with cases: [${caseIds}]`
      );

      // We are intentionally not adding the type here because we only want to interact with the id and this function
      // should not use the attributes
      const finder = this.context.unsecuredSavedObjectsClient.createPointInTimeFinder({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: caseIds.map((id) => ({ id, type: CASE_SAVED_OBJECT })),
        sortField: 'created_at',
        sortOrder: 'asc',
        /**
         * We only care about the ids so to reduce the data returned we should limit the fields in the response. Core
         * doesn't support retrieving no fields (id would always be returned anyway) so to limit it we'll only request
         * the owner even though we don't need it.
         */
        fields: ['owner'],
        perPage: MAX_DOCS_PER_PAGE,
      });

      const ids: string[] = [];
      for await (const userActionSavedObject of finder.find()) {
        ids.push(...userActionSavedObject.saved_objects.map((userAction) => userAction.id));
      }

      return ids;
    } catch (error) {
      this.context.log.error(`Error retrieving user action ids for cases: [${caseIds}]: ${error}`);
      throw error;
    }
  }

  public async getUniqueConnectors({
    caseId,
    filter,
  }: {
    caseId: string;
    filter?: KueryNode;
  }): Promise<Array<{ id: string }>> {
    try {
      this.context.log.debug(`Attempting to count connectors for case id ${caseId}`);
      const connectorsFilter = buildFilter({
        filters: [UserActionTypes.connector, UserActionTypes.create_case],
        field: 'type',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const combinedFilter = combineFilters([connectorsFilter, filter]);

      const response = await this.context.unsecuredSavedObjectsClient.find<
        UserActionPersistedAttributes,
        { references: { connectors: { ids: { buckets: Array<{ key: string }> } } } }
      >({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        page: 1,
        perPage: 1,
        sortField: defaultSortField,
        aggs: this.buildCountConnectorsAggs(),
        filter: combinedFilter,
      });

      return (
        response.aggregations?.references?.connectors?.ids?.buckets?.map(({ key }) => ({
          id: key,
        })) ?? []
      );
    } catch (error) {
      this.context.log.error(`Error while counting connectors for case id ${caseId}: ${error}`);
      throw error;
    }
  }

  private buildCountConnectorsAggs(
    /**
     * It is high unlikely for a user to have more than
     * 100 connectors attached to a case
     */
    size: number = 100
  ): Record<string, estypes.AggregationsAggregationContainer> {
    return {
      references: {
        nested: {
          path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
        },
        aggregations: {
          connectors: {
            filter: {
              term: {
                [`${CASE_USER_ACTION_SAVED_OBJECT}.references.type`]: 'action',
              },
            },
            aggregations: {
              ids: {
                terms: {
                  field: `${CASE_USER_ACTION_SAVED_OBJECT}.references.id`,
                  size,
                },
              },
            },
          },
        },
      },
    };
  }

  public async getMultipleCasesUserActionsTotal({
    caseIds,
  }: {
    caseIds: string[];
  }): Promise<Record<string, number>> {
    const response = await this.context.unsecuredSavedObjectsClient.find<
      unknown,
      MultipleCasesUserActionsTotalAggsResult
    >({
      type: CASE_USER_ACTION_SAVED_OBJECT,
      hasReference: caseIds.map((id) => ({ type: CASE_SAVED_OBJECT, id })),
      hasReferenceOperator: 'OR',
      page: 1,
      perPage: 1,
      sortField: defaultSortField,
      aggs: CaseUserActionService.buildMultipleCasesUserActionsTotalAgg(caseIds.length),
    });

    const result: Record<string, number> = {};

    response?.aggregations?.references.caseUserActions.buckets.forEach(
      ({ key, doc_count: totalUserActions }: { key: string; doc_count: number }) => {
        result[key] = totalUserActions;
      }
    );

    return result;
  }

  private static buildMultipleCasesUserActionsTotalAgg(
    idsLength: number
  ): Record<string, estypes.AggregationsAggregationContainer> {
    return {
      references: {
        nested: {
          path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
        },
        aggregations: {
          caseUserActions: {
            terms: {
              field: `${CASE_USER_ACTION_SAVED_OBJECT}.references.id`,
              size: idsLength,
            },
          },
        },
      },
    };
  }

  public async getCaseUserActionStats({ caseId }: { caseId: string }) {
    const isCasesAttachmentsEnabled = this.context.isCasesAttachmentsEnabled === true;
    const isComment = (type: string) =>
      isCasesAttachmentsEnabled ? isCommentAttachmentType(type) : type === AttachmentType.user;

    const response = await this.context.unsecuredSavedObjectsClient.find<
      unknown,
      UserActionsStatsAggsResult
    >({
      type: CASE_USER_ACTION_SAVED_OBJECT,
      hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
      page: 1,
      perPage: 1,
      sortField: defaultSortField,
      aggs: CaseUserActionService.buildUserActionStatsAgg(),
    });

    const result = {
      total: response.total ?? 0,
      total_deletions: response.aggregations?.deletions?.doc_count ?? 0,
      total_comments: 0,
      total_comment_deletions: 0,
      total_comment_creations: 0,
      total_hidden_comment_updates: 0,
      total_other_actions: 0,
      total_other_action_deletions: 0,
    };

    response.aggregations?.totals.buckets.forEach(({ key, doc_count: docCount }) => {
      if (isComment(key)) {
        result.total_comments += docCount;
      }
    });

    response.aggregations?.deletions.deletions.buckets.forEach(({ key, doc_count: docCount }) => {
      if (isComment(key)) {
        result.total_comment_deletions += docCount;
      }
    });

    response.aggregations?.creations.creations.buckets.forEach(({ key, doc_count: docCount }) => {
      if (isComment(key)) {
        result.total_comment_creations += docCount;
      }
    });

    /**
     * Calculate total_hidden_comment_updates by summing updates for DELETED comments.
     * These are edit actions that are no longer visible to users because the comment was deleted.
     */
    const commentBuckets = Object.values(
      response.aggregations?.nonDeletedCommentUpdates?.comments?.buckets ?? {}
    ).flatMap((bucket) => bucket.byCommentId?.buckets ?? []);

    for (const bucket of commentBuckets) {
      const hasBeenDeleted = bucket.reverse?.hasDelete?.doc_count > 0;
      if (hasBeenDeleted) {
        const commentTypeBuckets = bucket.reverse?.updates?.byCommentType?.buckets ?? [];
        const userCommentUpdates = commentTypeBuckets.reduce(
          (sum: number, b: { key: string; doc_count: number }) =>
            isComment(b.key) ? sum + b.doc_count : sum,
          0
        );
        result.total_hidden_comment_updates += userCommentUpdates;
      }
    }

    result.total_other_actions = result.total - result.total_comments;
    result.total_other_action_deletions = result.total_deletions - result.total_comment_deletions;

    return result;
  }

  private static buildUserActionStatsAgg(): Record<
    string,
    estypes.AggregationsAggregationContainer
  > {
    return {
      totals: {
        terms: {
          field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type`,
          size: 100,
        },
      },
      deletions: {
        filter: {
          term: {
            [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.action`]: UserActionActions.delete,
          },
        },
        aggs: {
          deletions: {
            terms: {
              field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type`,
              size: 100,
            },
          },
        },
      },
      creations: {
        filter: {
          term: {
            [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.action`]: UserActionActions.create,
          },
        },
        aggs: {
          creations: {
            terms: {
              field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type`,
              size: 100,
            },
          },
        },
      },
      /**
       * Count updates only for comments that have NOT been deleted.
       * This aggregation:
       * 1. Groups user actions by comment_id reference
       * 2. Filters out comments that have a delete action
       * 3. Sums up the update counts for remaining (non-deleted) comments
       */
      nonDeletedCommentUpdates: {
        nested: {
          path: `${CASE_USER_ACTION_SAVED_OBJECT}.references`,
        },
        aggs: {
          comments: {
            filters: {
              filters: {
                [CASE_COMMENT_SAVED_OBJECT]: {
                  term: {
                    [`${CASE_USER_ACTION_SAVED_OBJECT}.references.type`]: CASE_COMMENT_SAVED_OBJECT,
                  },
                },
                [CASE_ATTACHMENT_SAVED_OBJECT]: {
                  term: {
                    [`${CASE_USER_ACTION_SAVED_OBJECT}.references.type`]:
                      CASE_ATTACHMENT_SAVED_OBJECT,
                  },
                },
              },
            },
            aggs: {
              byCommentId: {
                terms: {
                  field: `${CASE_USER_ACTION_SAVED_OBJECT}.references.id`,
                  size: MAX_DOCS_PER_PAGE,
                },
                aggs: {
                  reverse: {
                    reverse_nested: {},
                    aggs: {
                      hasDelete: {
                        filter: {
                          term: {
                            [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.action`]:
                              UserActionActions.delete,
                          },
                        },
                      },
                      updates: {
                        filter: {
                          term: {
                            [`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.action`]:
                              UserActionActions.update,
                          },
                        },
                        aggs: {
                          byCommentType: {
                            terms: {
                              field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type`,
                              size: 100,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  public async getUsers({ caseId }: { caseId: string }): Promise<GetUsersResponse> {
    const response = await this.context.unsecuredSavedObjectsClient.find<
      unknown,
      ParticipantsAggsResult
    >({
      type: CASE_USER_ACTION_SAVED_OBJECT,
      hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
      page: 1,
      perPage: 1,
      sortField: defaultSortField,
      aggs: CaseUserActionService.buildParticipantsAgg(),
    });

    const assignedAndUnassignedUsers: GetUsersResponse['assignedAndUnassignedUsers'] =
      new Set<string>();
    const participants: GetUsersResponse['participants'] = [];
    const participantsBuckets = response.aggregations?.participants.buckets ?? [];
    const assigneesBuckets = response.aggregations?.assignees.buckets ?? [];

    for (const bucket of participantsBuckets) {
      const rawDoc = bucket.docs.hits.hits[0];
      const user =
        this.context.savedObjectsSerializer.rawToSavedObject<UserActionPersistedAttributes>(rawDoc);

      /**
       * We are interested only for the created_by
       * and the owner. For that reason, there is no
       * need to call transformToExternalModel which
       * injects the references ids to the document.
       */
      participants.push({
        id: user.id,
        user: user.attributes.created_by,
        owner: user.attributes.owner,
      });
    }

    /**
     * The users set includes any
     * user that got assigned in the
     * case even if they removed as
     * assignee at some point in time.
     */
    for (const bucket of assigneesBuckets) {
      assignedAndUnassignedUsers.add(bucket.key);
    }

    return { participants, assignedAndUnassignedUsers };
  }

  private static buildParticipantsAgg(): Record<string, estypes.AggregationsAggregationContainer> {
    return {
      participants: {
        terms: {
          field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.created_by.username`,
          size: MAX_DOCS_PER_PAGE,
          order: { _key: 'asc' },
          missing: 'Unknown',
        },
        aggregations: {
          docs: {
            top_hits: {
              size: 1,
              sort: [
                {
                  [`${CASE_USER_ACTION_SAVED_OBJECT}.created_at`]: {
                    order: 'desc',
                  },
                },
              ],
            },
          },
        },
      },
      assignees: {
        terms: {
          field: `${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.assignees.uid`,
          size: MAX_DOCS_PER_PAGE,
          order: { _key: 'asc' },
        },
      },
    };
  }
}
