/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import NotesTabContentComponent, { FETCH_NOTES_ERROR, NO_NOTES } from '.';
import { render } from '@testing-library/react';
import { createMockStore, mockGlobalState, TestProviders } from '../../../../../common/mock';
import { ReqStatus } from '../../../../../notes';
import {
  ADD_NOTE_BUTTON_TEST_ID,
  DELETE_NOTE_BUTTON_TEST_ID,
  NOTES_LOADING_TEST_ID,
  TIMELINE_DESCRIPTION_COMMENT_TEST_ID,
} from '../../../../../notes/components/test_ids';
import React from 'react';
import { TimelineId } from '../../../../../../common/types';
import { SAVE_TIMELINE_CALLOUT_TEST_ID } from '../../../notes/test_ids';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { TimelineStatusEnum } from '../../../../../../common/api/timeline';
import type { State } from '../../../../../common/store';

jest.mock('../../../../../common/components/user_privileges');

const mockAddError = jest.fn();
jest.mock('../../../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: () => ({
    addError: mockAddError,
  }),
}));

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');
  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

const mockGlobalStateWithSavedTimeline: State = {
  ...mockGlobalState,
  timeline: {
    ...mockGlobalState.timeline,
    timelineById: {
      ...mockGlobalState.timeline.timelineById,
      [TimelineId.active]: {
        ...mockGlobalState.timeline.timelineById[TimelineId.test],
        savedObjectId: 'savedObjectId',
        status: TimelineStatusEnum.active,
      },
    },
  },
};
const mockGlobalStateWithUnSavedTimeline: State = {
  ...mockGlobalState,
  timeline: {
    ...mockGlobalState.timeline,
    timelineById: {
      ...mockGlobalState.timeline.timelineById,
      [TimelineId.active]: {
        ...mockGlobalState.timeline.timelineById[TimelineId.test],
      },
    },
  },
};

