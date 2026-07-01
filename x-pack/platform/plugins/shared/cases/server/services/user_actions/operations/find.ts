/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression } from '@kbn/es-query';
import type {
  SavedObjectsCreatePointInTimeFinderOptions,
  SavedObjectsFindResponse,
} from '@kbn/core-saved-objects-api-server';
import type { UserActionFindRequestTypes } from '../../../../common/types/api';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from '../../../routes/api';
import { defaultSortField } from '../../../common/utils';
import { decodeOrThrow } from '../../../common/runtime_types';
import {
  CASE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  MAX_DOCS_PER_PAGE,
} from '../../../../common/constants';
import { COMMENT_ATTACHMENT_TYPE } from '../../../../common/constants/attachments';

import type { FindOptions, ServiceContext } from '../types';
import { transformFindResponseToExternalModel, transformToExternalModel } from '../transform';
import { buildFilter, combineFilters, NodeBuilderOperators } from '../../../client/utils';
import type {
  UserActionPersistedAttributes,
  UserActionSavedObjectTransformed,
  UserActionTransformedAttributes,
} from '../../../common/types/user_actions';
import { bulkDecodeSOAttributes } from '../../utils';
import { UserActionTransformedAttributesRt } from '../../../common/types/user_actions';
import type { UserActionType } from '../../../../common/types/domain';
import {
  UserActionActions,
  UserActionTypes,
  AttachmentType,
} from '../../../../common/types/domain';

export class UserActionFinder {
  constructor(private readonly context: ServiceContext) {}

  public async find({
    caseId,
    sortOrder,
    types,
    page,
    perPage,
    filter,
    author,
  }: FindOptions): Promise<SavedObjectsFindResponse<UserActionTransformedAttributes>> {
    try {
      this.context.log.debug(`Attempting to find user actions for case id: ${caseId}`);

      const finalFilter = combineFilters([
        filter,
        UserActionFinder.buildFilter(types),
        UserActionFinder.buildAuthorFilter(author),
      ]);

      const userActions =
        await this.context.unsecuredSavedObjectsClient.find<UserActionPersistedAttributes>({
          type: CASE_USER_ACTION_SAVED_OBJECT,
          hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
          page: page ?? DEFAULT_PAGE,
          perPage: perPage ?? DEFAULT_PER_PAGE,
          sortField: 'created_at',
          sortOrder: sortOrder ?? 'asc',
          filter: finalFilter,
        });

      const res = transformFindResponseToExternalModel(userActions);

      const decodeRes = bulkDecodeSOAttributes(
        res.saved_objects,
        UserActionTransformedAttributesRt
      );

      return {
        ...res,
        saved_objects: res.saved_objects.map((so) => ({
          ...so,
          attributes: decodeRes.get(so.id) as UserActionTransformedAttributes,
        })),
      };
    } catch (error) {
      this.context.log.error(`Error finding user actions for case id: ${caseId}: ${error}`);
      throw error;
    }
  }

  /**
   * Fetches all user actions for a case using a point-in-time finder.
   * The `search` field from FindOptions is intentionally excluded — text search
   * is handled via in-memory filtering at the client layer.
   */
  public async findAll({
    caseId,
    sortOrder,
    types,
    filter,
    author,
  }: Omit<FindOptions, 'page' | 'perPage' | 'search'>): Promise<
    UserActionSavedObjectTransformed[]
  > {
    try {
      this.context.log.debug(`Attempting to find all user actions for case id: ${caseId}`);

      const finalFilter = combineFilters([
        filter,
        UserActionFinder.buildFilter(types),
        UserActionFinder.buildAuthorFilter(author),
      ]);

      return await this.collectFromPIT({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        sortField: defaultSortField,
        sortOrder: sortOrder ?? 'asc',
        filter: finalFilter,
        perPage: MAX_DOCS_PER_PAGE,
      });
    } catch (error) {
      this.context.log.error(`Error finding all user actions for case id: ${caseId}: ${error}`);
      throw error;
    }
  }

  private static buildFilter(types: FindOptions['types'] = []) {
    const filters = types.map((type) => UserActionFinder.buildFilterType(type));
    return combineFilters(filters, NodeBuilderOperators.or);
  }

