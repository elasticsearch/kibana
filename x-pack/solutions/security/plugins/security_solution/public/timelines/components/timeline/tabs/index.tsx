/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiSkeletonText, EuiTab, EuiTabs } from '@elastic/eui';
import { isEmpty } from 'lodash/fp';
import type { ComponentType, ReactElement, Ref } from 'react';
import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import type { State } from '../../../../common/store';
import { useEsqlAvailability } from '../../../../common/hooks/esql/use_esql_availability';
import type { RowRenderer, TimelineId } from '../../../../../common/types/timeline';
import { TimelineTabs } from '../../../../../common/types/timeline';
import { type TimelineType, TimelineTypeEnum } from '../../../../../common/api/timeline';
import { useShallowEqualSelector } from '../../../../common/hooks/use_selector';
import {
  EqlEventsCountBadge,
  TimelineEventsCountBadge,
} from '../../../../common/hooks/use_timeline_events_count';
import { timelineActions } from '../../../store';
import type { CellValueElementProps } from '../cell_rendering';
import { getActiveTabSelector, getPinnedEventSelector, getShowTimelineSelector } from './selectors';
import * as i18n from './translations';
import { initializeTimelineSettings } from '../../../store/actions';
import { selectTimelineById, selectTimelineESQLSavedSearchId } from '../../../store/selectors';
import { fetchNotesBySavedObjectIds, makeSelectNotesBySavedObjectId } from '../../../../notes';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { LazyTimelineTabRenderer, TimelineTabFallback } from './lazy_timeline_tab_renderer';

/**
 * A HOC which supplies React.Suspense with a fallback component
 * @param Component A component deferred by `React.lazy`
 * @param fallback A fallback component to render while things load. Default is EuiSekeleton for all tabs
 */
const tabWithSuspense = <P extends {}, R = {}>(
  Component: ComponentType<P>,
  fallback: ReactElement | null = <EuiSkeletonText lines={10} />
) => {
  const Comp = React.forwardRef((props: P, ref: Ref<R>) => (
    <Suspense fallback={fallback}>
      <Component {...props} ref={ref} />
    </Suspense>
  ));

  Comp.displayName = `${Component.displayName ?? 'Tab'}WithSuspense`;
  return Comp;
};

const QueryTab = tabWithSuspense(
  lazy(() => import('./query')),
  <TimelineTabFallback />
);
const EqlTab = tabWithSuspense(
  lazy(() => import('./eql')),
  <TimelineTabFallback />
);
const NotesTab = tabWithSuspense(
  lazy(() => import('./notes')),
  <TimelineTabFallback />
);
const PinnedTab = tabWithSuspense(
  lazy(() => import('./pinned')),
  <TimelineTabFallback />
);
const EsqlTab = tabWithSuspense(
  lazy(() => import('./esql')),
  <TimelineTabFallback />
);

interface BasicTimelineTab {
  renderCellValue: (props: CellValueElementProps) => React.ReactNode;
  rowRenderers: RowRenderer[];
  timelineFullScreen?: boolean;
  timelineId: TimelineId;
  timelineType: TimelineType;
  timelineDescription: string;
}

type ActiveTimelineTabProps = BasicTimelineTab & {
  activeTimelineTab: TimelineTabs;
  showTimeline: boolean;
};

