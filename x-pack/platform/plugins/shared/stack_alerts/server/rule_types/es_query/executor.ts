/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import type { CoreSetup } from '@kbn/core/server';
import { getEcsGroupsFromFlattenGrouping } from '@kbn/alerting-rule-utils';
import {
  isGroupAggregation,
  isPerRowAggregation,
  UngroupedGroupId,
} from '@kbn/triggers-actions-ui-plugin/common';
import {
  ALERT_EVALUATION_THRESHOLD,
  ALERT_EVALUATION_VALUE,
  ALERT_GROUPING,
  ALERT_REASON,
  ALERT_URL,
} from '@kbn/rule-data-utils';

import { AlertsClientError } from '@kbn/alerting-plugin/server';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';

import { ComparatorFns } from '@kbn/response-ops-rule-params/common';
import { unflattenObject } from '@kbn/object-utils';
import type { EsQueryRuleActionContext } from './action_context';
import { addMessages, getContextConditionsDescription } from './action_context';
import type {
  ExecutorOptions,
  OnlyEsQueryRuleParams,
  OnlySearchSourceRuleParams,
  OnlyEsqlQueryRuleParams,
  EsQuerySourceFields,
} from './types';
import { ActionGroupId, ConditionMetAlertInstanceId } from '../../../common/es_query';
import { fetchEsQuery } from './lib/fetch_es_query';
import { fetchSearchSourceQuery } from './lib/fetch_search_source_query';
import { isEsqlQueryRule, isSearchSourceRule } from './util';
import { fetchEsqlQuery } from './lib/fetch_esql_query';
import { ALERT_EVALUATION_CONDITIONS, ALERT_TITLE } from '..';

