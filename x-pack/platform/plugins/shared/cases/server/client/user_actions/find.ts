/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KueryNode } from '@kbn/es-query';
import type {
  UserActionInternalFindRequest,
  UserActionFindResponse,
} from '../../../common/types/api';
import {
  UserActionInternalFindRequestRt,
  UserActionFindResponseRt,
} from '../../../common/types/api';
import { decodeWithExcessOrThrow, decodeOrThrow } from '../../common/runtime_types';
import type { CasesClientArgs } from '../types';
import type { UserActionFind } from './types';
import { Operations } from '../../authorization';
import { formatSavedObject, formatSavedObjects, matchesSearch } from './utils';
import { createCaseError } from '../../common/error';
import { asArray } from '../../common/utils';
import type { CasesClient } from '../client';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from '../../routes/api';

interface FindWithSearchParams {
  caseId: string;
  search: string;
  queryParams: Omit<UserActionInternalFindRequest, 'search'>;
  authorizationFilter?: KueryNode;
  ensureSavedObjectsAreAuthorized: (entities: Array<{ owner: string; id: string }>) => void;
  userActionService: CasesClientArgs['services']['userActionService'];
}

export const find = async (
  { caseId, params }: UserActionFind,
  casesClient: CasesClient,
  clientArgs: CasesClientArgs
): Promise<UserActionFindResponse> => {
  const {
    services: { userActionService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const types = asArray(params.types);

    const queryParams = decodeWithExcessOrThrow(UserActionInternalFindRequestRt)({
      ...params,
      types,
    });

    const [authorizationFilterRes] = await Promise.all([
      authorization.getAuthorizationFilter(Operations.findUserActions),
      casesClient.cases.resolve({ id: caseId, includeComments: false }),
    ]);

    const { filter: authorizationFilter, ensureSavedObjectsAreAuthorized } = authorizationFilterRes;

    if (queryParams.search) {
      const { search, ...rest } = queryParams;
      return findWithSearch({
        caseId,
        search,
        queryParams: rest,
        authorizationFilter,
        ensureSavedObjectsAreAuthorized,
        userActionService,
      });
    }

    const userActions = await userActionService.finder.find({
      caseId,
      ...queryParams,
      filter: authorizationFilter,
    });

    ensureSavedObjectsAreAuthorized(
      userActions.saved_objects.map((so) => ({ owner: so.attributes.owner, id: so.id }))
    );

    const res = {
      userActions: formatSavedObjects(userActions),
      page: userActions.page,
      perPage: userActions.per_page,
      total: userActions.total,
    };

    return decodeOrThrow(UserActionFindResponseRt)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to find user actions for case id: ${caseId}: ${error}`,
      error,
      logger,
    });
  }
};

const findWithSearch = async ({
  caseId,
  search,
  queryParams,
  authorizationFilter,
  ensureSavedObjectsAreAuthorized,
  userActionService,
}: FindWithSearchParams): Promise<UserActionFindResponse> => {
  const { page, perPage, ...findAllParams } = queryParams;

  const allUserActions = await userActionService.finder.findAll({
    caseId,
    ...findAllParams,
    filter: authorizationFilter,
  });

  ensureSavedObjectsAreAuthorized(
    allUserActions.map((so) => ({ owner: so.attributes.owner, id: so.id }))
  );

  const filtered = allUserActions.filter((so) => matchesSearch(so.attributes, search));

  const currentPage = page ?? DEFAULT_PAGE;
  const currentPerPage = perPage ?? DEFAULT_PER_PAGE;
  const start = (currentPage - 1) * currentPerPage;
  const paged = filtered.slice(start, start + currentPerPage);

  const res = {
    userActions: paged.map(formatSavedObject),
    page: currentPage,
    perPage: currentPerPage,
    total: filtered.length,
  };

  return decodeOrThrow(UserActionFindResponseRt)(res);
};