  private static buildFilterType(type: UserActionFindRequestTypes): KueryNode | undefined {
    switch (type) {
      case 'action':
        return UserActionFinder.buildActionFilter();
      case 'user':
        return UserActionFinder.buildCommentTypeFilter();
      case 'alert':
        return UserActionFinder.buildAlertCommentTypeFilter();
      case 'attachment':
        return UserActionFinder.buildAttachmentsFilter();
      default:
        return UserActionFinder.buildGenericTypeFilter(type);
    }
  }

  private static buildActionFilter(): KueryNode | undefined {
    const filterForUserActionsExcludingComments = fromKueryExpression(
      `not (${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type: ${AttachmentType.user} or ${CASE_USER_ACTION_SAVED_OBJECT}.attributes.payload.comment.type: ${COMMENT_ATTACHMENT_TYPE})`
    );

    return filterForUserActionsExcludingComments;
  }

  private static buildCommentTypeFilter(): KueryNode | undefined {
    return combineFilters(
      [
        buildFilter({
          filters: [UserActionTypes.comment],
          field: 'type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
        buildFilter({
          filters: [AttachmentType.user, COMMENT_ATTACHMENT_TYPE],
          field: 'payload.comment.type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
        buildFilter({
          filters: [UserActionActions.create],
          field: 'action',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
      ],
      NodeBuilderOperators.and
    );
  }

  private static buildAlertCommentTypeFilter(): KueryNode | undefined {
    return combineFilters(
      [
        buildFilter({
          filters: [UserActionTypes.comment],
          field: 'type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
        buildFilter({
          filters: [AttachmentType.alert],
          field: 'payload.comment.type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
      ],
      NodeBuilderOperators.and
    );
  }

  private static buildAttachmentsFilter(): KueryNode | undefined {
    return combineFilters(
      [
        buildFilter({
          filters: [UserActionTypes.comment],
          field: 'type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
        buildFilter({
          filters: [AttachmentType.persistableState, AttachmentType.externalReference],
          field: 'payload.comment.type',
          operator: 'or',
          type: CASE_USER_ACTION_SAVED_OBJECT,
        }),
      ],
      NodeBuilderOperators.and
    );
  }

  private static buildAuthorFilter(author?: string): KueryNode | undefined {
    if (!author) {
      return undefined;
    }

    return buildFilter({
      filters: [author],
      field: 'created_by.username',
      operator: 'or',
      type: CASE_USER_ACTION_SAVED_OBJECT,
    });
  }

  private static buildGenericTypeFilter(type: UserActionType): KueryNode | undefined {
    return buildFilter({
      filters: [type],
      field: 'type',
      operator: 'or',
      type: CASE_USER_ACTION_SAVED_OBJECT,
    });
  }

  public async findStatusChanges({
    caseId,
    filter,
  }: {
    caseId: string;
    filter?: KueryNode;
  }): Promise<UserActionSavedObjectTransformed[]> {
    try {
      this.context.log.debug('Attempting to find status changes');

      const updateActionFilter = buildFilter({
        filters: UserActionActions.update,
        field: 'action',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const statusChangeFilter = buildFilter({
        filters: UserActionTypes.status,
        field: 'type',
        operator: 'or',
        type: CASE_USER_ACTION_SAVED_OBJECT,
      });

      const combinedFilters = combineFilters([updateActionFilter, statusChangeFilter, filter]);

      return await this.collectFromPIT({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        hasReference: { type: CASE_SAVED_OBJECT, id: caseId },
        sortField: defaultSortField,
        sortOrder: 'asc',
        filter: combinedFilters,
        perPage: MAX_DOCS_PER_PAGE,
      });
    } catch (error) {
      this.context.log.error(`Error finding status changes: ${error}`);
      throw error;
    }
  }

  private async collectFromPIT(
    options: SavedObjectsCreatePointInTimeFinderOptions
  ): Promise<UserActionSavedObjectTransformed[]> {
    const finder =
      this.context.unsecuredSavedObjectsClient.createPointInTimeFinder<UserActionPersistedAttributes>(
        options
      );

    let results: UserActionSavedObjectTransformed[] = [];

    for await (const batch of finder.find()) {
      results = results.concat(
        batch.saved_objects.map((so) => {
          const res = transformToExternalModel(so);
          return {
            ...res,
            attributes: decodeOrThrow(UserActionTransformedAttributesRt)(res.attributes),
          };
        })
      );
    }

    return results;
  }
}
