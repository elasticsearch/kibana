/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import type { AlertInstanceContext } from '@kbn/alerting-plugin/server';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';
import type { FieldsObject } from '@kbn/alerting-rule-utils';
import type { Comparator } from '../../../common/comparator_types';
import { getHumanReadableComparator } from '../../../common';
import { isEsqlQueryRule } from './util';
import { isSearchSourceRule } from './util';

// rule type context provided to actions
export interface ActionContext extends EsQueryRuleActionContext {
  // a short pre-constructed message which may be used in an action field
  title: string;
  // a longer pre-constructed message which may be used in an action field
  message: string;
}

export interface EsQueryRuleActionContext extends AlertInstanceContext {
  // the date the rule was run as an ISO date
  date: string;
  // the value that met the threshold
  value: number;
  // threshold conditions
  conditions: string;
  // query matches
  hits: estypes.SearchHit[];
  // a link to see records that triggered the rule for Discover rule
  // a link which navigates to stack management in case of Elastic query rule
  link: string;
  sourceFields: Record<string, string[]>;
  grouping?: FieldsObject;
}

interface AddMessagesOpts {
  ruleName: string;
  baseContext: EsQueryRuleActionContext;
  params: EsQueryRuleParams;
  group?: string;
  isRecovered?: boolean;
  index: string[] | null;
}
export function addMessages({
  ruleName,
  baseContext,
  params,
  group,
  isRecovered = false,
  index,
}: AddMessagesOpts): ActionContext {
  const title = i18n.translate('xpack.stackAlerts.esQuery.alertTypeContextSubjectTitle', {
    defaultMessage: `rule ''{name}'' {verb}`,
    values: {
      name: ruleName,
      verb: isRecovered ? 'recovered' : `matched query${group ? ` for group ${group}` : ''}`,
    },
  });

  const window = `${params.timeWindowSize}${params.timeWindowUnit}`;
  const message = i18n.translate('xpack.stackAlerts.esQuery.alertTypeContextReasonDescription', {
    defaultMessage: `Document count is {value} in the last {window}{verb}{index}. Alert when {comparator} {threshold}.`,
    values: {
      value: baseContext.value,
      window,
      verb: group ? ` for ${group}` : '',
      comparator: getHumanReadableComparator(params.thresholdComparator),
      threshold: params.threshold.join(' and '),
      index: index
        ? ` in ${index.join(', ')} ${
            isSearchSourceRule(params.searchType)
              ? 'data view'
              : index.length === 1
              ? 'index'
              : 'indices'
          }`
        : '',
    },
  });
  return { ...baseContext, title, message };
}

interface GetContextConditionsDescriptionOpts {
  searchType: 'searchSource' | 'esQuery' | 'esqlQuery';
  comparator: Comparator;
  threshold: number[];
  aggType: string;
  aggField?: string;
  isRecovered?: boolean;
  group?: string;
}

export function getContextConditionsDescription({
  searchType,
  comparator,
  threshold,
  aggType,
  aggField,
  isRecovered = false,
  group,
}: GetContextConditionsDescriptionOpts) {
  return isEsqlQueryRule(searchType)
    ? i18n.translate('xpack.stackAlerts.esQuery.esqlAlertTypeContextConditionsDescription', {
        defaultMessage: 'Query{negation} documents{groupCondition}',
        values: {
          groupCondition: group ? ` for group "${group}"` : '',
          negation: isRecovered ? ' did NOT match' : ' matched',
        },
      })
    : i18n.translate('xpack.stackAlerts.esQuery.alertTypeContextConditionsDescription', {
        defaultMessage:
          'Number of matching documents{groupCondition}{aggCondition} is {negation}{thresholdComparator} {threshold}',
        values: {
          aggCondition: aggType === 'count' ? '' : ` where ${aggType} of ${aggField}`,
          groupCondition: group ? ` for group "${group}"` : '',
          thresholdComparator: getHumanReadableComparator(comparator),
          threshold: threshold.join(' and '),
          negation: isRecovered ? 'NOT ' : '',
        },
      });
}
