/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useSelector } from 'react-redux-v7';
import moment from 'moment';
import type { OverviewStatusMetaData } from '../../../../common/runtime_types';
import { selectOverviewStatus } from '../state/overview_status';
import { selectOverviewState } from '../state/overview';
import { useGetUrlParams } from './use_url_params';

export function useMonitorsSortedByStatus(): OverviewStatusMetaData[] {
  const { statusFilter } = useGetUrlParams();
  const { status, disabledConfigs, allConfigs } = useSelector(selectOverviewStatus);

  const {
    pageState: { sortOrder, sortField },
  } = useSelector(selectOverviewState);

  return useMemo(() => {
    if (!status) {
      return [];
    }

    // When the server returns a paginated response (configs array), the data
    // is already sorted, filtered by status, and sliced to the requested page.
    if (status.configs) {
      return allConfigs ?? [];
    }

    // Legacy non-paginated path: sort and filter client-side.
    let result: OverviewStatusMetaData[] = [];

    const { downConfigs, pendingConfigs, staleConfigs, upConfigs } = status;

    if (statusFilter) {
      switch (statusFilter) {
        case 'down':
          result = Object.values(downConfigs) as OverviewStatusMetaData[];
          break;
        case 'up':
          result = Object.values(upConfigs) as OverviewStatusMetaData[];
          break;
        case 'disabled':
          result = Object.values(disabledConfigs ?? {}) as OverviewStatusMetaData[];
          break;
        case 'pending':
          result = Object.values(pendingConfigs) as OverviewStatusMetaData[];
          break;
        case 'stale':
          result = Object.values(staleConfigs ?? {}) as OverviewStatusMetaData[];
          break;
        default:
          break;
      }
    } else {
      const upAndDownMonitors =
        sortOrder === 'asc'
          ? [...Object.values(downConfigs), ...Object.values(upConfigs)]
          : [...Object.values(upConfigs), ...Object.values(downConfigs)];

      result = [
        ...upAndDownMonitors,
        ...Object.values(disabledConfigs ?? {}),
        ...Object.values(pendingConfigs),
        ...Object.values(staleConfigs ?? {}),
      ] as OverviewStatusMetaData[];
    }

    switch (sortField) {
      case 'name.keyword':
        result = result.sort((a, b) => a.name.localeCompare(b.name));
        return sortOrder === 'asc' ? result : result.reverse();
      case 'status':
        return result;
      case 'updated_at':
        result = result.sort((a, b) => {
          return moment(a.updated_at).diff(moment(b.updated_at));
        });
        return sortOrder === 'asc' ? result : result.reverse();
      case 'created_at':
        result = result.sort((a, b) => {
          return moment(a.created_at).diff(moment(b.created_at));
        });
        return sortOrder === 'asc' ? result : result.reverse();
      case 'urls': {
        const withUrl = result.filter((m) => m.urls);
        const withoutUrl = result.filter((m) => !m.urls);
        withUrl.sort((a, b) => (a.urls ?? '').localeCompare(b.urls ?? ''));
        return [...(sortOrder === 'asc' ? withUrl : withUrl.reverse()), ...withoutUrl];
      }
      case 'type.keyword':
        result = result.sort((a, b) => (a.type ?? '').localeCompare(b.type ?? ''));
        return sortOrder === 'asc' ? result : result.reverse();
    }
    return result;
  }, [allConfigs, disabledConfigs, sortField, sortOrder, status, statusFilter]);
}
