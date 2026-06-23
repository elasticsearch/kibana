/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption, EuiSelectableProps } from '@elastic/eui';
import {
  EuiFilterButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiIcon,
  EuiSelectable,
  EuiTextColor,
  EuiToolTip,
} from '@elastic/eui';
import { debounce, isEmpty } from 'lodash/fp';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { SortFieldTimelineEnum, type TimelineType } from '../../../../../common/api/timeline';

import { useGetAllTimeline } from '../../../containers/all';
import { isUntitled } from '../../open_timeline/helpers';
import * as i18nTimeline from '../../open_timeline/translations';
import type { FavoriteTimelineResult, OpenTimelineResult } from '../../open_timeline/types';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import * as i18n from '../translations';
import { Direction } from '../../../../../common/search_strategy';

const TimelineContentItem = styled(EuiFlexItem)`
  max-width: calc(100% - 56px);
`;

const StyledEuiFilterButton = styled(EuiFilterButton)`
  border-top: 0;
  border-bottom: 0;
`;

export const ORIGINAL_PAGE_SIZE = 50;
const POPOVER_HEIGHT = 260;
const TIMELINE_ITEM_HEIGHT = 50;

/**
 * Modifies options by creating new property `timelineTitle`(with value of `title`), and by setting `title` to undefined.
 * Thus prevents appearing default browser tooltip on option hover (attribute `title` that gets rendered on li element)
 *
 * @param {EuiSelectableOption[]} options
 * @returns {EuiSelectableOption[]} modified options
 */
const replaceTitleInOptions = (
  options: EuiSelectableOption[]
): Array<EuiSelectableOption<{ timelineTitle: string; description?: string }>> =>
  options.map(({ title, ...props }) => ({
    ...props,
    title: undefined,
    timelineTitle: title ?? '',
  }));

export interface GetSelectableOptions {
  timelines: OpenTimelineResult[];
  onlyFavorites: boolean;
  timelineType?: TimelineType | null;
  searchTimelineValue: string;
}

export interface SelectableTimelineProps {
  hideUntitled?: boolean;
  getSelectableOptions: ({
    timelines,
    onlyFavorites,
    timelineType,
    searchTimelineValue,
  }: GetSelectableOptions) => EuiSelectableOption[];
  onClosePopover: () => void;
  onTimelineChange: (timelineTitle: string, timelineId: string | null) => void;
  timelineType: TimelineType;
  placeholder?: string;
}

