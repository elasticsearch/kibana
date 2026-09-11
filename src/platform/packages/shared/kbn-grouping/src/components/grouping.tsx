/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiProgress,
  EuiSpacer,
  EuiTablePagination,
  useEuiTheme,
  useEuiFontSize,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { Filter } from '@kbn/es-query';
import React, { useEffect, useMemo, useState } from 'react';
import type { UiCounterMetricType } from '@kbn/analytics';
import { METRIC_TYPE } from '@kbn/analytics';
import { defaultUnit, firstNonNullValue } from '../helpers';
import { createGroupFilter, getNullGroupFilter } from '../containers/query/helpers';
import { MAX_QUERY_SIZE, PAGE_BATCH_SIZE } from '../containers/query';
import { GroupPanel } from './accordion_panel';
import { GroupStats } from './accordion_panel/group_stats';
import { EmptyGroupingComponent } from './empty_results_panel';
import { groupingContainerCss, groupingContainerCssLevel } from './styles';
import {
  GROUPS_LIMITED_TO_MAX,
  GROUPS_UNIT,
  NULL_GROUP,
  LOAD_MORE_PAGES,
  SHOWING_GROUPS_OF_TOTAL,
} from './translations';
import type {
  ParsedGroupingAggregation,
  GroupPanelRenderer,
  GetGroupStats,
  GetAdditionalActionButtons,
  GroupChildComponentRenderer,
} from './types';
import type { GroupingBucket, OnGroupToggle } from './types';
import { getTelemetryEvent } from '../telemetry/const';

export interface GroupingProps<T> {
  activePage: number;
  data?: ParsedGroupingAggregation<T>;
  groupPanelRenderer?: GroupPanelRenderer<T>;
  groupSelector?: JSX.Element | null;
  // list of custom UI components which correspond to your custom rendered metrics aggregations
  getGroupStats?: GetGroupStats<T>;
  groupingId: string;
  groupingLevel?: number;
  /** Optional array of custom controls to display in the toolbar alongside the group selector */
  additionalToolbarControls?: JSX.Element[];
  isLoading: boolean;
  itemsPerPage: number;
  onChangeGroupsItemsPerPage?: (size: number) => void;
  onChangeGroupsPage?: (index: number) => void;
  onGroupToggle?: OnGroupToggle;
  renderChildComponent: GroupChildComponentRenderer<T>;
  onGroupClose: () => void;
  selectedGroup: string;
  takeActionItems?: (
    groupFilters: Filter[],
    groupNumber: number,
    groupBucket: GroupingBucket<T>,
    closePopover: () => void
  ) => JSX.Element | undefined;
  tracker?: (
    type: UiCounterMetricType,
    event: string | string[],
    count?: number | undefined
  ) => void;
  unit?: (n: number) => string;
  groupsUnit?: (n: number, parentSelectedGroup: string, hasNullGroup: boolean) => string;
  // determines if the field size should be ignored when creating a filter
  // usefull in combination with shouldFlattenMultiValueField param in GroupingQueryArgs
  // because if the field is a multi-value field, and we emit each value separatly the size of the field will be ignored
  // when filtering by it
  multiValueFields?: string[];
  /** Optional custom component to render when there are no grouping results */
  emptyGroupingComponent?: React.ReactElement;
  /** Optional function to get additional action buttons to display in group stats before the Take actions button */
  getAdditionalActionButtons?: GetAdditionalActionButtons<T>;

  /**
   * Limits the number of results to be paginated.
   * @see https://github.com/elastic/kibana/issues/151913
   */
  maxGroupCount?: number;
}