describe('NotesTabContentComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useUserPrivileges as jest.Mock).mockReturnValue({
      notesPrivileges: { crud: true },
      timelinePrivileges: { crud: true },
    });
  });

  it('should show the new note system', () => {
    const mockStore = createMockStore(mockGlobalStateWithSavedTimeline);

    const { getByTestId, queryByTestId } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.test} />
      </TestProviders>
    );

    expect(getByTestId('new-notes-screen')).toBeInTheDocument();
    expect(queryByTestId('old-notes-screen')).not.toBeInTheDocument();
  });

  it('should fetch notes for the saved object id if timeline has been saved and hide callout', () => {
    const mockStore = createMockStore(mockGlobalStateWithSavedTimeline);

    const { queryByTestId } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.active} />
      </TestProviders>
    );

    expect(mockDispatch).toHaveBeenCalled();
    expect(queryByTestId(SAVE_TIMELINE_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });

  it('should not fetch notes if timeline is unsaved', () => {
    const mockStore = createMockStore(mockGlobalStateWithUnSavedTimeline);

    const { getByTestId } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.test} />
      </TestProviders>
    );

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(getByTestId(SAVE_TIMELINE_CALLOUT_TEST_ID)).toBeInTheDocument();
  });

  it('should render loading spinner if notes are being fetched', () => {
    const mockStore = createMockStore({
      ...mockGlobalStateWithSavedTimeline,
      notes: {
        ...mockGlobalStateWithSavedTimeline.notes,
        status: {
          ...mockGlobalStateWithSavedTimeline.notes.status,
          fetchNotesBySavedObjectIds: ReqStatus.Loading,
        },
      },
    });

    const { getByTestId } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.test} />
      </TestProviders>
    );

    expect(getByTestId(NOTES_LOADING_TEST_ID)).toBeInTheDocument();
  });

  it('should render no data message if no notes are present and timeline has been saved', () => {
    const mockStore = createMockStore({
      ...mockGlobalStateWithSavedTimeline,
      notes: {
        ...mockGlobalStateWithSavedTimeline.notes,
        status: {
          ...mockGlobalStateWithSavedTimeline.notes.status,
          fetchNotesBySavedObjectIds: ReqStatus.Succeeded,
        },
      },
    });

    const { getByText } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.active} />
      </TestProviders>
    );

    expect(getByText(NO_NOTES)).toBeInTheDocument();
  });

  it('should render error toast if fetching notes fails', () => {
    const mockStore = createMockStore({
      ...mockGlobalStateWithSavedTimeline,
      notes: {
        ...mockGlobalStateWithSavedTimeline.notes,
        status: {
          ...mockGlobalStateWithSavedTimeline.notes.status,
          fetchNotesBySavedObjectIds: ReqStatus.Failed,
        },
        error: {
          ...mockGlobalStateWithSavedTimeline.notes.error,
          fetchNotesBySavedObjectIds: { type: 'http', status: 500 },
        },
      },
    });

    render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.test} />
      </TestProviders>
    );

    expect(mockAddError).toHaveBeenCalledWith(null, {
      title: FETCH_NOTES_ERROR,
    });
  });

  describe('Super Timeline mode', () => {
    const superTimelineSourceIds = ['tl-source-1', 'tl-source-2'];

    const mockGlobalStateWithSuperTimeline: State = {
      ...mockGlobalState,
      timeline: {
        ...mockGlobalState.timeline,
        timelineById: {
          ...mockGlobalState.timeline.timelineById,
          [TimelineId.active]: {
            ...mockGlobalState.timeline.timelineById[TimelineId.test],
            isSuperTimeline: true,
            superTimelineSourceIds,
          },
        },
      },
      notes: {
        ...mockGlobalState.notes,
        entities: {
          'note-a': {
            noteId: 'note-a',
            note: 'Note from timeline 1',
            timelineId: 'tl-source-1',
            created: 1663882629000,
            createdBy: 'elastic',
            updated: 1663882629000,
            updatedBy: 'elastic',
            version: 'v1',
          },
          'note-b': {
            noteId: 'note-b',
            note: 'Note from timeline 2',
            timelineId: 'tl-source-2',
            created: 1663882630000,
            createdBy: 'elastic',
            updated: 1663882630000,
            updatedBy: 'elastic',
            version: 'v1',
          },
        },
        ids: ['note-a', 'note-b'],
        status: {
          ...mockGlobalState.notes.status,
          fetchNotesBySavedObjectIds: ReqStatus.Succeeded,
        },
      },
    };

    it('should dispatch fetchNotesBySavedObjectIds with all source ids', () => {
      const mockStore = createMockStore(mockGlobalStateWithSuperTimeline);

      render(
        <TestProviders store={mockStore}>
          <NotesTabContentComponent timelineId={TimelineId.active} />
        </TestProviders>
      );

      expect(mockDispatch).toHaveBeenCalled();
    });

    it('should hide the add-note input', () => {
      const mockStore = createMockStore(mockGlobalStateWithSuperTimeline);

      const { queryByTestId } = render(
        <TestProviders store={mockStore}>
          <NotesTabContentComponent timelineId={TimelineId.active} />
        </TestProviders>
      );

      expect(queryByTestId(ADD_NOTE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    });

    it('should hide the delete button on each note', () => {
      const mockStore = createMockStore(mockGlobalStateWithSuperTimeline);

      const { queryByTestId } = render(
        <TestProviders store={mockStore}>
          <NotesTabContentComponent timelineId={TimelineId.active} />
        </TestProviders>
      );

      expect(queryByTestId(`${DELETE_NOTE_BUTTON_TEST_ID}-0`)).not.toBeInTheDocument();
      expect(queryByTestId(`${DELETE_NOTE_BUTTON_TEST_ID}-1`)).not.toBeInTheDocument();
    });
  });

  it('should render the timeline description at the top', () => {
    const mockStore = createMockStore({
      ...mockGlobalStateWithSavedTimeline,
      timeline: {
        ...mockGlobalStateWithSavedTimeline.timeline,
        timelineById: {
          ...mockGlobalStateWithSavedTimeline.timeline.timelineById,
          [TimelineId.active]: {
            ...mockGlobalStateWithSavedTimeline.timeline.timelineById[TimelineId.active],
            description: 'description',
          },
        },
      },
    });

    const { getByTestId, getByText } = render(
      <TestProviders store={mockStore}>
        <NotesTabContentComponent timelineId={TimelineId.active} />
      </TestProviders>
    );

    expect(getByTestId(TIMELINE_DESCRIPTION_COMMENT_TEST_ID)).toBeInTheDocument();
    expect(getByText('description')).toBeInTheDocument();
  });
});
