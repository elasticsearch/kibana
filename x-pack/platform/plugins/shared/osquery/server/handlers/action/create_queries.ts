/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, isNumber, map, pickBy } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import type { ParsedTechnicalFields } from '@kbn/rule-registry-plugin/common';
import type { SavedObjectsClient } from '@kbn/core-saved-objects-api-server-internal';
import type { CreateLiveQueryRequestBodySchema } from '../../../common/api';
import { PARAMETER_NOT_FOUND, SAVED_QUERY_NOT_FOUND } from '../../../common/translations/errors';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import {
  containsDynamicQuery,
  replaceParamsQuery,
} from '../../../common/utils/replace_params_query';
import { isSavedQueryPrebuilt } from '../../routes/saved_query/utils';
import { lookupSavedQuery, type ResolvedQueryReference } from '../../lib/resolve_query_reference';
import { CustomHttpRequestError } from '../../common/error';

interface CreateDynamicQueriesParams {
  params: CreateLiveQueryRequestBodySchema;
  alertData?: ParsedTechnicalFields & { _index: string };
  agents: string[];
  osqueryContext: OsqueryAppContext;
  error?: string;
  spaceId: string;
  spaceScopedClient: SavedObjectsClient;
  /** When true, dispatch stored SO content even if the caller supplied a query. */
  useStoredQuery?: boolean;
  /** Authz-resolved saved query; when set, skip a second SO lookup. */
  storedQuery?: ResolvedQueryReference;
  /**
   * Rule runs have no caller to return a status code to — a throw here is swallowed by
   * `osqueryResponseAction` and the run still reports success. Record the failure on the
   * action document instead so it surfaces in the alert's Osquery Results tab.
   */
  reportErrorsOnAction?: boolean;
}

export const createDynamicQueries = async ({
  params,
  alertData,
  agents,
  osqueryContext,
  error,
  spaceId,
  spaceScopedClient,
  useStoredQuery,
  storedQuery,
  reportErrorsOnAction,
}: CreateDynamicQueriesParams) => {
  const savedQueryId = params.saved_query_id?.trim();
  const enforceStoredSavedQuery = Boolean(useStoredQuery && savedQueryId);
  const storedSavedQuery =
    storedQuery ??
    (params.queries?.length && !enforceStoredSavedQuery
      ? undefined
      : await lookupSavedQuery(spaceScopedClient, savedQueryId ?? ''));

  let unresolvedSavedQueryError: string | undefined;

  if (enforceStoredSavedQuery && params.queries?.length) {
    // An action carrying both a `saved_query_id` and a `queries[]` is ambiguous: the saved
    // query wins, so the other entries would be dropped without a trace. Only rules created
    // through the API or import can reach this, and they are never re-validated at run time.
    osqueryContext.logFactory
      .get('createDynamicQueries')
      .warn(
        `Response action specifies both saved_query_id [${savedQueryId}] and ${params.queries.length} inline queries; dispatching the saved query only.`
      );
  }

  if (enforceStoredSavedQuery && !storedSavedQuery) {
    if (!reportErrorsOnAction) {
      throw new CustomHttpRequestError(`Saved query [${savedQueryId}] could not be resolved`, 400);
    }

    unresolvedSavedQueryError = SAVED_QUERY_NOT_FOUND;
  }

  // Never fall back to caller-supplied SQL when the stored query it named is gone.
  const effectiveError = error ?? unresolvedSavedQueryError;

  const query = unresolvedSavedQueryError
    ? undefined
    : useStoredQuery
    ? storedSavedQuery?.query ?? params.query
    : params.query ?? storedSavedQuery?.query;
  // True when the SQL below came from the saved object rather than the caller.
  const isStoredQueryDispatched = Boolean(useStoredQuery && storedSavedQuery?.query);
  // When the stored SQL is what gets dispatched, the stored mapping has to travel with it: a
  // mapping describes how that query's columns map to ECS, so pairing stored SQL with an
  // unrelated caller mapping yields mis-shaped results. The rule-action form defaults
  // `ecs_mapping` to `{}`, which is not `undefined`, so an empty caller mapping must be treated
  // as "not set" rather than as an intentional override or the saved query's own mapping would
  // never reach the agent from a rule.
  const suppliedEcsMapping = isEmpty(params.ecs_mapping) ? undefined : params.ecs_mapping;
  const ecsMapping = isStoredQueryDispatched
    ? storedSavedQuery?.ecs_mapping ?? suppliedEcsMapping
    : suppliedEcsMapping ?? storedSavedQuery?.ecs_mapping;
  const prebuiltId = storedSavedQuery?.savedObjectId ?? savedQueryId;

  if (params.queries?.length && !enforceStoredSavedQuery) {
    return map(params.queries, ({ query: packQuery, ...restQuery }) => {
      const replacedQuery = replacedQueries(packQuery, alertData);

      return pickBy(
        {
          ...replacedQuery,
          ...restQuery,
          ...(effectiveError ? { error: effectiveError } : {}),
          action_id: uuidv4(),
          alert_ids: params.alert_ids,
          agents,
        },
        (value) => !isEmpty(value) || value === true || isNumber(value)
      );
    });
  }

  return [
    pickBy(
      {
        action_id: uuidv4(),
        id: uuidv4(),
        ...replacedQueries(query, alertData, isStoredQueryDispatched),
        saved_query_id: params.saved_query_id,
        saved_query_prebuilt: prebuiltId
          ? await isSavedQueryPrebuilt(
              osqueryContext.service.getPackageService()?.asInternalUser,
              prebuiltId,
              spaceScopedClient,
              spaceId
            )
          : undefined,
        ecs_mapping: ecsMapping,
        alert_ids: params.alert_ids,
        timeout: params.timeout,
        agents,
        ...(effectiveError ? { error: effectiveError } : {}),
      },
      (value) => !isEmpty(value) || isNumber(value)
    ),
  ];
};

export const replacedQueries = (
  query: string | undefined,
  alertData?: ParsedTechnicalFields & { _index: string },
  /**
   * Set for stored (saved-query / pack) content. Rule-run resolves the stored SQL only after
   * the caller already decided whether this run is parameterized, so a template can reach here
   * with no alert context; flag it instead of dispatching literal `{{...}}` to the agent.
   * Ad-hoc `writeLiveQueries` SQL is left as-is — sending a template there is the caller's call.
   */
  requireSubstitution = false
): { query: string | undefined; error?: string } => {
  if (alertData && query) {
    const { result, skipped } = replaceParamsQuery(query, alertData);

    return {
      query: result,
      ...(skipped
        ? {
            error: PARAMETER_NOT_FOUND,
          }
        : {}),
    };
  }

  if (requireSubstitution && query && containsDynamicQuery(query)) {
    return { query, error: PARAMETER_NOT_FOUND };
  }

  return { query };
};
