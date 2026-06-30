/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { ACTION_POLICY_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import { AGENT_BUILDER_TAG } from '../../../agent_builder/common/constants';
import { TERMS_SIZE, bucketsToArray } from './constants';
import type { ActionPolicyStatsAggregations, ActionPolicyStatsResults } from './types';

export async function getActionPolicyStats(
  esClient: ElasticsearchClient
): Promise<ActionPolicyStatsResults> {
  const response = await esClient.search({
    index: ALERTING_CASES_SAVED_OBJECT_INDEX,
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ term: { type: ACTION_POLICY_SAVED_OBJECT_TYPE } }],
      },
    },
    // Runtime mappings for fields not indexed in the action policy mappings
    runtime_mappings: {
      ap_has_matcher: {
        type: 'boolean',
        script: {
          source: `
            def ap = params._source['${ACTION_POLICY_SAVED_OBJECT_TYPE}'];
            if (ap != null) {
              emit(ap['matcher'] != null);
            } else {
              emit(false);
            }
          `,
        },
      },
      ap_throttle_interval: {
        type: 'keyword',
        script: {
          source: `
            def ap = params._source['${ACTION_POLICY_SAVED_OBJECT_TYPE}'];
            if (ap != null) {
              def throttle = ap['throttle'];
              if (throttle != null) {
                def interval = throttle['interval'];
                if (interval != null) emit(interval);
              }
            }
          `,
        },
      },
      ap_group_by_count: {
        type: 'long',
        script: {
          source: `
            def ap = params._source['${ACTION_POLICY_SAVED_OBJECT_TYPE}'];
            if (ap != null) {
              def groupBy = ap['groupBy'];
              if (groupBy != null) emit((long) groupBy.size());
            }
          `,
        },
      },
      ap_destination_id: {
        type: 'keyword',
        script: {
          source: `
            def ap = params._source['${ACTION_POLICY_SAVED_OBJECT_TYPE}'];
            if (ap != null) {
              def destinations = ap['destinations'];
              if (destinations != null) {
                for (dest in destinations) {
                  if (dest != null && dest['id'] != null) {
                    emit(dest['id']);
                  }
                }
              }
            }
          `,
        },
      },
    },
    aggs: {
      unique_workflow_count: {
        cardinality: { field: 'ap_destination_id' },
      },
      count_with_matcher: {
        filter: { term: { ap_has_matcher: true } },
      },
      count_by_throttle_interval: {
        terms: { field: 'ap_throttle_interval', size: TERMS_SIZE },
      },
      count_with_group_by: {
        filter: { range: { ap_group_by_count: { gt: 0 } } },
      },
      avg_group_by_fields_count: {
        avg: { field: 'ap_group_by_count' },
      },
      count_agent_builder_assisted: {
        filter: {
          term: { [`${ACTION_POLICY_SAVED_OBJECT_TYPE}.tags`]: AGENT_BUILDER_TAG },
        },
      },
    },
  });

  const total =
    typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value ?? 0;

  const aggs = response.aggregations as unknown as ActionPolicyStatsAggregations | undefined;

  return {
    action_policies_count: total,
    action_policies_unique_workflow_count: aggs?.unique_workflow_count.value ?? 0,
    action_policies_count_with_matcher: aggs?.count_with_matcher.doc_count ?? 0,
    action_policies_count_agent_builder_assisted: aggs?.count_agent_builder_assisted.doc_count ?? 0,
    action_policies_count_with_group_by: aggs?.count_with_group_by.doc_count ?? 0,
    action_policies_avg_group_by_fields_count: aggs?.avg_group_by_fields_count.value ?? null,
    action_policies_count_by_throttle_interval: bucketsToArray(
      aggs?.count_by_throttle_interval.buckets
    ),
  };
}
