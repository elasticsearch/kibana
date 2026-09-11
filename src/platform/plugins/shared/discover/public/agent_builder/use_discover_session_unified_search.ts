/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Query, TimeRange } from '@kbn/es-query';
import type { StatefulSearchBarProps } from '@kbn/unified-search-plugin/public';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_DISCOVER_SESSION_TIME_RANGE } from './discover_session_inline_state';

const EMPTY_KUERY_QUERY: Query = { query: '', language: 'kuery' };

const areTimeRangesEqual = (current: TimeRange | undefined, next: TimeRange) =>
  current?.from === next.from && current?.to === next.to;

export const useDiscoverSessionUnifiedSearch = ({
  timeRange,
}: {
  timeRange: TimeRange;
}): {
  searchBarProps: StatefulSearchBarProps<Query>;
  effectiveTimeRange: TimeRange;
} => {
  const initialBounds = useMemo(
    () => ({
      from: timeRange.from ?? DEFAULT_DISCOVER_SESSION_TIME_RANGE.from,
      to: timeRange.to ?? DEFAULT_DISCOVER_SESSION_TIME_RANGE.to,
    }),
    [timeRange.from, timeRange.to]
  );

  const [committedTimeRange, setCommittedTimeRange] = useState<TimeRange>(() => initialBounds);

  useEffect(() => {
    setCommittedTimeRange((current) =>
      areTimeRangesEqual(current, initialBounds) ? current : initialBounds
    );
  }, [initialBounds]);

  const onQuerySubmit = useCallback<NonNullable<StatefulSearchBarProps<Query>['onQuerySubmit']>>(
    ({ dateRange }) => {
      setCommittedTimeRange((current) =>
        areTimeRangesEqual(current, dateRange) ? current : dateRange
      );
    },
    []
  );

  const searchBarProps = useMemo(
    (): StatefulSearchBarProps<Query> => ({
      appName: 'agentBuilder',
      useDefaultBehaviors: false,
      disableSubscribingToGlobalDataServices: true,
      enableDateRangePicker: true,
      showTimeWindowButtons: false,
      showQueryInput: false,
      showFilterBar: false,
      showQueryMenu: false,
      showDatePicker: true,
      showSubmitButton: false,
      disableQueryLanguageSwitcher: true,
      isAutoRefreshDisabled: true,
      displayStyle: 'inPage',
      query: EMPTY_KUERY_QUERY,
      filters: [],
      indexPatterns: [],
      dateRangeFrom: committedTimeRange.from,
      dateRangeTo: committedTimeRange.to,
      onQuerySubmit,
      dataTestSubj: 'discoverAgentBuilderSessionTimeRangePicker',
    }),
    [committedTimeRange.from, committedTimeRange.to, onQuerySubmit]
  );

  return { searchBarProps, effectiveTimeRange: committedTimeRange };
};
