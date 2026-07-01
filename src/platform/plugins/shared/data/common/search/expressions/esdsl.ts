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

import type { ISearchMethods } from '@kbn/search-types';
import type { RequestStatistics } from '@kbn/inspector-plugin/common';
import { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { EsRawResponse } from './es_raw_response';

import type { KibanaContext } from '..';
import { getEsQueryConfig } from '../../es_query';
import type { UiSettingsCommon } from '../..';

const name = 'esdsl';

type Input = KibanaContext | null;
type Output = Promise<EsRawResponse>;

interface Arguments {
  dsl: string;
  index: string;
  size: number;
}

export type EsdslExpressionFunctionDefinition = ExpressionFunctionDefinition<
  typeof name,
  Input,
  Arguments,
  Output
>;

interface EsdslStartDependencies {
  searchService: ISearchMethods;
  uiSettingsClient: UiSettingsCommon;
}

export const getEsdslFn = ({
  getStartDependencies,
}: {
  getStartDependencies: (getKibanaRequest: unknown) => Promise<EsdslStartDependencies>;
}) => {
  const esdsl: EsdslExpressionFunctionDefinition = {
    name,
    type: 'es_raw_response',
    inputTypes: ['kibana_context', 'null'],
    allowCache: true,
    help: i18n.translate('data.search.esdsl.help', {
      defaultMessage: 'Run Elasticsearch request',
    }),
    args: {
      dsl: {
        types: ['string'],
        aliases: ['_', 'q', 'query'],
        help: i18n.translate('data.search.esdsl.q.help', {
          defaultMessage: 'Query DSL',
        }),
        required: true,
      },
      index: {
        types: ['string'],
        help: i18n.translate('data.search.esdsl.index.help', {
          defaultMessage: 'ElasticSearch index to query',
        }),
        required: true,
      },
      size: {
        types: ['number'],
        help: i18n.translate('data.search.esdsl.size.help', {
          defaultMessage: 'ElasticSearch searchAPI size parameter',
        }),
        default: 10,
      },
    },
    async fn(input, args, { inspectorAdapters, abortSignal, getKibanaRequest }) {
      const { searchService, uiSettingsClient } = await getStartDependencies(getKibanaRequest);

      const dsl = JSON.parse(args.dsl);

      if (input) {
        const esQueryConfigs = getEsQueryConfig(uiSettingsClient as any);
        const query = buildEsQuery(
          undefined, //        args.index,
          input.query || [],
          input.filters || [],
          esQueryConfigs
        );

        if (dsl.query) {
          query.bool.must.push(dsl.query);
        }

        dsl.query = query;
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
        const { rawResponse, requestParams } = await searchService.dsl(
          {
            index: args.index,
            size: args.size,
            ...dsl,
          },
          { abortSignal }
        );

        const stats: RequestStatistics = {};

        if (rawResponse?.took) {
          stats.queryTime = {
            label: i18n.translate('data.search.es_search.queryTimeLabel', {
              defaultMessage: 'Query time',
            }),
            value: i18n.translate('data.search.es_search.queryTimeValue', {
              defaultMessage: '{queryTime}ms',
              values: { queryTime: rawResponse.took },
            }),
            description: i18n.translate('data.search.es_search.queryTimeDescription', {
              defaultMessage:
                'The time it took to process the query. ' +
                'Does not include the time to send the request or parse it in the browser.',
            }),
          };
        }

        if (rawResponse?.hits) {
          stats.hitsTotal = {
            label: i18n.translate('data.search.es_search.hitsTotalLabel', {
              defaultMessage: 'Hits (total)',
            }),
            value: `${rawResponse.hits.total}`,
            description: i18n.translate('data.search.es_search.hitsTotalDescription', {
              defaultMessage: 'The number of documents that match the query.',
            }),
          };

          stats.hits = {
            label: i18n.translate('data.search.es_search.hitsLabel', {
              defaultMessage: 'Hits',
            }),
            value: `${rawResponse.hits.hits.length}`,
            description: i18n.translate('data.search.es_search.hitsDescription', {
              defaultMessage: 'The number of documents returned by the query.',
            }),
          };
        }

        request.stats(stats).ok({ json: rawResponse, requestParams });
        request.json(dsl);

        return {
          type: 'es_raw_response',
          body: rawResponse,
        };
      } catch (e) {
        request.error({ json: 'attributes' in e ? e.attributes : { message: e.message } });
        throw e;
      }
    },
  };
  return esdsl;
};
