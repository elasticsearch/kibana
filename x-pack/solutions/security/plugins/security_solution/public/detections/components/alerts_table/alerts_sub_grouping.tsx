/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Filter, Query } from '@kbn/es-query';
import { buildEsQuery } from '@kbn/es-query';
import type { GroupingAggregation, NamedAggregation } from '@kbn/grouping';
import { isNoneGroup } from '@kbn/grouping';
import { getEsQueryConfig } from '@kbn/data-plugin/common';
import type {
  DynamicGroupingProps,
  GroupChildComponentRenderer,
  GroupingSort,
  GroupingBucket,
  ParsedGroupingAggregation,
} from '@kbn/grouping/src';
import { parseGroupingQuery } from '@kbn/grouping/src';
import type { estypes } from '@elastic/elasticsearch';
import type { RunTimeMappings } from '@kbn/timelines-plugin/common/search_strategy';
import type { TableIdLiteral } from '@kbn/securitysolution-data-table';
import { PageScope } from '../../../data_view_manager/constants';
import { useDataView } from '../../../data_view_manager/hooks/use_data_view';
import type { GroupTakeActionItems } from './types';
import { combineQueries } from '../../../common/lib/kuery';
import type { AlertsGroupingAggregation } from './grouping_settings/types';
import { InspectButton } from '../../../common/components/inspect';
import { useKibana } from '../../../common/lib/kibana';
import { useGlobalTime } from '../../../common/containers/use_global_time';
import { useInvalidFilterQuery } from '../../../common/hooks/use_invalid_filter_query';
import { useInspectButton } from '../alerts_kpis/common/hooks';
import { buildTimeRangeFilter } from './helpers';

import * as i18n from './translations';
import { useQueryAlerts } from '../../containers/detection_engine/alerts/use_query';
import { ALERTS_QUERY_NAMES } from '../../containers/detection_engine/alerts/constants';
import { getAlertsGroupingQuery } from './grouping_settings';
import { useBrowserFields } from '../../../data_view_manager/hooks/use_browser_fields';
import {
  fetchQueryAlerts,
  fetchQueryUnifiedAlerts,
} from '../../containers/detection_engine/alerts/api';

const ALERTS_GROUPING_ID = 'alerts-grouping';
const DEFAULT_FILTERS: Filter[] = [];

interface OwnProps {
  defaultFilters?: Filter[];
  from: string;
  getGrouping: (
    props: Omit<DynamicGroupingProps<AlertsGroupingAggregation>, 'groupSelector' | 'pagination'>
  ) => React.ReactElement;
  globalFilters: Filter[];
  globalQuery: Query;
  groupingLevel?: number;
  /**
   * Sort order for the grouping results.
   */
  sort?: GroupingSort;
  /**
   * Function that returns the group aggregations by field.
   * This is then used to render values in the EuiAccordion `extraAction` section.
   */
  groupStatsAggregations: (field: string) => NamedAggregation[];
  /**
   * Allows to customize the content of the Take actions button rendered at the group level.
   * If no value is provided, the Take actins button is not displayed.
   */
  groupTakeActionItems?: GroupTakeActionItems;
  loading: boolean;
  onGroupClose: () => void;
  pageIndex: number;
  pageSize: number;
  parentGroupingFilter?: string;
  renderChildComponent: GroupChildComponentRenderer<AlertsGroupingAggregation>;
  runtimeMappings?: RunTimeMappings;
  selectedGroup: string;
  setPageIndex: (newIndex: number) => void;
  setPageSize: (newSize: number) => void;
  signalIndexName: string | undefined;
  tableId: TableIdLiteral;
  to: string;

  /** Optional array of custom controls to display in the toolbar alongside the group selector */
  additionalToolbarControls?: JSX.Element[];

  /**
   * If you're not using this property, multi-value fields will be transformed into a string
   * and grouped by that value. For instance, if an object has a property
   * called "mac" with value ['mac1', 'mac2'], the query will stringify that value
   * to "mac1, mac2" and then group by it.
   *
   * Using this property will create a bucket for each value of the multi-value fields in question.
   * Following the example above, a field with the ['mac1', 'mac2'] value will be grouped
   * in 2 groups: one for mac1 and a second for mac2.
   */
  multiValueFieldsToFlatten?: string[];