const ActiveTimelineTab = memo<ActiveTimelineTabProps>(
  ({
    activeTimelineTab,
    renderCellValue,
    rowRenderers,
    timelineId,
    timelineType,
    showTimeline,
  }) => {
    const { isEsqlAdvancedSettingEnabled } = useEsqlAvailability();
    const timelineESQLSavedSearch = useShallowEqualSelector((state) =>
      selectTimelineESQLSavedSearchId(state, timelineId)
    );
    const isSuperTimeline = useShallowEqualSelector(
      (state) => selectTimelineById(state, timelineId)?.isSuperTimeline ?? false
    );
    const shouldShowESQLTab = useMemo(
      () => !isSuperTimeline && (isEsqlAdvancedSettingEnabled || timelineESQLSavedSearch != null),
      [isSuperTimeline, isEsqlAdvancedSettingEnabled, timelineESQLSavedSearch]
    );

    return (
      <>
        <LazyTimelineTabRenderer
          timelineId={timelineId}
          shouldShowTab={TimelineTabs.query === activeTimelineTab}
          dataTestSubj={`timeline-tab-content-${TimelineTabs.query}`}
        >
          <QueryTab
            renderCellValue={renderCellValue}
            rowRenderers={rowRenderers}
            timelineId={timelineId}
          />
        </LazyTimelineTabRenderer>
        {showTimeline && shouldShowESQLTab && activeTimelineTab === TimelineTabs.esql && (
          <LazyTimelineTabRenderer
            timelineId={timelineId}
            shouldShowTab={true}
            dataTestSubj={`timeline-tab-content-${TimelineTabs.esql}`}
          >
            <EsqlTab timelineId={timelineId} />
          </LazyTimelineTabRenderer>
        )}
        <LazyTimelineTabRenderer
          timelineId={timelineId}
          shouldShowTab={TimelineTabs.pinned === activeTimelineTab}
          dataTestSubj={`timeline-tab-content-${TimelineTabs.pinned}`}
        >
          <PinnedTab
            renderCellValue={renderCellValue}
            rowRenderers={rowRenderers}
            timelineId={timelineId}
          />
        </LazyTimelineTabRenderer>
        {!isSuperTimeline && timelineType === TimelineTypeEnum.default && (
          <LazyTimelineTabRenderer
            timelineId={timelineId}
            shouldShowTab={TimelineTabs.eql === activeTimelineTab}
            dataTestSubj={`timeline-tab-content-${TimelineTabs.eql}`}
          >
            <EqlTab
              renderCellValue={renderCellValue}
              rowRenderers={rowRenderers}
              timelineId={timelineId}
            />
          </LazyTimelineTabRenderer>
        )}
        <LazyTimelineTabRenderer
          timelineId={timelineId}
          shouldShowTab={activeTimelineTab === TimelineTabs.notes}
          dataTestSubj={`timeline-tab-content-${TimelineTabs.notes}`}
        >
          <NotesTab timelineId={timelineId} />
        </LazyTimelineTabRenderer>
      </>
    );
  }
);

ActiveTimelineTab.displayName = 'ActiveTimelineTab';

const CountBadge = styled(EuiBadge)`
  margin-left: ${({ theme }) => theme.eui.euiSizeS};
`;

const StyledEuiTab = styled(EuiTab)`
  .euiTab__content {
    align-items: center;
    display: flex;
    flex-direction: row;
    white-space: pre;
  }

  :focus {
    text-decoration: none;

    > span > span {
      text-decoration: underline;
    }
  }
`;

const StyledEuiTabs = styled(EuiTabs)`
  padding-inline: ${(props) => props.theme.eui.euiSizeM};
`;

