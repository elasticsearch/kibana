/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux-v7';
import type { Filter, Query } from '@kbn/es-query';
import type { DataView } from '@kbn/data-views-plugin/common';
import {
  type GroupOption,
  type GroupStatsItem,
  isNoneGroup,
  type NamedAggregation,
  type RawBucket,
  useGrouping,
  type GroupSettings,
} from '@kbn/grouping';
import { isEmpty, isEqual } from 'lodash/fp';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { estypes } from '@elastic/elasticsearch';
import type { TableIdLiteral } from '@kbn/securitysolution-data-table';
import type {
  GetAdditionalActionButtons,
  GetGroupStats,
  GroupChildComponentRenderer,
  GroupingArgs,
  GroupingSort,
  GroupPanelRenderer,
  ParsedGroupingAggregation,
} from '@kbn/grouping/src';
import type { RunTimeMappings } from '@kbn/timelines-plugin/common/search_strategy';
import type { PageScope } from '../../../data_view_manager/constants';
import type { GroupTakeActionItems } from './types';
import type { AlertsGroupingAggregation } from './grouping_settings/types';
import { groupIdSelector } from '../../../common/store/grouping/selectors';
import { useDeepEqualSelector } from '../../../common/hooks/use_selector';
import { updateGroups } from '../../../common/store/grouping/actions';
import { defaultUnit } from '../../../common/components/toolbar/unit';
import { useKibana } from '../../../common/lib/kibana';
import { GroupedSubLevel } from './alerts_sub_grouping';
import { AlertsEventTypes, track } from '../../../common/lib/telemetry';
import * as i18n from './translations';

export interface AlertsTableComponentProps {
  /**
   * Allows to customize the `buttonContent` props of the EuiAccordion.
   * It basically renders the text next to the chevron, used to expand/collapse the accordion.
   * If none provided, the DefaultGroupPanelRenderer will be used (see kbn-grouping package).
   */
  accordionButtonContent?: GroupPanelRenderer<AlertsGroupingAggregation>;
  /**
   * Allow to partially customize the `extraAction` props of the EuiAccordion.
   * It basically renders the statistics to right side of the title and the left side of the Take actions button.
   * If none provided, we display the number of alerts for the group.
   */
  accordionExtraActionGroupStats?: {
    /**
     * Responsible to fetch the aggregation data to populate the UI values
     */
    aggregations: (field: string) => NamedAggregation[];
    /**
     * Responsible for rendering the aggregation data
     */
    renderer: GetGroupStats<AlertsGroupingAggregation>;
  };
  /**
   * DataView object to use internally to fetch the data.
   */
  dataView: DataView;
  defaultFilters?: Filter[];
  /**
   * Default values to display in the group selection dropdown.
   * If none are provided, the only options there will None (default) and be Custom field.
   */
  defaultGroupingOptions?: GroupOption[];
  from: string;
  globalFilters: Filter[];
  globalQuery: Query;
  /**
   * Allows to customize the content of the Take actions button rendered at the group level.
   * If no value is provided, the Take actins button is not displayed.
   */
  groupTakeActionItems?: GroupTakeActionItems;
  loading: boolean;
  /**
   * Data view scope
   */
  pageScope?: PageScope;
  renderChildComponent: GroupChildComponentRenderer<AlertsGroupingAggregation>;
  tableId: TableIdLiteral;
  to: string;
  settings?: GroupSettings;

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

  /** Optional array of custom controls to display in the toolbar alongside the group selector */
  additionalToolbarControls?: JSX.Element[];

  /** Optional custom component to render when there are no grouping results */
  emptyGroupingComponent?: React.ReactElement;

  /** Optional function to get additional action buttons to display in group stats before the Take actions button */
  getAdditionalActionButtons?: GetAdditionalActionButtons<AlertsGroupingAggregation>;

  /**
   * Sort order for the grouping results.
   */
  sort?: GroupingSort;

  /**
   * Filter specifically for the unitsCount aggregation
   */
  unitsCountFilter?: estypes.QueryDslQueryContainer;
}

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_INDEX = 0;
const MAX_GROUPING_LEVELS = 3;
export const DEFAULT_GROUPING_OPTIONS: GroupOption[] = [];

/**
 * This is used as default behavior if no group renderer is passed via props.
 * This will render the number of alerts.
 * It's paired with the DEFAULT_GROUP_STATS_AGGREGATION which retrieves the aggregation data.
 */
export const DEFAULT_GROUP_STATS_RENDERER: GetGroupStats<AlertsGroupingAggregation> = (
  _: string,
  bucket: RawBucket<AlertsGroupingAggregation>
): GroupStatsItem[] => [
  {
    title: i18n.STATS_GROUP_ALERTS,
    badge: {
      value: bucket.doc_count,
      width: 50,
      color: '#a83632',
    },
  },
];
/**
 * This is used as default behavior if no group aggregations is passed via props.
 * This will render retrieve the values to render the DEFAULT_GROUP_STATS_RENDERER above.
 */
