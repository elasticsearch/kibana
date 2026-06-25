/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { map, mergeMap, forkJoin, from, of } from 'rxjs';
import type { ISearchStrategy, PluginStart } from '@kbn/data-plugin/server';
import { shimHitsTotal } from '@kbn/data-plugin/server';
import { ENHANCED_ES_SEARCH_STRATEGY } from '@kbn/data-plugin/common';
import type { CoreStart } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { ACTION_RESPONSES_DATA_STREAM_INDEX, ACTIONS_INDEX } from '../../../common/constants';
import { enforceSpaceScope } from './enforce_space_scope';
import type {
  FactoryQueryTypes,
  StrategyResponseType,
  StrategyRequestType,
} from '../../../common/search_strategy/osquery';
import { OsqueryQueries } from '../../../common/search_strategy/osquery';
import { osqueryFactory } from './factory';
import type { OsqueryFactory } from './factory/types';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

export const osquerySearchStrategyProvider = <T extends FactoryQueryTypes>(
  data: PluginStart,
  esClient: CoreStart['elasticsearch']['client']
): ISearchStrategy<StrategyRequestType<T>, StrategyResponseType<T>> => {
  let es: typeof data.search.searchAsInternalUser;

  return {
    search: (request, options, deps) => {
      if (request.factoryQueryType == null) {
        throw new Error('factoryQueryType is required');
      }

      const queryFactory: OsqueryFactory<T> = osqueryFactory[request.factoryQueryType];

      return forkJoin({
        actionsIndexExists: esClient.asInternalUser.indices.exists({
          index: `${ACTIONS_INDEX}*`,
        }),
        newDataStreamIndexExists: esClient.asInternalUser.indices.exists({
          index: `${ACTION_RESPONSES_DATA_STREAM_INDEX}*`,
          allow_no_indices: false,
          expand_wildcards: 'all',
        }),
        ccsEnabled: hasConnectedRemoteClusters(esClient.asInternalUser),
      }).pipe(
        mergeMap(({ actionsIndexExists, newDataStreamIndexExists, ccsEnabled }) => {
          const strictRequest = {
            factoryQueryType: request.factoryQueryType,
            kuery: request.kuery,
            ...('pagination' in request ? { pagination: request.pagination } : {}),
            ...('sort' in request ? { sort: request.sort } : {}),
            ...('actionId' in request ? { actionId: request.actionId } : {}),
            ...('startDate' in request ? { startDate: request.startDate } : {}),
            ...('agentId' in request ? { agentId: request.agentId } : {}),
            ...('agentIds' in request ? { agentIds: request.agentIds } : {}),
            ...('policyIds' in request ? { policyIds: request.policyIds } : {}),
            ...('spaceId' in request ? { spaceId: request.spaceId } : {}),
            ...('integrationNamespaces' in request
              ? { integrationNamespaces: request.integrationNamespaces }
              : {}),
            ...('scheduleId' in request ? { scheduleId: request.scheduleId } : {}),
            ...('executionCount' in request ? { executionCount: request.executionCount } : {}),
            ...('esFilters' in request ? { esFilters: request.esFilters } : {}),
            // exportResults factory fields — baseFilter is required and unique to this
            // factory type, so its presence is a reliable discriminator for all six fields.
            ...('baseFilter' in request
              ? {
                  baseFilter: request.baseFilter,
                  pit: 'pit' in request ? request.pit : undefined,
                  searchAfter: 'searchAfter' in request ? request.searchAfter : undefined,
                  size: 'size' in request ? request.size : undefined,
                  ecsMapping: 'ecsMapping' in request ? request.ecsMapping : undefined,
                  trackTotalHits: 'trackTotalHits' in request ? request.trackTotalHits : undefined,
                }
              : {}),
          } as StrategyRequestType<T>;

          const spaceId =
            ('spaceId' in strictRequest && (strictRequest as { spaceId?: string }).spaceId) ||
            DEFAULT_SPACE_ID;

          const dsl = enforceSpaceScope(
            queryFactory.buildDsl({
              ...strictRequest,
              spaceId,
              componentTemplateExists: actionsIndexExists,
              ccsEnabled,
            } as StrategyRequestType<T>),
            spaceId
          );

          // Select internal client for all osquery indices that require it.
          // The 'osquery_manager' substring matches both local and CCS-prefixed patterns
          // (e.g. '*:logs-osquery_manager.action...').
          es =
            dsl.index?.includes('fleet') || dsl.index?.includes('osquery_manager')
              ? data.search.searchAsInternalUser
              : data.search.getSearchStrategy(ENHANCED_ES_SEARCH_STRATEGY);

          // When a PIT is present ES rejects requests that also specify `index`,
          // `allow_no_indices`, or `ignore_unavailable` (the PIT already encodes
          // the index scope). Strip those fields from the params before the call
          // while keeping `dsl.index` above for client-selection routing.
          const esParams = dsl.pit
            ? {
                ...dsl,
                index: undefined,
                allow_no_indices: undefined,
                ignore_unavailable: undefined,
              }
            : dsl;

          const searchLegacyIndex$ = es.search(
            {
              ...strictRequest,
              params: esParams,
            },
            options,
            deps
          );

          // With the introduction of a new DS that sends data directly from an agent into the new index
          // logs-osquery_manager.action.responses-default, instead of the old index .logs-osquery_manager.action.responses-default
          // which was populated by a transform, we now need to check both places for results.
          // The new index was introduced in integration package 1.12, so users running earlier versions won't have it.

          return searchLegacyIndex$.pipe(
            mergeMap((legacyIndexResponse) => {
              if (
                request.factoryQueryType === OsqueryQueries.actionResults &&
                (newDataStreamIndexExists || ccsEnabled)
              ) {
                const dataStreamDsl = enforceSpaceScope(
                  queryFactory.buildDsl({
                    ...strictRequest,
                    spaceId,
                    componentTemplateExists: actionsIndexExists,
                    ccsEnabled,
                    useNewDataStream: true,
                  } as StrategyRequestType<T>),
                  spaceId
                );

                return from(
                  es.search(
                    {
                      ...strictRequest,
                      params: dataStreamDsl,
                    },
                    options,
                    deps
                  )
                ).pipe(
                  map((newDataStreamIndexResponse) => {
                    if (newDataStreamIndexResponse.rawResponse.hits.total) {
                      return newDataStreamIndexResponse;
                    }

                    return legacyIndexResponse;
                  })
                );
              }

              return of(legacyIndexResponse);
            }),
            map((response) => ({
              ...response,
              ...{
                rawResponse: shimHitsTotal(response.rawResponse, options),
              },
              total: response.rawResponse.hits.total as number,
            })),
            mergeMap((esSearchRes) => queryFactory.parse(request, esSearchRes))
          );
        })
      );
    },
    cancel: async (id, options, deps) => {
      if (es?.cancel) {
        return es.cancel(id, options, deps);
      }
    },
  };
};
