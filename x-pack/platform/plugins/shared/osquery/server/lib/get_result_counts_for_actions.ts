/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { estypes } from '@elastic/elasticsearch';
import { chunk } from 'lodash';
import { ACTION_RESPONSES_DATA_STREAM_INDEX } from '../../common/constants';
import { buildIndexNameWithNamespace } from '../utils/build_index_name_with_namespace';
import { buildSpaceIdFilter } from '../utils/build_space_id_filter';
import { prefixIndexPatternsWithCcs } from '../utils/ccs_utils';

const MAX_ACTION_IDS_PER_BATCH = 1000;

export interface ResultCountsEntry {
  totalRows: number;
  respondedAgents: number;
  successfulAgents: number;
  errorAgents: number;
}

export type ResultCountsMap = Map<string, ResultCountsEntry>;

interface ActionResponseAggregation {
  action_ids: {
    buckets: Array<{
      key: string;
      doc_count: number;
      rows_count: { value: number };
      responses: {
        buckets: Array<{
          key: string;
          doc_count: number;
        }>;
      };
    }>;
  };
}

export const getResultCountsForActions = async (
  esClient: ElasticsearchClient,
  actionIds: string[],
  spaceId: string,
  integrationNamespaces: readonly string[] = ['default'],
  ccsEnabled = false
): Promise<ResultCountsMap> => {
  if (actionIds.length === 0) {
    return new Map();
  }

  const batches = chunk(actionIds, MAX_ACTION_IDS_PER_BATCH);

  const batchResults = await Promise.all(
    batches.map((batchIds) =>
      fetchResultCountsBatch(esClient, batchIds, spaceId, integrationNamespaces, ccsEnabled)
    )
  );

  const result: ResultCountsMap = new Map();
  for (const batchResult of batchResults) {
    for (const [actionId, counts] of batchResult) {
      result.set(actionId, counts);
    }
  }

  return result;
};

const fetchResultCountsBatch = async (
  esClient: ElasticsearchClient,
  actionIds: string[],
  spaceId: string,
  integrationNamespaces: readonly string[],
  ccsEnabled: boolean
): Promise<ResultCountsMap> => {
  const baseIndex = `${ACTION_RESPONSES_DATA_STREAM_INDEX}*`;
  const indexPattern =
    integrationNamespaces.length > 0
      ? integrationNamespaces
          .map((namespace) => buildIndexNameWithNamespace(baseIndex, namespace))
          .join(',')
      : baseIndex;
  const index = prefixIndexPatternsWithCcs(indexPattern, ccsEnabled);

  const response = await esClient.search<unknown, ActionResponseAggregation>({
    allow_no_indices: true,
    index,
    ignore_unavailable: true,
    size: 0,
    query: {
      bool: {
        filter: [{ terms: { action_id: actionIds } }, buildSpaceIdFilter(spaceId)],
      },
    },
    aggs: {
      action_ids: {
        terms: {
          field: 'action_id',
          size: actionIds.length,
        },
        aggs: {
          rows_count: {
            sum: {
              field: 'action_response.osquery.count',
            },
          },
          responses: {
            terms: {
              script: {
                lang: 'painless',
                source:
                  "if (doc['error.keyword'].size()==0) { return 'success' } else { return 'error' }",
              } as estypes.Script,
            },
          },
        },
      },
    },
  });

  const result: ResultCountsMap = new Map();
  const buckets = response.aggregations?.action_ids?.buckets ?? [];

  for (const bucket of buckets) {
    const successBucket = bucket.responses.buckets.find((b) => b.key === 'success');
    const errorBucket = bucket.responses.buckets.find((b) => b.key === 'error');

    result.set(bucket.key, {
      totalRows: bucket.rows_count.value ?? 0,
      respondedAgents: bucket.doc_count,
      successfulAgents: successBucket?.doc_count ?? 0,
      errorAgents: errorBucket?.doc_count ?? 0,
    });
  }

  for (const actionId of actionIds) {
    if (!result.has(actionId)) {
      result.set(actionId, {
        totalRows: 0,
        respondedAgents: 0,
        successfulAgents: 0,
        errorAgents: 0,
      });
    }
  }

  return result;
};