const SelectableTimelineComponent: React.FC<SelectableTimelineProps> = ({
  hideUntitled = false,
  getSelectableOptions,
  onClosePopover,
  onTimelineChange,
  timelineType,
  placeholder,
}) => {
  const [pageSize, setPageSize] = useState(ORIGINAL_PAGE_SIZE);
  const [heightTrigger, setHeightTrigger] = useState(0);
  const [searchTimelineValue, setSearchTimelineValue] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const { fetchAllTimeline, timelines, loading, totalCount: timelineCount } = useGetAllTimeline();
  const selectableListOuterRef = useRef<HTMLDivElement | null>(null);
  const selectableListInnerRef = useRef<HTMLDivElement | null>(null);

  const debouncedSetSearchTimelineValue = useMemo(() => debounce(500, setSearchTimelineValue), []);

  const onSearchTimeline = useCallback(
    (val: string) => {
      debouncedSetSearchTimelineValue(val);
    },
    [debouncedSetSearchTimelineValue]
  );

  const handleOnToggleOnlyFavorites = useCallback(() => {
    setOnlyFavorites(!onlyFavorites);
  }, [onlyFavorites]);

  const handleOnScroll = useCallback(
    (totalTimelines: number, totalCount: number, scrollOffset: number) => {
      if (
        totalTimelines < totalCount &&
        selectableListOuterRef.current &&
        selectableListInnerRef.current
      ) {
        const clientHeight = selectableListOuterRef.current.clientHeight;
        const scrollHeight = selectableListInnerRef.current.clientHeight;
        const clientHeightTrigger = clientHeight * 1.2;
        if (
          scrollOffset > 10 &&
          scrollHeight - scrollOffset < clientHeightTrigger &&
          scrollHeight > heightTrigger
        ) {
          setHeightTrigger(scrollHeight);
          setPageSize(pageSize + ORIGINAL_PAGE_SIZE);
        }
      }
    },
    [heightTrigger, pageSize]
  );

  const renderTimelineOption = useCallback<
    NonNullable<
      EuiSelectableProps<{
        timelineTitle: string;
        description?: string;
        favorite?: FavoriteTimelineResult[];
      }>['renderOption']
    >
  >((option, searchValue) => {
    const title: string = isUntitled({ ...option, title: option.timelineTitle })
      ? i18nTimeline.UNTITLED_TIMELINE
      : option.timelineTitle;
    const description: string | null =
      option.description != null && option.description.trim().length > 0
        ? option.description
        : null;

    return (
      <EuiFlexGroup
        gutterSize="s"
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiIcon
            type={`${option.checked === 'on' ? 'check' : 'empty'}`}
            color="primary"
            aria-hidden={true}
          />
        </EuiFlexItem>
        <TimelineContentItem grow={true}>
          <EuiFlexGroup gutterSize="none" direction="column" responsive={false}>
            <EuiFlexItem data-test-subj="timeline">
              <EuiToolTip content={title} anchorClassName="eui-textTruncate eui-alignMiddle">
                <EuiHighlight search={searchValue}>{title}</EuiHighlight>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiToolTip content={description} anchorClassName="eui-textTruncate eui-alignMiddle">
                <EuiTextColor color="subdued" component="span">
                  <small>{description ?? getEmptyTagValue()}</small>
                </EuiTextColor>
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </TimelineContentItem>
        <EuiFlexItem grow={false}>
          <EuiIcon
            type={`${option.favorite != null && isEmpty(option.favorite) ? 'star' : 'starFill'}`}
            aria-hidden={true}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }, []);

  const handleTimelineChange = useCallback<
    NonNullable<
      EuiSelectableProps<{
        timelineTitle: string;
        description?: string;
      }>['onChange']
    >
  >(
    (options) => {
      const selectedTimeline = options.filter((option) => option.checked === 'on');
      if (selectedTimeline != null && selectedTimeline.length > 0) {
        onTimelineChange(
          isEmpty(selectedTimeline[0].timelineTitle)
            ? i18nTimeline.UNTITLED_TIMELINE
            : selectedTimeline[0].timelineTitle,
          selectedTimeline[0].id === '-1'
            ? null
            : (selectedTimeline[0].id as unknown as string | null)
        );
      }
      onClosePopover();
    },
    [onClosePopover, onTimelineChange]
  );

  const EuiSelectableContent = useCallback<NonNullable<EuiSelectableProps['children']>>(
    (list, search) => (
      <>
        {search}
        {list}
      </>
    ),
    []
  );

  const searchProps: EuiSelectableProps['searchProps'] = useMemo(
    () => ({
      'data-test-subj': 'timeline-super-select-search-box',
      placeholder: placeholder ?? i18n.SEARCH_BOX_TIMELINE_PLACEHOLDER(timelineType),
      onSearch: onSearchTimeline,
      incremental: false,
      append: (
        <StyledEuiFilterButton
          data-test-subj="only-favorites-toggle"
          hasActiveFilters={onlyFavorites}
          onClick={handleOnToggleOnlyFavorites}
        >
          {i18nTimeline.ONLY_FAVORITES}
        </StyledEuiFilterButton>
      ),
    }),
    [handleOnToggleOnlyFavorites, onSearchTimeline, onlyFavorites, timelineType, placeholder]
  );

  const listProps: EuiSelectableProps['listProps'] = useMemo(
    () => ({
      rowHeight: TIMELINE_ITEM_HEIGHT,
      showIcons: false,
      windowProps: {
        onScroll: ({ scrollOffset }) =>
          handleOnScroll(
            (timelines ?? []).filter((t) => !hideUntitled || t.title !== '').length,
            timelineCount,
            scrollOffset
          ),
        outerRef: selectableListOuterRef,
        innerRef: selectableListInnerRef,
      },
    }),
    [handleOnScroll, hideUntitled, timelineCount, timelines]
  );

  useEffect(() => {
    fetchAllTimeline({
      pageInfo: {
        pageIndex: 1,
        pageSize,
      },
      search: searchTimelineValue,
      sort: {
        sortField: SortFieldTimelineEnum.updated,
        sortOrder: Direction.desc,
      },
      onlyUserFavorite: onlyFavorites,
      status: null,
      timelineType,
    });
  }, [fetchAllTimeline, onlyFavorites, pageSize, searchTimelineValue, timelineType]);

  return (
    <EuiSelectable<{
      timelineTitle: string;
      description?: string;
      favorite?: FavoriteTimelineResult[];
    }>
      data-test-subj="selectable-input"
      height={POPOVER_HEIGHT}
      isLoading={loading && timelines == null}
      listProps={listProps}
      renderOption={renderTimelineOption}
      onChange={handleTimelineChange}
      searchable
      searchProps={searchProps}
      singleSelection={true}
      options={replaceTitleInOptions(
        getSelectableOptions({
          timelines: timelines ?? [],
          onlyFavorites,
          searchTimelineValue,
          timelineType,
        })
      )}
    >
      {EuiSelectableContent}
    </EuiSelectable>
  );
};

export const SelectableTimeline = memo(SelectableTimelineComponent);