export async function executor(
  core: CoreSetup,
  options: ExecutorOptions<EsQueryRuleParams>,
  sourceFields: EsQuerySourceFields
) {
  const searchSourceRule = isSearchSourceRule(options.params.searchType);
  const esqlQueryRule = isEsqlQueryRule(options.params.searchType);
  const {
    rule: { id: ruleId, name },
    services,
    params,
    state,
    spaceId,
    logger,
    getTimeRange,
  } = options;
  const { alertsClient, ruleResultService, scopedClusterClient, share } = services;

  if (!alertsClient) {
    throw new AlertsClientError();
  }
  const currentTimestamp = new Date().toISOString();
  const spacePrefix = spaceId !== 'default' ? spaceId : '';
  const alertLimit = alertsClient.getAlertLimitValue();
  const compareFn = ComparatorFns.get(params.thresholdComparator);
  if (compareFn == null) {
    throw new Error(getInvalidComparatorError(params.thresholdComparator));
  }
  const isGroupAgg =
    isGroupAggregation(params.termField) || (esqlQueryRule && isPerRowAggregation(params.groupBy));
  // For ungrouped queries, we run the configured query during each rule run, get a hit count
  // and retrieve up to params.size hits. We evaluate the threshold condition using the
  // value of the hit count. If the threshold condition is met, the hits are counted
  // toward the query match and we update the rule state with the timestamp of the latest hit.
  // In the next run of the rule, the latestTimestamp will be used to gate the query in order to
  // avoid counting a document multiple times.
  // latestTimestamp will be ignored if set for grouped queries
  let latestTimestamp: string | undefined = tryToParseAsDate(state.latestTimestamp);
  const { dateStart, dateEnd } = getTimeRange(`${params.timeWindowSize}${params.timeWindowUnit}`);

  const { parsedResults, link, index } = searchSourceRule
    ? await fetchSearchSourceQuery({
        ruleId,
        alertLimit,
        params: params as OnlySearchSourceRuleParams,
        latestTimestamp,
        spacePrefix,
        services: {
          share,
          getSearchSourceClient: services.getSearchSourceClient,
          logger,
          getDataViews: services.getDataViews,
          ruleResultService,
        },
        dateStart,
        dateEnd,
        sourceFields,
      })
    : esqlQueryRule
    ? await fetchEsqlQuery({
        ruleId,
        alertLimit,
        params: params as OnlyEsqlQueryRuleParams,
        spacePrefix,
        services: {
          share,
          scopedClusterClient,
          logger,
          ruleResultService,
        },
        dateStart,
        dateEnd,
        sourceFields,
      })
    : await fetchEsQuery({
        ruleId,
        name,
        alertLimit,
        params: params as OnlyEsQueryRuleParams,
        timestamp: latestTimestamp,
        spacePrefix,
        services: {
          share,
          scopedClusterClient,
          logger,
          ruleResultService,
        },
        dateStart,
        dateEnd,
        sourceFields,
      });

  const unmetGroupValues: Record<string, number> = {};
  for (const result of parsedResults.results) {
    const groupingObject = result.groupingObject
      ? unflattenObject(result.groupingObject)
      : undefined;
    const alertId = result.group;
    const value = result.value ?? result.count;

    // group aggregations use the bucket selector agg to compare conditions
    // within the ES query, so only 'met' results are returned, therefore we don't need
    // to use the compareFn
    const met = isGroupAgg ? true : compareFn(value, params.threshold);
    if (!met) {
      unmetGroupValues[alertId] = value;
      continue;
    }
    const baseContext: Omit<EsQueryRuleActionContext, 'conditions'> = {
      title: name,
      date: currentTimestamp,
      value,
      hits: result.hits,
      link,
      sourceFields: result.sourceFields,
      grouping: groupingObject,
    };
    const baseActiveContext: EsQueryRuleActionContext = {
      ...baseContext,
      conditions: getContextConditionsDescription({
        searchType: params.searchType,
        comparator: params.thresholdComparator,
        threshold: params.threshold,
        aggType: params.aggType,
        aggField: params.aggField,
        ...(isGroupAgg ? { group: alertId } : {}),
      }),
    } as EsQueryRuleActionContext;

    const actionContext = addMessages({
      ruleName: name,
      baseContext: baseActiveContext,
      params,
      ...(isGroupAgg ? { group: alertId } : {}),
      index,
    });

    const id = alertId === UngroupedGroupId && !isGroupAgg ? ConditionMetAlertInstanceId : alertId;
    const ecsGroups = getEcsGroupsFromFlattenGrouping(result.groupingObject);

    alertsClient.report({
      id,
      actionGroup: ActionGroupId,
      state: { latestTimestamp, dateStart, dateEnd },
      context: actionContext,
      payload: {
        [ALERT_URL]: actionContext.link,
        [ALERT_REASON]: actionContext.message,
        [ALERT_TITLE]: actionContext.title,
        [ALERT_EVALUATION_CONDITIONS]: actionContext.conditions,
        [ALERT_EVALUATION_VALUE]: `${actionContext.value}`,
        [ALERT_EVALUATION_THRESHOLD]: params.threshold?.length === 1 ? params.threshold[0] : null,
        [ALERT_GROUPING]: groupingObject,
        ...ecsGroups,
        ...actionContext.sourceFields,
      },
    });
    if (!isGroupAgg) {
      // update the timestamp based on the current search results
      const firstValidTimefieldSort = getValidTimefieldSort(
        // @ts-expect-error `sort` now depends on `FieldValue` that is too broad
        result.hits.find((hit) => getValidTimefieldSort(hit.sort))?.sort
      );
      if (firstValidTimefieldSort) {
        latestTimestamp = firstValidTimefieldSort;
      }
    }
  }
  alertsClient.setAlertLimitReached(parsedResults.truncated);

  const { getRecoveredAlerts } = alertsClient;

  const recoveredAlerts = getRecoveredAlerts() ?? [];

  for (const recoveredAlert of recoveredAlerts) {
    const alertId = recoveredAlert.alert.getId();

    const baseRecoveryContext: EsQueryRuleActionContext = {
      title: name,
      date: currentTimestamp,
      value: unmetGroupValues[alertId] ?? 0,
      hits: [],
      link,
      conditions: getContextConditionsDescription({
        searchType: params.searchType,
        comparator: params.thresholdComparator,
        threshold: params.threshold,
        isRecovered: true,
        aggType: params.aggType,
        aggField: params.aggField,
        ...(isGroupAgg ? { group: alertId } : {}),
      }),
      sourceFields: [],
      grouping: recoveredAlert.hit?.[ALERT_GROUPING],
    } as EsQueryRuleActionContext;
    const recoveryContext = addMessages({
      ruleName: name,
      baseContext: baseRecoveryContext,
      params,
      isRecovered: true,
      ...(isGroupAgg ? { group: alertId } : {}),
      index,
    });
    alertsClient.setAlertData({
      id: alertId,
      context: recoveryContext,
      payload: {
        [ALERT_URL]: recoveryContext.link,
        [ALERT_REASON]: recoveryContext.message,
        [ALERT_TITLE]: recoveryContext.title,
        [ALERT_EVALUATION_CONDITIONS]: recoveryContext.conditions,
        [ALERT_EVALUATION_VALUE]: `${recoveryContext.value}`,
        [ALERT_EVALUATION_THRESHOLD]: params.threshold?.length === 1 ? params.threshold[0] : null,
      },
    });
  }

  return { state: { latestTimestamp } };
}

export function getValidTimefieldSort(
  sortValues: Array<string | number | null> = []
): undefined | string {
  for (const sortValue of sortValues) {
    const sortDate = tryToParseAsDate(sortValue);
    if (sortDate) {
      return sortDate;
    }
  }
}

export function tryToParseAsDate(sortValue?: string | number | null): undefined | string {
  const sortDate = typeof sortValue === 'string' ? Date.parse(sortValue) : sortValue;
  if (sortDate && !isNaN(sortDate)) {
    return new Date(sortDate).toISOString();
  }
}

export function getInvalidComparatorError(comparator: string) {
  return i18n.translate('xpack.stackAlerts.esQuery.invalidComparatorErrorMessage', {
    defaultMessage: 'invalid thresholdComparator specified: {comparator}',
    values: {
      comparator,
    },
  });
}