  /**
   * Data view scope
   */
  pageScope?: PageScope;

  /**
   * A callback function that is invoked whenever the grouping aggregations are updated.
   * It receives the parsed aggregation data as its only argument. This can be used to
   * react to changes in the grouped data, for example, to extract information from
   * the aggregation results.
   */
  onAggregationsChange?: (
    aggs: ParsedGroupingAggregation<AlertsGroupingAggregation>,
    groupingLevel?: number
  ) => void;

  /**
   * Filter specifically for the unitsCount aggregation
   */
  unitsCountFilter?: estypes.QueryDslQueryContainer;
}

export type AlertsTableComponentProps = OwnProps;

export const GroupedSubLevelComponent: React.FC<AlertsTableComponentProps> = ({
  defaultFilters = DEFAULT_FILTERS,
  from,
  getGrouping,
  globalFilters,
  globalQuery,
  groupingLevel,
  sort,
  groupStatsAggregations,
  groupTakeActionItems,
  loading,
  onGroupClose,
  pageIndex,
  pageSize,
  parentGroupingFilter,
  renderChildComponent,
  runtimeMappings,
  selectedGroup,
  setPageIndex,
  setPageSize,
  signalIndexName,
  tableId,
  to,
  additionalToolbarControls = [],
  multiValueFieldsToFlatten,
  pageScope = PageScope.alerts,
  onAggregationsChange,
  unitsCountFilter,
}) => {
  const {
    services: { uiSettings },
  } = useKibana();
  const { dataView } = useDataView(pageScope);
  const browserFields = useBrowserFields(dataView);

  const getGlobalQuery = useCallback(
    (customFilters: Filter[]) => {
      if (browserFields != null) {
        return combineQueries({
          config: getEsQueryConfig(uiSettings),
          dataProviders: [],
          dataView,
          browserFields,
          filters: [
            ...defaultFilters,
            ...globalFilters,
            ...customFilters,
            ...(parentGroupingFilter ? JSON.parse(parentGroupingFilter) : []),
            ...buildTimeRangeFilter(from, to),
          ],
          kqlQuery: globalQuery,
          kqlMode: globalQuery.language,
        });
      }
      return null;
    },
    [
      browserFields,
      uiSettings,
      dataView,
      defaultFilters,
      globalFilters,
      parentGroupingFilter,
      from,
      to,
      globalQuery,
    ]
  );

  const additionalFilters = useMemo(() => {
    try {
      return [
        buildEsQuery(undefined, globalQuery != null ? [globalQuery] : [], [
          ...(globalFilters?.filter((f) => f.meta.disabled === false) ?? []),
          ...(defaultFilters ?? []),
          ...(parentGroupingFilter ? JSON.parse(parentGroupingFilter) : []),
        ]),
      ];
    } catch (e) {
      return [];
    }
  }, [defaultFilters, globalFilters, globalQuery, parentGroupingFilter]);

  // create a unique, but stable (across re-renders) value
  const uniqueValue = useMemo(() => `SuperUniqueValue-${uuidv4()}`, []);

  const queryGroups = useMemo(() => {
    return getAlertsGroupingQuery({
      groupStatsAggregations,
      sort,
      additionalFilters,
      selectedGroup,
      uniqueValue,
      from,
      runtimeMappings,
      to,
      pageSize,
      pageIndex,
      multiValueFieldsToFlatten,
      unitsCountFilter,
    });
  }, [
    additionalFilters,
    from,
    groupStatsAggregations,
    pageIndex,
    pageSize,
    runtimeMappings,
    selectedGroup,
    to,
    uniqueValue,
    multiValueFieldsToFlatten,
    sort,
    unitsCountFilter,
  ]);

  const emptyGlobalQuery = useMemo(() => getGlobalQuery([]), [getGlobalQuery]);

  useInvalidFilterQuery({
    id: tableId,
    filterQuery: emptyGlobalQuery?.filterQuery,
    kqlError: emptyGlobalQuery?.kqlError,
    query: globalQuery,
    startDate: from,
    endDate: to,
  });

  const fetchMethod = useMemo(() => {
    return pageScope === PageScope.attacks ? fetchQueryUnifiedAlerts : fetchQueryAlerts;
  }, [pageScope]);

  const {
    data: alertsGroupsData,
    loading: isLoadingGroups,
    refetch,
    request,
    response,
    setQuery: setAlertsQuery,
  } = useQueryAlerts<{}, GroupingAggregation<AlertsGroupingAggregation>>({
    fetchMethod,
    query: queryGroups,
    indexName: signalIndexName,
    queryName: ALERTS_QUERY_NAMES.ALERTS_GROUPING,
    skip: isNoneGroup([selectedGroup]),
  });

  const queriedGroup = useRef<string | null>(null);

  const aggs = useMemo(
    // queriedGroup because `selectedGroup` updates before the query response
    () =>
      parseGroupingQuery(
        // fallback to selectedGroup if queriedGroup.current is null, this happens in tests
        queriedGroup.current === null ? selectedGroup : queriedGroup.current,
        uniqueValue,
        alertsGroupsData?.aggregations
      ),
    [alertsGroupsData?.aggregations, selectedGroup, uniqueValue]
  );

  useEffect(() => {
    if (!isLoadingGroups) {
      onAggregationsChange?.(aggs, groupingLevel);
    }
  }, [aggs, groupingLevel, isLoadingGroups, onAggregationsChange]);

  useEffect(() => {
    if (!isNoneGroup([selectedGroup])) {
      queriedGroup.current =
        queryGroups?.runtime_mappings?.groupByField?.script?.params?.selectedGroup ?? '';
      setAlertsQuery(queryGroups);
    }
  }, [queryGroups, selectedGroup, setAlertsQuery]);

  const { deleteQuery, setQuery } = useGlobalTime();
  // create a unique, but stable (across re-renders) query id
  const uniqueQueryId = useMemo(() => `${ALERTS_GROUPING_ID}-${uuidv4()}`, []);

  useInspectButton({
    deleteQuery,
    loading: isLoadingGroups,
    refetch,
    request,
    response,
    setQuery,
    uniqueQueryId,
  });

  const inspect = useMemo(
    () => (
      <InspectButton queryId={uniqueQueryId} inspectIndex={0} title={i18n.INSPECT_GROUPING_TITLE} />
    ),
    [uniqueQueryId]
  );

  const getTakeActionItems = useCallback(
    (
      groupFilters: Filter[],
      groupNumber: number,
      groupBucket: GroupingBucket<AlertsGroupingAggregation>,
      closePopover: () => void
    ) => {
      const takeActionParams = {
        groupNumber,
        query: getGlobalQuery([...(defaultFilters ?? []), ...groupFilters])?.filterQuery,
        selectedGroup,
        tableId,
        groupBucket,
        closePopover,
        // Forward the page-scoped data view runtime mappings so the group-level
        // status update can resolve fields not natively mapped on the alerts index.
        runtimeMappings,
      };

      return groupTakeActionItems?.(takeActionParams);
    },
    [defaultFilters, getGlobalQuery, groupTakeActionItems, selectedGroup, tableId, runtimeMappings]
  );

  const onChangeGroupsItemsPerPage = useCallback(
    (size: number) => setPageSize(size),
    [setPageSize]
  );

  const onChangeGroupsPage = useCallback((index: number) => setPageIndex(index), [setPageIndex]);

  return useMemo(
    () =>
      getGrouping({
        activePage: pageIndex,
        data: aggs,
        groupingLevel,
        additionalToolbarControls: [...additionalToolbarControls, inspect],
        isLoading: loading || isLoadingGroups,
        itemsPerPage: pageSize,
        onChangeGroupsItemsPerPage,
        onChangeGroupsPage,
        onGroupClose,
        renderChildComponent,
        selectedGroup,
        ...(groupTakeActionItems && { takeActionItems: getTakeActionItems }),
      }),
    [
      aggs,
      getGrouping,
      getTakeActionItems,
      groupingLevel,
      groupTakeActionItems,
      inspect,
      isLoadingGroups,
      loading,
      onChangeGroupsItemsPerPage,
      onChangeGroupsPage,
      onGroupClose,
      pageIndex,
      pageSize,
      renderChildComponent,
      selectedGroup,
      additionalToolbarControls,
    ]
  );
};

export const GroupedSubLevel = React.memo(GroupedSubLevelComponent);
