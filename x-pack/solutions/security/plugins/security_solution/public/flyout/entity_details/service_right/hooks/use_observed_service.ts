/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { inputsSelectors } from '../../../../common/store';
import { useQueryInspector } from '../../../../common/components/page/manage_query';
import type { ObservedEntityData } from '../../../../flyout_v2/entity/shared/components/observed_entity/types';
import type { ServiceItem } from '../../../../../common/search_strategy';
import { Direction, NOT_EVENT_KIND_ASSET_FILTER } from '../../../../../common/search_strategy';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useFirstLastSeen } from '../../../../common/containers/use_first_last_seen';
import { isActiveTimeline } from '../../../../helpers';
import { useSecurityDefaultPatterns } from '../../../../data_view_manager/hooks/use_security_default_patterns';
import { useObservedServiceDetails } from './observed_service_details';

const getServiceNameFromEntityIdentifiers = (identityFields: Record<string, string>): string =>
  identityFields['service.name'] || Object.values(identityFields)[0] || '';

export const useObservedService = (
  identityFields: Record<string, string>,
  scopeId: string
): Omit<ObservedEntityData<ServiceItem>, 'anomalies'> => {
  const timelineTime = useDeepEqualSelector((state) =>
    inputsSelectors.timelineTimeRangeSelector(state)
  );
  const globalTime = useGlobalTime();
  const isActiveTimelines = isActiveTimeline(scopeId);
  const { to, from } = isActiveTimelines ? timelineTime : globalTime;
  const { isInitializing, setQuery, deleteQuery } = globalTime;
  const serviceName = getServiceNameFromEntityIdentifiers(identityFields);

  const { indexPatterns } = useSecurityDefaultPatterns();

  const [
    loadingObservedService,
    { serviceDetails: observedServiceDetails, inspect, refetch, id: queryId },
  ] = useObservedServiceDetails({
    endDate: to,
    startDate: from,
    serviceName,
    indexNames: indexPatterns,
    skip: isInitializing,
  });

  useQueryInspector({
    deleteQuery,
    inspect,
    refetch,
    setQuery,
    queryId,
    loading: loadingObservedService,
  });

  const [loadingFirstSeen, { firstSeen }] = useFirstLastSeen({
    field: 'service.name',
    value: serviceName,
    defaultIndex: indexPatterns,
    order: Direction.asc,
    filterQuery: NOT_EVENT_KIND_ASSET_FILTER,
  });

  const [loadingLastSeen, { lastSeen }] = useFirstLastSeen({
    field: 'service.name',
    value: serviceName,
    defaultIndex: indexPatterns,
    order: Direction.desc,
    filterQuery: NOT_EVENT_KIND_ASSET_FILTER,
  });

  return useMemo(
    () => ({
      details: observedServiceDetails,
      isLoading: loadingObservedService || loadingLastSeen || loadingFirstSeen,
      firstSeen: {
        date: firstSeen,
        isLoading: loadingFirstSeen,
      },
      lastSeen: { date: lastSeen, isLoading: loadingLastSeen },
    }),
    [
      firstSeen,
      lastSeen,
      loadingFirstSeen,
      loadingLastSeen,
      loadingObservedService,
      observedServiceDetails,
    ]
  );
};
