/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FieldSpec } from '@kbn/data-views-plugin/common';
import React, { useCallback, useMemo, useReducer } from 'react';
import type { UiCounterMetricType } from '@kbn/analytics';
import { groupsReducerWithStorage, initialState as reducerInitialGroupings } from './state/reducer';
import type { GroupingProps, GroupSelectorProps } from '..';
import { isNoneGroup } from '..';
import { groupActions, groupByIdSelector } from './state';
import { useGetGroupSelector } from './use_get_group_selector';
import type { GroupMap, GroupOption, GroupSettings } from './types';
import { defaultGroup } from './types';
import { Grouping as GroupingComponent } from '../components/grouping';

/** Interface for grouping object where T is the `GroupingAggregation`
 *  @interface GroupingArgs<T>
 */
export interface UseGrouping<T> {
  getGrouping: (props: DynamicGroupingProps<T>) => React.ReactElement;
  groupSelector: React.ReactElement<GroupSelectorProps>;
  selectedGroups: string[];
  setSelectedGroups: (selectedGroups: string[]) => void;
}

/** Type for static grouping component props where T is the consumer `GroupingAggregation`
 *  @interface StaticGroupingProps<T>
 */
type StaticGroupingProps<T> = Pick<
  GroupingProps<T>,
  | 'groupPanelRenderer'
  | 'getGroupStats'
  | 'onGroupToggle'
  | 'unit'
  | 'groupsUnit'
  | 'multiValueFields'
  | 'emptyGroupingComponent'
  | 'getAdditionalActionButtons'
>;

/** Type for dynamic grouping component props where T is the consumer `GroupingAggregation`
 *  @interface DynamicGroupingProps<T>
 */
export type DynamicGroupingProps<T> = Pick<
  GroupingProps<T>,
  | 'activePage'
  | 'data'
  | 'groupingLevel'
  | 'additionalToolbarControls'
  | 'isLoading'
  | 'itemsPerPage'
  | 'onChangeGroupsItemsPerPage'
  | 'onChangeGroupsPage'
  | 'renderChildComponent'
  | 'onGroupClose'
  | 'selectedGroup'
  | 'takeActionItems'
>;

/** Interface for configuring grouping package where T is the consumer `GroupingAggregation`
 *  @interface GroupingArgs<T>
 */
export interface GroupingArgs<T> {
  allowedFieldTypes?: string[];
  componentProps: StaticGroupingProps<T>;
  defaultGroupingOptions: GroupOption[];
  fields: FieldSpec[];
  groupingId: string;
  maxGroupingLevels?: number;
  /** for tracking
   * @param param { groupByField: string; tableId: string } selected group and table id
   */
  initialGroupings?: GroupMap;
  onGroupChange?: (param: {
    groupByField: string;
    groupByFields: string[];
    tableId: string;
  }) => void;
  onOptionsChange?: (options: GroupOption[]) => void;
  tracker?: (
    type: UiCounterMetricType,
    event: string | string[],
    count?: number | undefined
  ) => void;
  title?: string;
  onOpenTracker?: (
    type: UiCounterMetricType,
    event: string | string[],
    count?: number | undefined
  ) => void;
  settings?: GroupSettings;
  maxGroupCount?: number;
}

/**
 * Hook to configure grouping component
 * @param componentProps {@link StaticGroupingProps} props passed to the grouping component.
 * These props are static compared to the dynamic props passed later to getGrouping
 * @param defaultGroupingOptions defines the grouping options as an array of {@link GroupOption}
 * @param initialGroupings represents the initial groupingState value
 * @param fields FieldSpec array serialized version of DataViewField fields. Available in the custom grouping options
 * @param groupingId Unique identifier of the grouping component. Used in local storage
 * @param maxGroupingLevels maximum group nesting levels (optional)
 * @param onGroupChange callback executed when selected group is changed, used for tracking
 * @param onOptionsChange callback executed when grouping options are changed, used for consumer grouping selector
 * @param tracker telemetry handler
 * @param title of the grouping selector component
 * @param maxGroupCount limits the pagination to maxGroupCount items
 * @returns {@link Grouping} the grouping constructor { getGrouping, groupSelector, pagination, selectedGroups }
 */
export const useGrouping = <T,>({
  allowedFieldTypes,
  componentProps,
  defaultGroupingOptions,
  initialGroupings,
  fields,
  groupingId,
  maxGroupingLevels,
  onGroupChange,
  onOptionsChange,
  tracker,
  title,
  onOpenTracker,
  settings,
  maxGroupCount,
}: GroupingArgs<T>): UseGrouping<T> => {
  const [groupingState, dispatch] = useReducer(
    groupsReducerWithStorage,
    initialGroupings ?? reducerInitialGroupings
  );
  const { activeGroups: selectedGroups } = useMemo(
    () => groupByIdSelector({ groups: groupingState }, groupingId) ?? defaultGroup,
    [groupingId, groupingState]
  );

  const setSelectedGroups = useCallback(
    (activeGroups: string[]) => {
      dispatch(
        groupActions.updateActiveGroups({
          id: groupingId,
          activeGroups,
        })
      );
    },
    [groupingId]
  );

  const groupSelector = useGetGroupSelector({
    allowedFieldTypes,
    defaultGroupingOptions,
    dispatch,
    fields,
    groupingId,
    groupingState,
    maxGroupingLevels,
    onGroupChange,
    onOptionsChange,
    tracker,
    title,
    onOpenTracker,
    settings,
  });

  const getGrouping = useCallback(
    /**
     *
     * @param props {@link DynamicGroupingProps}
     */
    (props: DynamicGroupingProps<T>): React.ReactElement =>
      isNoneGroup([props.selectedGroup]) ? (
        props.renderChildComponent([])
      ) : (
        <GroupingComponent
          {...componentProps}
          {...props}
          groupSelector={settings?.hideGroupSelector ? null : groupSelector}
          groupingId={groupingId}
          tracker={tracker}
          maxGroupCount={maxGroupCount}
        />
      ),
    [componentProps, groupSelector, groupingId, settings?.hideGroupSelector, tracker, maxGroupCount]
  );

  return useMemo(
    () => ({
      getGrouping,
      groupSelector,
      selectedGroups,
      setSelectedGroups,
    }),
    [getGrouping, groupSelector, selectedGroups, setSelectedGroups]
  );
};
