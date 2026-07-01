/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual, uniqBy } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { ExecutionContext } from '@kbn/expressions-plugin/common';
import type { Filter } from '@kbn/es-query';
import { fromCombinedFilter } from '@kbn/es-query';
import type { Query } from '@kbn/es-query';
import { uniqFilters } from '@kbn/es-query';
import { unboxExpressionValue } from '@kbn/expressions-plugin/common';
import type { SavedObjectReference } from '@kbn/core/server';
import type { ExpressionFunctionKibanaContext } from '@kbn/data-plugin/common';
import type { SavedSearch } from '../types';

export interface KibanaContextStartDependencies {
  getSavedSearch: (id: string) => Promise<SavedSearch>;
}

const mergeQueries = (first: Query | Query[] = [], second: Query | Query[]) =>
  uniqBy<Query>(
    [...(Array.isArray(first) ? first : [first]), ...(Array.isArray(second) ? second : [second])],
    (n) => JSON.stringify(n.query)
  );

export const getKibanaContextFn = (
  getStartDependencies: (
    getKibanaRequest: ExecutionContext['getKibanaRequest']
  ) => Promise<KibanaContextStartDependencies>
) => {
  const kibanaContextFunction: ExpressionFunctionKibanaContext = {
    name: 'kibana_context',
    type: 'kibana_context',
    inputTypes: ['kibana_context', 'null'],
    help: i18n.translate('savedSearch.kibana_context.help', {
      defaultMessage: 'Updates kibana global context',
    }),
    args: {
      q: {
        types: ['kibana_query', 'null'],
        multi: true,
        aliases: ['query', '_'],
        help: i18n.translate('savedSearch.kibana_context.q.help', {
          defaultMessage: 'Specify Kibana free form text query',
        }),
      },
      filters: {
        types: ['kibana_filter', 'null'],
        multi: true,
        help: i18n.translate('savedSearch.kibana_context.filters.help', {
          defaultMessage: 'Specify Kibana generic filters',
        }),
      },
      timeRange: {
        types: ['timerange', 'null'],
        default: null,
        help: i18n.translate('savedSearch.kibana_context.timeRange.help', {
          defaultMessage: 'Specify Kibana time range filter',
        }),
      },
      savedSearchId: {
        types: ['string', 'null'],
        default: null,
        help: i18n.translate('savedSearch.kibana_context.savedSearchId.help', {
          defaultMessage: 'Specify saved search ID to be used for queries and filters',
        }),
      },
    },

    extract(state) {
      const references: SavedObjectReference[] = [];
      if (state.savedSearchId.length && typeof state.savedSearchId[0] === 'string') {
        const refName = 'kibana_context.savedSearchId';
        references.push({
          name: refName,
          type: 'search',
          id: state.savedSearchId[0] as string,
        });
        return {
          state: {
            ...state,
            savedSearchId: [refName],
          },
          references,
        };
      }
      return { state, references };
    },

    inject(state, references) {
      const reference = references.find((r) => r.name === 'kibana_context.savedSearchId');
      if (reference) {
        state.savedSearchId[0] = reference.id;
      }
      return state;
    },

    async fn(input, args, { getKibanaRequest }) {
      const { getSavedSearch } = await getStartDependencies(getKibanaRequest);

      const timeRange = args.timeRange || input?.timeRange;
      let queries = mergeQueries(input?.query, args?.q?.filter(Boolean) || []);
      const filterFromArgs = (args?.filters?.map(unboxExpressionValue) || []) as Filter[];

      let filters = [...(input?.filters || [])];

      if (args.savedSearchId) {
        const obj = await getSavedSearch(args.savedSearchId);
        const { query, filter } = obj.searchSource.getFields();

        if (query) {
          queries = mergeQueries(queries, query as Query);
        }
        if (filter) {
          filters = [...filters, ...(Array.isArray(filter) ? filter : [filter])] as Filter[];
        }
      }
      const uniqueArgFilters = filterFromArgs.filter(
        (argF) =>
          !filters.some((f) => {
            return isEqual(fromCombinedFilter(f).query, argF.query);
          })
      );

      filters = [...filters, ...uniqueArgFilters];

      return {
        type: 'kibana_context',
        query: queries,
        esqlVariables: input?.esqlVariables,
        filters: uniqFilters(filters.filter((f: Filter) => !f.meta?.disabled)),
        timeRange,
        projectRouting: input?.projectRouting,
        useApproximation: input?.useApproximation,
      };
    },
  };
  return kibanaContextFunction;
};
