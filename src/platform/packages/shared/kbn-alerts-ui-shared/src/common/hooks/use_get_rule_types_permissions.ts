/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo } from 'react';
import { keyBy } from 'lodash';
import type { UseQueryOptions } from '@kbn/react-query';
import type { HttpStart } from '@kbn/core-http-browser';
import type { ToastsStart } from '@kbn/core-notifications-browser';
import type { RuleType } from '@kbn/triggers-actions-ui-types';
import type {
  RuleTypeIndexWithDescriptions,
  RuleTypeWithDescription,
} from '@kbn/triggers-actions-ui-types';
import { useGetRuleTypesQuery } from '@kbn/response-ops-rules-apis/hooks/use_get_rule_types_query';
import { i18n } from '@kbn/i18n';
import { ALERTS_FEATURE_ID } from '../constants';

export interface UseGetRuleTypesPermissionsParams {
  http: HttpStart;
  toasts: ToastsStart;
  filteredRuleTypes?: string[];
  registeredRuleTypes?: Array<{ id: string; description: string }>;
  enabled?: boolean;
  context?: UseQueryOptions['context'];
}

const getFilteredIndex = ({
  data,
  filteredRuleTypes,
  registeredRuleTypes,
}: {
  data: Array<RuleType<string, string>>;
  filteredRuleTypes?: string[];
  registeredRuleTypes: UseGetRuleTypesPermissionsParams['registeredRuleTypes'];
}) => {
  const index: RuleTypeIndexWithDescriptions = new Map();
  const registeredRuleTypesDictionary = registeredRuleTypes ? keyBy(registeredRuleTypes, 'id') : {};
  for (const ruleType of data) {
    const ruleTypeRecord: RuleType<string, string> & { description?: string } = { ...ruleType };
    if (!registeredRuleTypes) {
      // If rule type registry is not provided, don't use it for filtering
      index.set(ruleType.id, ruleTypeRecord);
    } else if (registeredRuleTypesDictionary[ruleType.id]) {
      // Filter out unregistered rule types, and add descriptions to registered rule types
      ruleTypeRecord.description = registeredRuleTypesDictionary[ruleType.id].description;
      index.set(ruleType.id, ruleTypeRecord);
    }
  }
  let filteredIndex = index;
  if (filteredRuleTypes?.length) {
    filteredIndex = new Map(
      [...index].filter(([k, v]) => {
        return filteredRuleTypes.includes(v.id);
      })
    );
  }
  return filteredIndex;
};

export const useGetRuleTypesPermissions = ({
  http,
  toasts,
  filteredRuleTypes,
  registeredRuleTypes,
  context,
  enabled = true,
}: UseGetRuleTypesPermissionsParams) => {
  const onErrorFn = (error: unknown) => {
    if (error) {
      toasts.addDanger(
        i18n.translate('alertsUIShared.hooks.useLoadRuleTypesQuery.unableToLoadRuleTypesMessage', {
          defaultMessage: 'Unable to load rule types',
        })
      );
    }
  };

  const { data, isSuccess, isFetching, isInitialLoading, isLoading, error } = useGetRuleTypesQuery(
    { http },
    {
      onError: onErrorFn,
      enabled,
      context,
    }
  );

  const filteredIndex = useMemo(
    () =>
      data
        ? getFilteredIndex({ data, filteredRuleTypes, registeredRuleTypes })
        : new Map<string, RuleTypeWithDescription>(),
    [data, filteredRuleTypes, registeredRuleTypes]
  );

  const hasAnyAuthorizedRuleType = filteredIndex.size > 0;
  const authorizedRuleTypes = useMemo(() => [...filteredIndex.values()], [filteredIndex]);
  const authorizedToCreateAnyRules = authorizedRuleTypes.some(
    (ruleType) => ruleType.authorizedConsumers[ALERTS_FEATURE_ID]?.all
  );
  const authorizedToReadAnyRules =
    authorizedToCreateAnyRules ||
    authorizedRuleTypes.some((ruleType) => ruleType.authorizedConsumers[ALERTS_FEATURE_ID]?.read);

  // Returns whether the current user can read a specific rule type. Authorization
  // is enforced per rule type (and consumer), so callers operating on a single
  // rule (e.g. an alert details page) should prefer this over the coarse
  // `authorizedToReadAnyRules`. When a consumer is provided it is checked
  // specifically; otherwise any authorized consumer with read access qualifies.
  const authorizedToReadRuleType = useCallback(
    (ruleTypeId: string, consumer?: string) => {
      const ruleType = filteredIndex.get(ruleTypeId);
      if (!ruleType) {
        return false;
      }
      const consumers = ruleType.authorizedConsumers;
      const specificConsumer = consumer ? consumers[consumer] : undefined;
      if (specificConsumer) {
        return Boolean(specificConsumer.read || specificConsumer.all);
      }
      return Object.values(consumers).some(
        (authorizedConsumer) => authorizedConsumer.read || authorizedConsumer.all
      );
    },
    [filteredIndex]
  );

  return {
    ruleTypesState: {
      isInitialLoad: isInitialLoading,
      isLoading: isLoading || isFetching,
      data: filteredIndex,
      error,
    },
    hasAnyAuthorizedRuleType,
    authorizedRuleTypes,
    authorizedToReadAnyRules,
    authorizedToReadRuleType,
    authorizedToCreateAnyRules,
    isSuccess,
  };
};