const GroupingComponent = <T,>({
  activePage,
  data,
  groupPanelRenderer,
  getGroupStats,
  groupSelector,
  groupingId,
  groupingLevel = 0,
  additionalToolbarControls,
  isLoading,
  itemsPerPage,
  onChangeGroupsItemsPerPage,
  onChangeGroupsPage,
  onGroupClose,
  onGroupToggle,
  renderChildComponent,
  selectedGroup,
  takeActionItems,
  tracker,
  unit = defaultUnit,
  groupsUnit = GROUPS_UNIT,
  multiValueFields,
  emptyGroupingComponent,
  getAdditionalActionButtons,
  maxGroupCount,
}: GroupingProps<T>) => {
  const { euiTheme } = useEuiTheme();
  const xsFontSize = useEuiFontSize('xs').fontSize;
  const countCss = css`
    font-size: ${xsFontSize};
    font-weight: ${euiTheme.font.weight.semiBold};
    border-right: ${euiTheme.border.thin};
    margin-right: 16px;
    padding-right: 16px;
  `;

  const [trigger, setTrigger] = useState<Record<string, { state: 'open' | 'closed' | undefined }>>(
    {}
  );

  // groups are revealed in batches of PAGE_BATCH_SIZE pages so a table with tens of thousands of
  // groups doesn't try to paginate past MAX_QUERY_SIZE, where the underlying query always returns
  // zero buckets. Resets whenever the grouped-by field changes
  const [revealedBatches, setRevealedBatches] = useState(1);
  useEffect(() => {
    setRevealedBatches(1);
  }, [selectedGroup]);

  const unitCount = useMemo(() => data?.unitsCount?.value ?? 0, [data?.unitsCount?.value]);
  const unitCountText = useMemo(() => {
    return `${unitCount.toLocaleString()} ${unit && unit(unitCount)}`;
  }, [unitCount, unit]);

  const groupCount = useMemo(() => data?.groupsCount?.value ?? 0, [data?.groupsCount?.value]);
  const groupCountText = useMemo(() => {
    const hasNullGroupInCurrentPage =
      data?.groupByFields?.buckets?.some(
        (groupBucket: GroupingBucket<T>) => groupBucket.isNullGroup
      ) || false;

    const hasNullGroup = Boolean(data?.nullGroupItems?.doc_count);

    return `${groupsUnit(groupCount, selectedGroup, hasNullGroupInCurrentPage || hasNullGroup)}`;
  }, [data?.groupByFields?.buckets, data?.nullGroupItems, groupCount, groupsUnit, selectedGroup]);

  const groupPanels = useMemo(
    () =>
      data?.groupByFields?.buckets?.map((groupBucket: GroupingBucket<T>, groupNumber) => {
        const group = firstNonNullValue(groupBucket.key);
        const groupKey = `group-${groupNumber}-${group}`;
        const isNullGroup = groupBucket.isNullGroup ?? false;
        const nullGroupMessage = isNullGroup
          ? NULL_GROUP(selectedGroup, unit(groupBucket.doc_count))
          : undefined;
        const groupFilters = isNullGroup
          ? getNullGroupFilter(selectedGroup)
          : createGroupFilter(
              selectedGroup,
              Array.isArray(groupBucket.key) ? groupBucket.key : [groupBucket.key],
              multiValueFields
            );

        const getActionItems: Parameters<typeof GroupStats>[0]['getActionItems'] = ({
          closePopover,
        }) => takeActionItems?.(groupFilters, groupNumber, groupBucket, closePopover);

        return (
          <span key={groupKey} data-test-subj={`level-${groupingLevel}-group-${groupNumber}`}>
            <GroupPanel<T>
              isNullGroup={isNullGroup}
              nullGroupMessage={nullGroupMessage}
              onGroupClose={onGroupClose}
              extraAction={
                <GroupStats
                  bucketKey={groupKey}
                  stats={getGroupStats && getGroupStats(selectedGroup, groupBucket)}
                  getActionItems={getActionItems}
                  additionalActionButtons={
                    getAdditionalActionButtons &&
                    getAdditionalActionButtons(selectedGroup, groupBucket)
                  }
                />
              }
              forceState={(trigger[groupKey] && trigger[groupKey].state) ?? 'closed'}
              groupBucket={groupBucket}
              groupPanel={
                groupPanelRenderer &&
                groupPanelRenderer(selectedGroup, groupBucket, nullGroupMessage, isLoading)
              }
              isLoading={isLoading}
              onToggleGroup={(isOpen) => {
                // built-in telemetry: UI-counter
                tracker?.(
                  METRIC_TYPE.CLICK,
                  getTelemetryEvent.groupToggled({ isOpen, groupingId, groupNumber })
                );
                setTrigger({
                  // ...trigger, -> this change will keep only one group at a time expanded and one table displayed
                  [groupKey]: {
                    state: isOpen ? 'open' : 'closed',
                  },
                });
                onGroupToggle?.({ isOpen, groupName: group, groupNumber, groupingId });
              }}
              renderChildComponent={
                trigger[groupKey] && trigger[groupKey].state === 'open'
                  ? renderChildComponent
                  : () => <span />
              }
              selectedGroup={selectedGroup}
              groupingLevel={groupingLevel}
              multiValueFields={multiValueFields}
            />
            {groupingLevel > 0 ? null : <EuiSpacer size="s" />}
          </span>
        );
      }),
    [
      data?.groupByFields?.buckets,
      groupPanelRenderer,
      getGroupStats,
      groupingId,
      groupingLevel,
      isLoading,
      onGroupClose,
      onGroupToggle,
      renderChildComponent,
      selectedGroup,
      takeActionItems,
      tracker,
      trigger,
      unit,
      multiValueFields,
      getAdditionalActionButtons,
    ]
  );

  // the query backing this component never returns groups beyond MAX_QUERY_SIZE, so pagination can
  // never be allowed past that point. maxGroupCount allows callers to specify a lower cap.
  const maxPageCount = Math.max(1, Math.floor((maxGroupCount ?? MAX_QUERY_SIZE) / itemsPerPage));
  const totalPageCount = groupCount ? Math.ceil(groupCount / itemsPerPage) : 1;
  const revealedPageCount = Math.min(revealedBatches * PAGE_BATCH_SIZE, maxPageCount);
  const pageCount = Math.min(totalPageCount, revealedPageCount);
  const hasMoreBatchesToReveal = totalPageCount > pageCount && revealedPageCount < maxPageCount;
  const isLimitedByMaxQuerySize = groupCount > pageCount * itemsPerPage && !hasMoreBatchesToReveal;
  const clampedActivePage = Math.min(activePage, pageCount - 1);
  const isOnLastRevealedPage = clampedActivePage === pageCount - 1;

  // reset out-of-range pages caused by a stale activePage (e.g. a bookmarked URL) now that
  // pageCount is capped. Skipped while loading since `data` (and thus pageCount) may not yet
  // reflect the real group count.
  useEffect(() => {
    if (!isLoading && data && activePage > pageCount - 1 && onChangeGroupsPage) {
      onChangeGroupsPage(pageCount - 1);
    }
  }, [activePage, pageCount, onChangeGroupsPage, isLoading, data]);

  const emptyComponent = useMemo(() => {
    return emptyGroupingComponent ? emptyGroupingComponent : <EmptyGroupingComponent />;
  }, [emptyGroupingComponent]);

  return (
    <div css={() => ({ padding: `0 8px` })}>
      {groupingLevel > 0 ? null : (
        <EuiFlexGroup
          data-test-subj="grouping-table"
          justifyContent="spaceBetween"
          alignItems="center"
          css={() => ({
            paddingBottom: 20,
            paddingTop: 20,
          })}
        >
          <EuiFlexItem grow={false}>
            {groupCount > 0 && unitCount > 0 ? (
              <EuiFlexGroup gutterSize="none">
                <EuiFlexItem grow={false}>
                  <span css={countCss} data-test-subj="unit-count">
                    {unitCountText}
                  </span>
                </EuiFlexItem>
                <EuiFlexItem>
                  <span css={countCss} data-test-subj="group-count" style={{ borderRight: 'none' }}>
                    {groupCountText}
                  </span>
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : null}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" alignItems="center">
              {additionalToolbarControls &&
                additionalToolbarControls.map((control, index) => (
                  <EuiFlexItem key={`additional-control-${index}`} grow={false}>
                    {control}
                  </EuiFlexItem>
                ))}
              {groupSelector ? <EuiFlexItem>{groupSelector}</EuiFlexItem> : null}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      <div
        css={
          groupingLevel > 0 ? groupingContainerCssLevel(euiTheme) : groupingContainerCss(euiTheme)
        }
        className="eui-xScroll"
      >
        {isLoading && (
          <EuiProgress data-test-subj="is-loading-grouping-table" size="xs" color="accent" />
        )}
        {groupCount > 0 ? (
          <span data-test-subj={`grouping-level-${groupingLevel}`}>
            {groupPanels}
            {groupCount > 0 && (
              <>
                <EuiSpacer size="m" />
                <EuiTablePagination
                  activePage={clampedActivePage}
                  data-test-subj={`grouping-level-${groupingLevel}-pagination`}
                  itemsPerPage={itemsPerPage}
                  itemsPerPageOptions={[10, 25, 50, 100]}
                  onChangeItemsPerPage={(pageSize: number) => {
                    if (onChangeGroupsItemsPerPage) {
                      onChangeGroupsItemsPerPage(pageSize);
                    }
                  }}
                  onChangePage={(pageIndex: number) => {
                    if (onChangeGroupsPage) {
                      onChangeGroupsPage(pageIndex);
                    }
                  }}
                  pageCount={pageCount}
                  showPerPageOptions
                />
                {isOnLastRevealedPage && (hasMoreBatchesToReveal || isLimitedByMaxQuerySize) && (
                  <p
                    data-test-subj={`grouping-level-${groupingLevel}-pagination-limit-warning`}
                    css={css`
                      display: flex;
                      flex-direction: row;
                      align-items: center;
                      justify-content: center;
                      margin-top: ${euiTheme.size.s};
                      background-color: ${euiTheme.colors.lightestShade};
                      padding: ${hasMoreBatchesToReveal
                        ? `0 ${euiTheme.size.base}`
                        : `${euiTheme.size.s} ${euiTheme.size.base}`};
                      text-align: center;
                    `}
                  >
                    <span>
                      {isLimitedByMaxQuerySize
                        ? GROUPS_LIMITED_TO_MAX(pageCount * itemsPerPage)
                        : SHOWING_GROUPS_OF_TOTAL(pageCount * itemsPerPage, groupCount)}
                    </span>
                    {hasMoreBatchesToReveal && (
                      <EuiButtonEmpty
                        flush="both"
                        data-test-subj={`grouping-level-${groupingLevel}-pagination-show-more`}
                        onClick={() => setRevealedBatches((prev) => prev + 1)}
                        css={css`
                          margin-left: ${euiTheme.size.xs};
                        `}
                      >
                        {LOAD_MORE_PAGES}
                      </EuiButtonEmpty>
                    )}
                  </p>
                )}
              </>
            )}
          </span>
        ) : (
          !isLoading && emptyComponent
        )}
      </div>
    </div>
  );
};

export const Grouping = React.memo(GroupingComponent) as typeof GroupingComponent;
