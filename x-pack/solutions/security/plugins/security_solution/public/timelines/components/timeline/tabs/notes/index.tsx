/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  EuiAvatar,
  EuiComment,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingElastic,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useDispatch, useSelector } from 'react-redux';
import { FormattedRelative } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { TimelineModel } from '../../../../..';
import { SaveTimelineCallout } from '../../../notes/save_timeline';
import { AddNote } from '../../../../../notes/components/add_note';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import {
  NOTES_LOADING_TEST_ID,
  TIMELINE_DESCRIPTION_COMMENT_TEST_ID,
} from '../../../../../notes/components/test_ids';
import { useAppToasts } from '../../../../../common/hooks/use_app_toasts';
import { ADDED_A_DESCRIPTION } from '../../../open_timeline/note_previews/translations';
import { defaultToEmptyTag, getEmptyValue } from '../../../../../common/components/empty_value';
import { selectTimelineById } from '../../../../store/selectors';
import {
  fetchNotesBySavedObjectIds,
  makeSelectNotesBySavedObjectId,
  makeSelectNotesBySavedObjectIds,
  ReqStatus,
  selectFetchNotesBySavedObjectIdsError,
  selectFetchNotesBySavedObjectIdsStatus,
} from '../../../../../notes';
import type { Note } from '../../../../../../common/api/timeline';
import { TimelineStatusEnum } from '../../../../../../common/api/timeline';
import { NotesList } from '../../../../../notes/components/notes_list';
import { Participants } from '../../../notes/participants';
import { NOTES } from '../../../notes/translations';
import { useShallowEqualSelector } from '../../../../../common/hooks/use_selector';
import { getScrollToTopSelector } from '../selectors';
import { useScrollToTop } from '../../../../../common/components/scroll_to_top';
import type { State } from '../../../../../common/store';

export const FETCH_NOTES_ERROR = i18n.translate(
  'xpack.securitySolution.notes.fetchNotesErrorLabel',
  {
    defaultMessage: 'Error fetching notes',
  }
);
export const NO_NOTES = i18n.translate('xpack.securitySolution.notes.noNotesLabel', {
  defaultMessage: 'No notes have been created for this Timeline.',
});

interface NotesTabContentProps {
  /**
   * The timeline id
   */
  timelineId: string;
}

/**
 * Renders the notes tab content.
 * The component fetches the notes for the timeline and renders:
 * - the timeline description
 * - the notes list
 * - the participants list
 * - the markdown to create a new note and the add note button
 */
