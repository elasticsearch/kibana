/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { buildEsQuery } from '@kbn/es-query';
import type { ExpressionFunctionDefinition } from '@kbn/expressions-plugin/common';

import type { EqlSearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { RequestStatistics } from '@kbn/inspector-plugin/common';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { ISearchMethods } from '@kbn/search-types';
import type { KibanaContext } from '..';
import { getEsQueryConfig } from '../../es_query';
import type { DataViewsContract, UiSettingsCommon } from '../..';
import type { EqlRawResponse } from './eql_raw_response';

const name = 'eql';

type Input = KibanaContext | null;
type Output = Promise<EqlRawResponse>;

interface Arguments {
  query: string;
  index: string;
  size: number;
  field: string[];
}

export type EqlExpressionFunctionDefinition = ExpressionFunctionDefinition<
  typeof name,
  Input,
  Arguments,
  Output
>;

interface EqlStartDependencies {
  searchService: ISearchMethods;
  uiSettingsClient: UiSettingsCommon;
  dataViews: DataViewsContract;
}

export const getEqlFn = ({
  getStartDependencies,
}: {
  getStartDependencies: (getKibanaRequest: unknown) => Promise<EqlStartDependencies>;
}) => {
  const eql: EqlExpressionFunctionDefinition = {
    name,
    type: 'eql_raw_response',
    inputTypes: ['kibana_context', 'null'],
    allowCache: true,
    help: i18n.translate('data.search.eql.help', {
      defaultMessage: 'Run Elasticsearch request',
    }),
    args: {
      query: {
        types: ['string'],
        aliases: ['_', 'q', 'query'],
        help: i18n.translate('data.search.eql.q.help', {
          defaultMessage: 'Query DSL',
        }),
        required: true,
      },
      index: {
        types: ['string'],
        help: i18n.translate('data.search.eql.index.help', {
          defaultMessage: 'ElasticSearch index to query',
        }),
        required: true,
      },
      size: {
        types: ['number'],
        help: i18n.translate('data.search.eql.size.help', {
          defaultMessage: 'ElasticSearch searchAPI size parameter',
        }),
        default: 10,
      },
      field: {
        types: ['string'],
        help: i18n.translate('data.search.eql.field.help', {
          defaultMessage: 'List of fields to retrieve',
        }),
        multi: true,
        required: false,
      },
    },
    async fn(input, args, { inspectorAdapters, abortSignal, getKibanaRequest }) {
      const { searchService, uiSettingsClient, dataViews } = await getStartDependencies(
        getKibanaRequest
      );

      const dsl = {
        query: args.query,
        size: args.size,
        fields: args.field,
      } as EqlSearchRequest;

      if (input) {
        const dataview = args.index ? await dataViews.create({ title: args.index }) : undefined;
        const esQueryConfigs = getEsQueryConfig(uiSettingsClient as any);
        const query = buildEsQuery(
          dataview,
          input.query || [],
          input.filters || [],
          esQueryConfigs
        );

        dsl.filter = query;
      }

      if (!inspectorAdapters.requests) {
        inspectorAdapters.requests = new RequestAdapter();
      }

      const request = inspectorAdapters.requests.start(
        i18n.translate('data.search.dataRequest.title', {
          defaultMessage: 'Data',
        }),
        {
          description: i18n.translate('data.search.es_search.dataRequest.description', {
            defaultMessage:
              'This request queries Elasticsearch to fetch the data for the visualization.',
          }),
        }
      );

      request.stats({
        indexPattern: {
          label: i18n.translate('data.search.es_search.dataViewLabel', {
            defaultMessage: 'Data view',
          }),
          value: args.index,
          description: i18n.translate('data.search.es_search.indexPatternDescription', {
            defaultMessage: 'The data view that connected to the Elasticsearch indices.',
          }),
        },
      });

      try {
        const { rawResponse, requestParams } = await searchService.eql(
          {
            index: args.index,
            query: args.query,
            size: args.size,
            fields: args.field,
            filter: dsl.filter,
          },
          { abortSignal }
        );

        const stats: RequestStatistics = {};

        request.stats(stats).ok({ json: { rawResponse }, requestParams });
        request.json(dsl);

        return {
          type: 'eql_raw_response',
          body: rawResponse,
        };
      } catch (e) {
        request.error({ json: 'attributes' in e ? e.attributes : { message: e.message } });
        throw e;
      }
    },
  };
  return eql;
};
