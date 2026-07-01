/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';
import { ecsFieldMap, alertFieldMap } from '@kbn/alerts-as-data-utils';
import type { OnlyEsQueryRuleParams } from './types';

export function isEsQueryRule(searchType: EsQueryRuleParams['searchType']) {
  return searchType === 'esQuery';
}

export function isSearchSourceRule(searchType: EsQueryRuleParams['searchType']) {
  return searchType === 'searchSource';
}

export function isEsqlQueryRule(searchType: EsQueryRuleParams['searchType']) {
  return searchType === 'esqlQuery';
}

export function getParsedQuery(queryParams: OnlyEsQueryRuleParams) {
  const { esQuery } = queryParams;

  let parsedQuery;
  try {
    parsedQuery = JSON.parse(esQuery);
  } catch (err) {
    throw new Error(getInvalidQueryError(esQuery));
  }

  if (parsedQuery && !parsedQuery.query) {
    throw new Error(getInvalidQueryError(esQuery));
  }

  return parsedQuery;
}

function getInvalidQueryError(query: string) {
  return i18n.translate('xpack.stackAlerts.esQuery.invalidQueryErrorMessage', {
    defaultMessage: 'invalid query specified: "{query}" - query must be JSON',
    values: {
      query,
    },
  });
}

export function checkForShardFailures(searchResult: SearchResponse<unknown>): string | undefined {
  const anyShardsFailed = searchResult?._shards?.failed ?? 0;
  if (anyShardsFailed > 0) {
    const errorMessage =
      searchResult?._shards?.failures?.[0]?.reason?.reason ||
      'Search returned partial results due to shard failures.';
    return errorMessage;
  }

  const anyClustersSkipped = searchResult?._clusters?.skipped ?? 0;
  if (anyClustersSkipped) {
    const details = searchResult?._clusters?.details ?? {};
    for (const detail of Object.values(details)) {
      const errorMessage =
        detail?.failures?.[0]?.reason?.caused_by?.reason ||
        'Search returned partial results due to skipped cluster errors.';
      return errorMessage;
    }
  }
}

export const getSourceFields = () => {
  const alertFields = Object.keys(alertFieldMap);
  return (
    Object.keys(ecsFieldMap)
      // exclude the alert fields that we don't want to override
      .filter((key) => !alertFields.includes(key))
      .map((key) => ({
        label: key,
        searchPath: key,
      }))
  );
};

/**
 * Reads source field values off a persisted alert document (hit) using the candidate
 * source-field list. Keys are stored as literal dotted strings in the alert _source,
 * so we use bracket access rather than lodash.get to avoid traversing nested paths.
 */
export const getSourceFieldsFromHit = (
  hit: Record<string, unknown> | undefined,
  sourceFieldsParams: Array<{ label: string; searchPath: string }>
): Record<string, string[]> => {
  if (!hit || sourceFieldsParams.length === 0) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const { label } of sourceFieldsParams) {
    const raw = hit[label];
    if (raw == null) {
      continue;
    }
    result[label] = Array.isArray(raw) ? (raw as unknown[]).map(String) : [String(raw)];
  }
  return result;
};