const NotesTabContentComponent: React.FC<NotesTabContentProps> = React.memo(({ timelineId }) => {
  const { addError: addErrorToast } = useAppToasts();
  const dispatch = useDispatch();

  const { notesPrivileges } = useUserPrivileges();
  const canCreateNotes = notesPrivileges.crud;

  const getScrollToTop = useMemo(() => getScrollToTopSelector(), []);
  const scrollToTop = useShallowEqualSelector((state) => getScrollToTop(state, timelineId));
  useScrollToTop('#scrollableNotes', !!scrollToTop);

  const timeline: TimelineModel = useSelector((state: State) =>
    selectTimelineById(state, timelineId)
  );
  const isSuperTimeline = timeline?.isSuperTimeline ?? false;
  const superTimelineSourceIds = useMemo(
    () => timeline?.superTimelineSourceIds ?? [],
    [timeline?.superTimelineSourceIds]
  );

  const timelineSavedObjectId = useMemo(
    () => timeline.savedObjectId ?? '',
    [timeline.savedObjectId]
  );
  const isTimelineSaved: boolean = useMemo(
    () => timeline.status === TimelineStatusEnum.active,
    [timeline.status]
  );

  // Super Timeline: fetch notes for all source timelines in one call.
  // Normal timeline: fetch notes for the single saved object.
  const fetchNotes = useCallback(() => {
    if (isSuperTimeline) {
      dispatch(fetchNotesBySavedObjectIds({ savedObjectIds: superTimelineSourceIds }));
    } else {
      dispatch(fetchNotesBySavedObjectIds({ savedObjectIds: [timelineSavedObjectId] }));
    }
  }, [dispatch, isSuperTimeline, superTimelineSourceIds, timelineSavedObjectId]);

  useEffect(() => {
    if (isSuperTimeline || isTimelineSaved) {
      fetchNotes();
    }
  }, [fetchNotes, isSuperTimeline, isTimelineSaved]);

  // Super Timeline uses multi-id selector; normal timeline uses single-id selector.
  const selectNotesBySavedObjectId = useMemo(() => makeSelectNotesBySavedObjectId(), []);
  const selectNotesBySavedObjectIds = useMemo(() => makeSelectNotesBySavedObjectIds(), []);

  const notesForSingle: Note[] = useSelector((state: State) =>
    selectNotesBySavedObjectId(state, timelineSavedObjectId)
  );
  const notesForMulti: Note[] = useSelector((state: State) =>
    selectNotesBySavedObjectIds(state, superTimelineSourceIds)
  );
  const notes: Note[] = isSuperTimeline ? notesForMulti : notesForSingle;
  const fetchStatus = useSelector((state: State) => selectFetchNotesBySavedObjectIdsStatus(state));
  const fetchError = useSelector((state: State) => selectFetchNotesBySavedObjectIdsError(state));

  // show a toast if the fetch notes call fails
  useEffect(() => {
    if (fetchStatus === ReqStatus.Failed && fetchError) {
      addErrorToast(null, {
        title: FETCH_NOTES_ERROR,
      });
    }
  }, [addErrorToast, fetchError, fetchStatus]);

  // if timeline was saved with a description, we show it at the very top of the notes tab
  const timelineDescription = useMemo(() => {
    if (!timeline?.description) {
      return null;
    }

    return (
      <>
        <EuiComment
          key={'note-preview-description'}
          username={defaultToEmptyTag(timeline.updatedBy)}
          timestamp={
            <>
              {timeline.updated ? (
                <FormattedRelative data-test-subj="updated" value={new Date(timeline.updated)} />
              ) : (
                getEmptyValue()
              )}
            </>
          }
          event={ADDED_A_DESCRIPTION}
          timelineAvatar={<EuiAvatar size="l" name={timeline.updatedBy || '?'} />}
          data-test-subj={TIMELINE_DESCRIPTION_COMMENT_TEST_ID}
        >
          <EuiText size="s">{timeline.description}</EuiText>
        </EuiComment>
        <EuiSpacer />
      </>
    );
  }, [timeline.description, timeline.updated, timeline.updatedBy]);

  return (
    <EuiPanel
      css={css`
        height: 100%;
        overflow: auto;
      `}
    >
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={false}>
          <EuiTitle>
            <h3>{NOTES}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup data-test-subj={'new-notes-screen'}>
            <EuiFlexItem>
              {timelineDescription}
              {fetchStatus === ReqStatus.Loading && (
                <EuiLoadingElastic data-test-subj={NOTES_LOADING_TEST_ID} size="xxl" />
              )}
              {isTimelineSaved && fetchStatus === ReqStatus.Succeeded && notes.length === 0 ? (
                <EuiFlexGroup justifyContent="center">
                  <EuiFlexItem grow={false}>
                    <p>{NO_NOTES}</p>
                  </EuiFlexItem>
                </EuiFlexGroup>
              ) : (
                <NotesList
                  notes={notes}
                  options={{ hideTimelineIcon: true, hideDeleteIcon: isSuperTimeline }}
                />
              )}
              {!isSuperTimeline && canCreateNotes && (
                <>
                  <EuiSpacer />
                  <AddNote timelineId={timeline.savedObjectId} disableButton={!isTimelineSaved}>
                    {!isTimelineSaved && <SaveTimelineCallout />}
                  </AddNote>
                </>
              )}
            </EuiFlexItem>
            <EuiFlexItem
              css={css`
                max-width: 350px;
              `}
            >
              <Participants notes={notes} timelineCreatedBy={timeline.createdBy} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
});

NotesTabContentComponent.displayName = 'NotesTabContentComponent';

// eslint-disable-next-line import/no-default-export
export { NotesTabContentComponent as default };