const TabsContentComponent: React.FC<BasicTimelineTab> = ({
  renderCellValue,
  rowRenderers,
  timelineId,
  timelineFullScreen,
  timelineType,
  timelineDescription,
}) => {
  const dispatch = useDispatch();
  const getActiveTab = useMemo(() => getActiveTabSelector(), []);
  const getShowTimeline = useMemo(() => getShowTimelineSelector(), []);
  const getNumberOfPinnedEvents = useMemo(() => getPinnedEventSelector(), []);
  const { isEsqlAdvancedSettingEnabled } = useEsqlAvailability();

  const timelineESQLSavedSearch = useShallowEqualSelector((state) =>
    selectTimelineESQLSavedSearchId(state, timelineId)
  );

  const activeTab = useShallowEqualSelector((state) => getActiveTab(state, timelineId));
  const showTimeline = useShallowEqualSelector((state) => getShowTimeline(state, timelineId));
  const timeline = useSelector((state: State) => selectTimelineById(state, timelineId));
  const isSuperTimeline = timeline?.isSuperTimeline ?? false;

  const shouldShowESQLTab = useMemo(
    () => !isSuperTimeline && (isEsqlAdvancedSettingEnabled || timelineESQLSavedSearch != null),
    [isSuperTimeline, isEsqlAdvancedSettingEnabled, timelineESQLSavedSearch]
  );

  const numberOfPinnedEvents = useShallowEqualSelector((state) =>
    getNumberOfPinnedEvents(state, timelineId)
  );
  const timelineSavedObjectId = useMemo(() => timeline?.savedObjectId ?? '', [timeline]);
  const isTimelineSaved: boolean = useMemo(
    () => timelineSavedObjectId.length > 0,
    [timelineSavedObjectId]
  );

  const {
    notesPrivileges: { read: canSeeNotes },
    timelinePrivileges: { read: canSeePinnedTab },
  } = useUserPrivileges();

  // new note system
  const fetchNotes = useCallback(
    () => dispatch(fetchNotesBySavedObjectIds({ savedObjectIds: [timelineSavedObjectId] })),
    [dispatch, timelineSavedObjectId]
  );
  useEffect(() => {
    if (isTimelineSaved) {
      fetchNotes();
    }
  }, [fetchNotes, isTimelineSaved]);

  const selectNotesBySavedObjectId = useMemo(() => makeSelectNotesBySavedObjectId(), []);

  const notesNewSystem = useSelector((state: State) =>
    selectNotesBySavedObjectId(state, timelineSavedObjectId)
  );
  const numberOfNotesNewSystem = useMemo(
    () => notesNewSystem.length + (isEmpty(timelineDescription) ? 0 : 1),
    [notesNewSystem, timelineDescription]
  );

  const setActiveTab = useCallback(
    (tab: TimelineTabs) => {
      dispatch(timelineActions.setActiveTabTimeline({ id: timelineId, activeTab: tab }));
    },
    [dispatch, timelineId]
  );

  const setQueryAsActiveTab = useCallback(() => {
    setActiveTab(TimelineTabs.query);
  }, [setActiveTab]);

  const setEqlAsActiveTab = useCallback(() => {
    setActiveTab(TimelineTabs.eql);
  }, [setActiveTab]);

  const setNotesAsActiveTab = useCallback(() => {
    setActiveTab(TimelineTabs.notes);
  }, [setActiveTab]);

  const setPinnedAsActiveTab = useCallback(() => {
    setActiveTab(TimelineTabs.pinned);
  }, [setActiveTab]);

  const setEsqlAsActiveTab = useCallback(() => {
    dispatch(
      initializeTimelineSettings({
        id: timelineId,
      })
    );
    setActiveTab(TimelineTabs.esql);
  }, [setActiveTab, dispatch, timelineId]);

  useEffect(() => {
    // we redirect to the Query tab when we try to load Timeline urls with the Session or Analyzer tabs active
    // Session View and Analyzer graph are now only rendered in the flyout
    // @ts-ignore
    if (activeTab === 'graph' || activeTab === 'session') {
      setQueryAsActiveTab();
    }
  }, [activeTab, setQueryAsActiveTab]);

  return (
    <>
      {!timelineFullScreen && (
        <StyledEuiTabs className="eui-scrollBar">
          <StyledEuiTab
            data-test-subj={`timelineTabs-${TimelineTabs.query}`}
            onClick={setQueryAsActiveTab}
            isSelected={activeTab === TimelineTabs.query}
            disabled={false}
            key={TimelineTabs.query}
          >
            <span>{i18n.QUERY_TAB}</span>
            {showTimeline && <TimelineEventsCountBadge />}
          </StyledEuiTab>
          {shouldShowESQLTab && (
            <StyledEuiTab
              data-test-subj={`timelineTabs-${TimelineTabs.esql}`}
              onClick={setEsqlAsActiveTab}
              isSelected={activeTab === TimelineTabs.esql}
              disabled={false}
              key={TimelineTabs.esql}
            >
              <span>{i18n.DISCOVER_ESQL_IN_TIMELINE_TAB}</span>
            </StyledEuiTab>
          )}
          {!isSuperTimeline && timelineType === TimelineTypeEnum.default && (
            <StyledEuiTab
              data-test-subj={`timelineTabs-${TimelineTabs.eql}`}
              onClick={setEqlAsActiveTab}
              isSelected={activeTab === TimelineTabs.eql}
              disabled={false}
              key={TimelineTabs.eql}
            >
              <span>{i18n.EQL_TAB}</span>
              {showTimeline && <EqlEventsCountBadge />}
            </StyledEuiTab>
          )}
          <StyledEuiTab
            data-test-subj={`timelineTabs-${TimelineTabs.notes}`}
            onClick={setNotesAsActiveTab}
            isSelected={activeTab === TimelineTabs.notes}
            disabled={!canSeeNotes || timelineType === TimelineTypeEnum.template}
            key={TimelineTabs.notes}
          >
            <span>{i18n.NOTES_TAB}</span>
            {showTimeline &&
              numberOfNotesNewSystem > 0 &&
              timelineType === TimelineTypeEnum.default && (
                <CountBadge>{numberOfNotesNewSystem}</CountBadge>
              )}
          </StyledEuiTab>
          <StyledEuiTab
            data-test-subj={`timelineTabs-${TimelineTabs.pinned}`}
            onClick={setPinnedAsActiveTab}
            disabled={!canSeePinnedTab || timelineType === TimelineTypeEnum.template}
            isSelected={activeTab === TimelineTabs.pinned}
            key={TimelineTabs.pinned}
          >
            <span>{i18n.PINNED_TAB}</span>
            {showTimeline &&
              numberOfPinnedEvents > 0 &&
              timelineType === TimelineTypeEnum.default && (
                <CountBadge>{numberOfPinnedEvents}</CountBadge>
              )}
          </StyledEuiTab>
        </StyledEuiTabs>
      )}

      <ActiveTimelineTab
        activeTimelineTab={activeTab}
        renderCellValue={renderCellValue}
        rowRenderers={rowRenderers}
        timelineId={timelineId}
        timelineType={timelineType}
        timelineDescription={timelineDescription}
        showTimeline={showTimeline}
      />
    </>
  );
};

export const TabsContent = memo(TabsContentComponent);
