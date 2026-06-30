/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregationContainer,
  SortResults,
} from '@elastic/elasticsearch/lib/api/types';
import type { FindResult, RulesClient } from '@kbn/alerting-plugin/server';
import type { FindRulesSortField } from '../../../../../../common/api/detection_engine/rule_management';

import type { Page, PerPage, SortOrder } from '../../../../../../common/api/detection_engine';

import type { RuleParams } from '../../../rule_schema';
import { enrichFilterWithRuleTypeMapping } from './enrich_filter_with_rule_type_mappings';
import { enrichFilterWithRuleIds } from './enrich_filter_with_rule_ids';
import { transformSortField } from './transform_sort_field';

interface HasReferences {
  type: string;
  id: string;
}

export interface FindRuleOptions {
  rulesClient: RulesClient;
  filter: string | undefined;
  fields?: string[];
  sortField: FindRulesSortField | undefined;
  sortOrder: SortOrder | undefined;
  page: Page | undefined;
  perPage: PerPage | undefined;
  searchAfter?: SortResults;
  hasReference?: HasReferences | undefined;
  ruleIds?: string[] | undefined;
  aggregations?: Record<string, AggregationsAggregationContainer>;
  search?: string;
  searchFields?: string[];
}

export const findRules = ({
  rulesClient,
  perPage,
  page,
  fields,
  filter,
  sortField,
  sortOrder,
  searchAfter,
  hasReference,
  aggregations,
  ruleIds,
  search,
  searchFields,
}: FindRuleOptions): Promise<FindResult<RuleParams>> => {
  return rulesClient.find({
    options: {
      fields,
      page,
      perPage,
      filter: enrichFilterWithRuleTypeMapping(enrichFilterWithRuleIds(filter, ruleIds)),
      sortOrder,
      sortField: transformSortField(sortField),
      searchAfter,
      hasReference,
      aggs: aggregations,
      search,
      searchFields,
    },
  });
};
