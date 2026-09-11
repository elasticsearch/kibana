/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSelector } from 'reselect-v4';
import { get, isEmpty } from 'lodash/fp';
import { isFilterDisabled, type Query } from '@kbn/es-query';
import {
  UNTITLED_TEMPLATE,
  UNTITLED_TIMELINE,
} from '../components/timeline/properties/translations';
import { timelineSelectors } from '.';
import { TimelineTabs } from '../../../common/types';
import type { State } from '../../common/store/types';
import type { TimelineModel } from './model';
import type { InsertTimeline } from './types';
import { TimelineStatusEnum, TimelineTypeEnum } from '../../../common/api/timeline';

export const getTimelineShowStatusByIdSelector = () =>
  createSelector(timelineSelectors.selectTimeline, (timeline) => ({
    activeTab: timeline?.activeTab ?? TimelineTabs.query,
    status: timeline?.status ?? TimelineStatusEnum.draft,
    show: timeline?.show ?? false,
    updated: timeline?.updated ?? undefined,
    changed: timeline?.changed ?? false,
  }));

const selectCallOutUnauthorizedMsg = (state: State): boolean =>
  state.timeline.showCallOutUnauthorizedMsg;

/**
 * @deprecated prefer using selectTimelineById below
 */
export const selectTimeline = (state: State, timelineId: string): TimelineModel =>
  state.timeline.timelineById[timelineId];

export const selectInsertTimeline = (state: State): InsertTimeline | null =>
  state.timeline.insertTimeline;

export const getShowCallOutUnauthorizedMsg = () =>
  createSelector(
    selectCallOutUnauthorizedMsg,
    (showCallOutUnauthorizedMsg) => showCallOutUnauthorizedMsg
  );

export const getTimelineByIdSelector = () => createSelector(selectTimeline, (timeline) => timeline);

export const getKqlFilterQuerySelector = () =>
  createSelector(selectTimeline, (timeline) =>
    timeline &&
    timeline.kqlQuery &&
    timeline.kqlQuery.filterQuery &&
    timeline.kqlQuery.filterQuery.kuery
      ? timeline.kqlQuery.filterQuery.kuery.expression
      : null
  );

export const getKqlFilterKuerySelector = () =>
  createSelector(selectTimeline, (timeline) =>
    timeline &&
    timeline.kqlQuery &&
    timeline.kqlQuery.filterQuery &&
    timeline.kqlQuery.filterQuery.kuery
      ? timeline.kqlQuery.filterQuery.kuery
      : null
  );

export const dataProviderVisibilitySelector = () =>
  createSelector(selectTimeline, (timeline) => timeline.isDataProviderVisible);

/**
 * Selector that returns the timelineById slice of state
 */
export const selectTimelineById = createSelector(
  (state: State) => state.timeline.timelineById,
  (state: State, timelineId: string) => timelineId,
  (timelineById, timelineId) => timelineById[timelineId]
);

/**
 * Selector that returns the timeline dataProviders.
 */
const selectTimelineDataProviders = createSelector(
  selectTimelineById,
  (timeline) => timeline?.dataProviders
);

/**
 * Selector that returns the timeline saved title.
 */
const selectTimelineTitle = createSelector(selectTimelineById, (timeline) => timeline?.title);

/**
 * Selector that returns the timeline type.
 */
const selectTimelineType = createSelector(selectTimelineById, (timeline) => timeline?.timelineType);

/**
 * Selector that returns the timeline kqlQuery.
 */
const selectTimelineKqlQuery = createSelector(selectTimelineById, (timeline) => timeline?.kqlQuery);

/**
 * Selector that returns the timeline filters.
 */
const selectTimelineFilters = createSelector(selectTimelineById, (timeline) => timeline?.filters);

/**
 * Selector that returns the timeline esql saved search id.
 */
export const selectTimelineESQLSavedSearchId = createSelector(
  selectTimelineById,
  (timeline) => timeline?.savedSearchId
);

/**
 * Selector that returns the kqlQuery.filterQuery.kuery.expression of a timeline.
 */
export const selectKqlFilterQueryExpression = createSelector(
  selectTimelineById,
  (timeline) => timeline?.kqlQuery?.filterQuery?.kuery?.expression
);

/**
 * Selector that returns the title of a timeline.
 * If the timeline has been saved, it will return the saved title.
 * If timeline is in template mode, it will return the default 'Untitled template' value;
 * If none of the above, it will return the default 'Untitled Timeline' value.
 */
export const selectTitleByTimelineById = createSelector(
  selectTimelineTitle,
  selectTimelineType,
  (savedTitle, timelineType): string => {
    if (!isEmpty(savedTitle)) {
      return savedTitle;
    }
    if (timelineType === TimelineTypeEnum.template) {
      return UNTITLED_TEMPLATE;
    }
    return UNTITLED_TIMELINE;
  }
);

/**
 * Selector that returns the timeline query in a {@link Query} format.
 */
export const selectKqlQuery = createSelector(
  selectTimelineDataProviders,
  selectKqlFilterQueryExpression,
  selectTimelineType,
  (dataProviders, kqlFilterQueryExpression, timelineType): Query => {
    const kqlQueryExpression =
      isEmpty(dataProviders) && isEmpty(kqlFilterQueryExpression) && timelineType === 'template'
        ? ' '
        : kqlFilterQueryExpression ?? '';
    return { query: kqlQueryExpression, language: 'kuery' };
  }
);

/**
 * Selector that returns true if the timeline has data providers, a kqlQuery filterQuery
 * expression, or at least one enabled filter.
 */
export const selectDataInTimeline = createSelector(
  selectTimelineDataProviders,
  selectTimelineKqlQuery,
  selectTimelineFilters,
  (dataProviders, kqlQuery, filters): boolean => {
    const hasEnabledFilters = (filters ?? []).some((filter) => !isFilterDisabled(filter));
    return (
      !isEmpty(dataProviders) ||
      !isEmpty(get('filterQuery.kuery.expression', kqlQuery)) ||
      hasEnabledFilters
    );
  }
);

export const selectExcludedRowRendererIds = createSelector(
  selectTimelineById,
  (timeline) => timeline?.excludedRowRendererIds
);

/**
 * Selector that returns if an event has been pinned in a timeline
 */
export const selectIsPinnedEventInTimeline = () =>
  createSelector(
    selectTimelineById,
    (_: State, __: string, pinnedEventId: string) => pinnedEventId,
    (timeline, pinnedEventId): boolean => !!timeline?.pinnedEventIds?.[pinnedEventId]
  );

/**
 * Selector that returns true when the active timeline is a transient, read-only Super Timeline.
 */
export const selectIsSuperTimeline = createSelector(
  selectTimelineById,
  (timeline): boolean => !!timeline?.isSuperTimeline
);