export const DEFAULT_GROUP_STATS_AGGREGATION: (field: string) => NamedAggregation[] = () => [
  {
    unitsCount: {
      cardinality: {
        field: 'kibana.alert.uuid',
      },
    },
  },
];

const useStorage = (storage: Storage, tableId: string) =>
  useMemo(
    () => ({
      getStoragePageSize: (): number[] => {
        const pageSizes = storage.get(`grouping-table-${tableId}`);
        if (!pageSizes) {
          return Array(MAX_GROUPING_LEVELS).fill(DEFAULT_PAGE_SIZE);
        }
        return pageSizes;
      },
      setStoragePageSize: (pageSizes: number[]) => {
        storage.set(`grouping-table-${tableId}`, pageSizes);
      },
    }),
    [storage, tableId]
  );

const GroupedAlertsTableComponent: React.FC<AlertsTableComponentProps> = (props) => {
  const dispatch = useDispatch();
  const {
    services: { storage, telemetry },
  } = useKibana();

  const { getStoragePageSize, setStoragePageSize } = useStorage(storage, props.tableId);

  const { onGroupChange, onGroupToggle } = useMemo(
    () => ({
      onGroupChange: ({ groupByField, tableId }: { groupByField: string; tableId: string }) => {
        telemetry.reportEvent(AlertsEventTypes.AlertsGroupingChanged, { groupByField, tableId });
      },
      onGroupToggle: (param: {
        isOpen: boolean;
        groupName?: string | undefined;
        groupNumber: number;
        groupingId: string;
      }) =>
        telemetry.reportEvent(AlertsEventTypes.AlertsGroupingToggled, {
          ...param,
          tableId: param.groupingId,
        }),
    }),
    [telemetry]
  );

  const onOptionsChange = useCallback<NonNullable<GroupingArgs<{}>['onOptionsChange']>>(
    (options) => {
      dispatch(
        updateGroups({
          tableId: props.tableId,
          options,
        })
      );
    },
    [dispatch, props.tableId]
  );

  useEffect(() => {
    dispatch(
      updateGroups({
        tableId: props.tableId,
        settings: props.settings,
      })
    );
  }, [dispatch, props.tableId, props.settings]);

  const fields = useMemo(
    () => props.dataView.fields.map((field) => field.spec) || [],
    [props.dataView?.fields]
  );

  const multiValueFieldsToFlatten = useMemo(
    () => fields.filter((field) => field.aggregatable).map((field) => field.name),
    [fields]
  );

  const runtimeMappings = useMemo(
    () => props.dataView?.getRuntimeMappings() as RunTimeMappings,
    [props.dataView]
  );

  const dataViewTitle = useMemo(() => props.dataView?.title, [props.dataView?.title]);

  const groupingOptions = useMemo(
    () => props.defaultGroupingOptions || DEFAULT_GROUPING_OPTIONS,
    [props.defaultGroupingOptions]
  );

  const groupStatsRenderer = useMemo(
    () => props.accordionExtraActionGroupStats?.renderer || DEFAULT_GROUP_STATS_RENDERER,
    [props.accordionExtraActionGroupStats?.renderer]
  );

  const groupStatusAggregations = useMemo(
    () => props.accordionExtraActionGroupStats?.aggregations || DEFAULT_GROUP_STATS_AGGREGATION,
    [props.accordionExtraActionGroupStats?.aggregations]
  );

  const { getGrouping, selectedGroups, setSelectedGroups } = useGrouping({
    componentProps: {
      groupPanelRenderer: props.accordionButtonContent,
      getGroupStats: groupStatsRenderer,
      onGroupToggle,
      unit: defaultUnit,
      multiValueFields: multiValueFieldsToFlatten,
      emptyGroupingComponent: props.emptyGroupingComponent,
      getAdditionalActionButtons: props.getAdditionalActionButtons,
    },
    defaultGroupingOptions: groupingOptions,
    fields,
    groupingId: props.tableId,
    maxGroupingLevels: MAX_GROUPING_LEVELS,
    onGroupChange,
    onOptionsChange,
    tracker: track,

    //  Setting maxRowCount to 10k because of elasticsearch limitations
    //  More info here: https://github.com/elastic/kibana/issues/151913
    maxGroupCount: 10_000,
  });
  const groupId = useMemo(() => groupIdSelector(), []);
  const groupInRedux = useDeepEqualSelector((state) => groupId(state, props.tableId));
  useEffect(() => {
    // only ever set to `none` - siem only handles group selector when `none` is selected
    if (isNoneGroup(selectedGroups)) {
      // set active groups from selected groups
      dispatch(
        updateGroups({
          activeGroups: selectedGroups,
          tableId: props.tableId,
        })
      );
    }
  }, [dispatch, props.tableId, selectedGroups]);

  useEffect(() => {
    if (groupInRedux != null && !isNoneGroup(groupInRedux.activeGroups)) {
      // set selected groups from active groups
      setSelectedGroups(groupInRedux.activeGroups);
    }
  }, [groupInRedux, setSelectedGroups]);

  const [pageIndex, setPageIndex] = useState<number[]>(
    Array(MAX_GROUPING_LEVELS).fill(DEFAULT_PAGE_INDEX)
  );
  const [pageSize, setPageSize] = useState<number[]>(getStoragePageSize);

  const resetAllPagination = useCallback(() => {
    setPageIndex((curr) => curr.map(() => DEFAULT_PAGE_INDEX));
  }, []);

  const setPageVar = useCallback(
    (newNumber: number, groupingLevel: number, pageType: 'index' | 'size') => {
      if (pageType === 'index') {
        setPageIndex((currentIndex) => {
          const newArr = [...currentIndex];
          newArr[groupingLevel] = newNumber;
          return newArr;
        });
      }

      if (pageType === 'size') {
        setPageSize((currentIndex) => {
          const newArr = [...currentIndex];
          newArr[groupingLevel] = newNumber;
          setStoragePageSize(newArr);
          return newArr;
        });
        // set page index to 0 when page size is changed
        setPageIndex((currentIndex) => {
          const newArr = [...currentIndex];
          newArr[groupingLevel] = 0;
          return newArr;
        });
      }
    },
    [setStoragePageSize]
  );

  const paginationResetTriggers = useRef({
    defaultFilters: props.defaultFilters,
    globalFilters: props.globalFilters,
    globalQuery: props.globalQuery,
    selectedGroups,
  });

  useEffect(() => {
    const triggers = {
      defaultFilters: props.defaultFilters,
      globalFilters: props.globalFilters,
      globalQuery: props.globalQuery,
      selectedGroups,
    };
    if (!isEqual(paginationResetTriggers.current, triggers)) {
      resetAllPagination();
      paginationResetTriggers.current = triggers;
    }
  }, [
    props.defaultFilters,
    props.globalFilters,
    props.globalQuery,
    resetAllPagination,
    selectedGroups,
  ]);

  const getLevel = useCallback(
    (level: number, levelSelectedGroup: string, parentGroupingFilter?: string) => {
      let rcc;
      if (level < selectedGroups.length - 1) {
        rcc = (groupingFilters: Filter[]) => {
          return getLevel(
            level + 1,
            selectedGroups[level + 1],
            // stringify because if the filter is passed as an object, it will cause unnecessary re-rendering
            JSON.stringify([
              ...groupingFilters,
              ...(parentGroupingFilter ? JSON.parse(parentGroupingFilter) : []),
            ])
          );
        };
      } else {
        rcc = (
          groupingFilters: Filter[],
          selectedGroup?: string,
          fieldBucket?: RawBucket<AlertsGroupingAggregation>
        ) => {
          return props.renderChildComponent(
            [...groupingFilters, ...(parentGroupingFilter ? JSON.parse(parentGroupingFilter) : [])],
            selectedGroup,
            fieldBucket
          );
        };
      }

      const resetGroupChildrenPagination = (parentLevel: number) => {
        setPageIndex((allPages) => {
          const resetPages = allPages.splice(parentLevel + 1, allPages.length);
          return [...allPages, ...resetPages.map(() => DEFAULT_PAGE_INDEX)];
        });
      };
      return (
        <GroupedSubLevel
          {...props}
          getGrouping={getGrouping}
          groupingLevel={level}
          groupStatsAggregations={groupStatusAggregations}
          groupTakeActionItems={props.groupTakeActionItems}
          onGroupClose={() => resetGroupChildrenPagination(level)}
          pageIndex={pageIndex[level] ?? DEFAULT_PAGE_INDEX}
          pageSize={pageSize[level] ?? DEFAULT_PAGE_SIZE}
          parentGroupingFilter={parentGroupingFilter}
          renderChildComponent={rcc}
          runtimeMappings={runtimeMappings}
          selectedGroup={levelSelectedGroup}
          setPageIndex={(newIndex: number) => setPageVar(newIndex, level, 'index')}
          setPageSize={(newSize: number) => setPageVar(newSize, level, 'size')}
          signalIndexName={dataViewTitle}
          multiValueFieldsToFlatten={multiValueFieldsToFlatten}
          onAggregationsChange={props.onAggregationsChange}
          additionalToolbarControls={props.additionalToolbarControls}
          unitsCountFilter={props.unitsCountFilter}
        />
      );
    },
    [
      dataViewTitle,
      getGrouping,
      groupStatusAggregations,
      pageIndex,
      pageSize,
      props,
      runtimeMappings,
      selectedGroups,
      setPageVar,
      multiValueFieldsToFlatten,
    ]
  );

  if (isEmpty(dataViewTitle)) {
    return null;
  }

  return getLevel(0, selectedGroups[0]);
};

export const GroupedAlertsTable = React.memo(GroupedAlertsTableComponent);
