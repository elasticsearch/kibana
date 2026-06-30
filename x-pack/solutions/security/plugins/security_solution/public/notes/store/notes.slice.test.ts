/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import * as uuid from 'uuid';
import type { SerializedError } from '@reduxjs/toolkit';
import { miniSerializeError } from '@reduxjs/toolkit';
import type { NotesState } from './notes.slice';
import {
  createNote,
  deleteNotes,
  fetchNotes,
  fetchNotesByDocumentIds,
  fetchNotesBySavedObjectIds,
  initialNotesState,
  notesReducer,
  ReqStatus,
  selectAllNotes,
  selectCreateNoteError,
  selectCreateNoteStatus,
  selectDeleteNotesError,
  selectDeleteNotesStatus,
  selectDocumentNotesBySavedObjectId,
  selectFetchNotesByDocumentIdsError,
  selectFetchNotesByDocumentIdsStatus,
  selectFetchNotesError,
  selectFetchNotesStatus,
  selectNoteById,
  selectNoteIds,
  selectNotesByDocumentId,
  selectNotesByDocumentIdReversed,
  selectNotesBySavedObjectId,
  makeSelectNotesBySavedObjectIds,
  selectNotesPagination,
  selectNotesTablePendingDeleteIds,
  selectNotesTableSearch,
  selectNotesTableSelectedIds,
  selectNotesTableSort,
  selectNotesBySavedObjectIdReversed,
  selectNotesTableCreatedByFilter,
  selectNotesTableAssociatedFilter,
  userClosedDeleteModal,
  userFilteredNotes,
  userSearchedNotes,
  userSelectedBulkDelete,
  userSelectedPage,
  userSelectedPerPage,
  userSelectedRow,
  userSelectedNotesForDeletion,
  userSortedNotes,
  userFilterCreatedBy,
  userClosedCreateErrorToast,
  userFilterAssociatedNotes,
} from './notes.slice';
import { mockGlobalState } from '../../common/mock';
import type { Note } from '../../../common/api/timeline';
import { AssociatedFilter } from '../../../common/notes/constants';

const initalEmptyState = initialNotesState;

const generateNoteMock = (documentId: string): Note => ({
  noteId: uuid.v4(),
  version: 'WzU1MDEsMV0=',
  timelineId: '',
  eventId: documentId,
  note: 'This is a mocked note',
  created: new Date().getTime(),
  createdBy: 'elastic',
  updated: new Date().getTime(),
  updatedBy: 'elastic',
});

const mockNote1 = generateNoteMock('1');
const mockNote2 = {
  ...generateNoteMock('2'),
  created: new Date().getTime() + 1000,
  updated: new Date().getTime() + 1000,
};

const initialNonEmptyState: NotesState = {
  entities: {
    [mockNote1.noteId]: mockNote1,
    [mockNote2.noteId]: mockNote2,
  },
  ids: [mockNote1.noteId, mockNote2.noteId],
  status: {
    fetchNotesByDocumentIds: ReqStatus.Idle,
    fetchNotesBySavedObjectIds: ReqStatus.Idle,
    createNote: ReqStatus.Idle,
    deleteNotes: ReqStatus.Idle,
    fetchNotes: ReqStatus.Idle,
  },
  error: {
    fetchNotesByDocumentIds: null,
    fetchNotesBySavedObjectIds: null,
    createNote: null,
    deleteNotes: null,
    fetchNotes: null,
  },
  pagination: {
    page: 1,
    perPage: 10,
    total: 0,
  },
  sort: {
    field: 'created' as const,
    direction: 'desc' as const,
  },
  filter: '',
  createdByFilter: '',
  associatedFilter: AssociatedFilter.all,
  search: '',
  selectedIds: [],
  pendingDeleteIds: [],
};

describe('notesSlice', () => {
  describe('notesReducer', () => {
    it('should handle an unknown action and return the initial state', () => {
      expect(notesReducer(initalEmptyState, { type: 'unknown' })).toEqual(initalEmptyState);
    });

    describe('fetchNotesByDocumentIds', () => {
      it('should set correct status state when fetching notes by document ids', () => {
        const action = { type: fetchNotesByDocumentIds.pending.type };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            fetchNotesByDocumentIds: ReqStatus.Loading,
          },
        });
      });

      it('should set correct state when success on fetch notes by document ids on an empty state', () => {
        const action = {
          type: fetchNotesByDocumentIds.fulfilled.type,
          payload: {
            entities: {
              notes: {
                [mockNote1.noteId]: mockNote1,
              },
            },
            result: [mockNote1.noteId],
          },
        };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          entities: action.payload.entities.notes,
          ids: action.payload.result,
          status: {
            ...initalEmptyState.status,
            fetchNotesByDocumentIds: ReqStatus.Succeeded,
          },
        });
      });

      it('should replace notes when success on fetch notes by document ids on a non-empty state', () => {
        const newMockNote = { ...mockNote1, timelineId: 'timelineId' };
        const action = {
          type: fetchNotesByDocumentIds.fulfilled.type,
          payload: {
            entities: {
              notes: {
                [newMockNote.noteId]: newMockNote,
              },
            },
            result: [newMockNote.noteId],
          },
        };

        expect(notesReducer(initialNonEmptyState, action)).toEqual({
          ...initalEmptyState,
          entities: {
            [newMockNote.noteId]: newMockNote,
            [mockNote2.noteId]: mockNote2,
          },
          ids: [newMockNote.noteId, mockNote2.noteId],
          status: {
            ...initalEmptyState.status,
            fetchNotesByDocumentIds: ReqStatus.Succeeded,
          },
        });
      });

      it('should set correct error state when failing to fetch notes by document ids', () => {
        const action = { type: fetchNotesByDocumentIds.rejected.type, error: 'error' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            fetchNotesByDocumentIds: ReqStatus.Failed,
          },
          error: {
            ...initalEmptyState.error,
            fetchNotesByDocumentIds: 'error',
          },
        });
      });
    });

    describe('fetchNotesBySavedObjectIds', () => {
      it('should set correct status state when fetching notes by saved object ids', () => {
        const action = { type: fetchNotesBySavedObjectIds.pending.type };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            fetchNotesBySavedObjectIds: ReqStatus.Loading,
          },
        });
      });

      it('should set correct state when success on fetch notes by saved object id ids on an empty state', () => {
        const action = {
          type: fetchNotesBySavedObjectIds.fulfilled.type,
          payload: {
            entities: {
              notes: {
                [mockNote1.noteId]: mockNote1,
              },
            },
            result: [mockNote1.noteId],
          },
        };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          entities: action.payload.entities.notes,
          ids: action.payload.result,
          status: {
            ...initalEmptyState.status,
            fetchNotesBySavedObjectIds: ReqStatus.Succeeded,
          },
        });
      });

      it('should replace notes when success on fetch notes by saved object id ids on a non-empty state', () => {
        const newMockNote = { ...mockNote1, timelineId: 'timelineId' };
        const action = {
          type: fetchNotesBySavedObjectIds.fulfilled.type,
          payload: {
            entities: {
              notes: {
                [newMockNote.noteId]: newMockNote,
              },
            },
            result: [newMockNote.noteId],
          },
        };

        expect(notesReducer(initialNonEmptyState, action)).toEqual({
          ...initalEmptyState,
          entities: {
            [newMockNote.noteId]: newMockNote,
            [mockNote2.noteId]: mockNote2,
          },
          ids: [newMockNote.noteId, mockNote2.noteId],
          status: {
            ...initalEmptyState.status,
            fetchNotesBySavedObjectIds: ReqStatus.Succeeded,
          },
        });
      });

      it('should set correct error state when failing to fetch notes by saved object ids', () => {
        const action = { type: fetchNotesBySavedObjectIds.rejected.type, error: 'error' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            fetchNotesBySavedObjectIds: ReqStatus.Failed,
          },
          error: {
            ...initalEmptyState.error,
            fetchNotesBySavedObjectIds: 'error',
          },
        });
      });
    });

    describe('createNote', () => {
      it('should set correct status state when creating a note', () => {
        const action = { type: createNote.pending.type };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            createNote: ReqStatus.Loading,
          },
        });
      });

      it('should set correct state when success on create a note on an empty state', () => {
        const action = {
          type: createNote.fulfilled.type,
          payload: {
            entities: {
              notes: {
                [mockNote1.noteId]: mockNote1,
              },
            },
            result: mockNote1.noteId,
          },
        };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          entities: action.payload.entities.notes,
          ids: [action.payload.result],
          status: {
            ...initalEmptyState.status,
            createNote: ReqStatus.Succeeded,
          },
        });
      });

      it('should set correct error state when failing to create a note', () => {
        const action = { type: createNote.rejected.type, error: 'error' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            createNote: ReqStatus.Failed,
          },
          error: {
            ...initalEmptyState.error,
            createNote: 'error',
          },
        });
      });
    });

    describe('deleteNotes', () => {
      it('should set correct status state when deleting notes', () => {
        const action = { type: deleteNotes.pending.type };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            deleteNotes: ReqStatus.Loading,
          },
        });
      });

      it('should set correct state when success on deleting notes', () => {
        const action = {
          type: deleteNotes.fulfilled.type,
          payload: [mockNote1.noteId],
        };
        const state = {
          ...initialNonEmptyState,
          pendingDeleteIds: [mockNote1.noteId],
        };

        expect(notesReducer(state, action)).toEqual({
          ...initialNonEmptyState,
          entities: {
            [mockNote2.noteId]: mockNote2,
          },
          ids: [mockNote2.noteId],
          status: {
            ...initialNonEmptyState.status,
            deleteNotes: ReqStatus.Succeeded,
          },
          pendingDeleteIds: [],
        });
      });

      it('should set correct state when failing to delete notes', () => {
        const action = { type: deleteNotes.rejected.type, error: 'error' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          status: {
            ...initalEmptyState.status,
            deleteNotes: ReqStatus.Failed,
          },
          error: {
            ...initalEmptyState.error,
            deleteNotes: 'error',
          },
        });
      });

      it('should set correct status when fetching notes', () => {
        const action = { type: fetchNotes.pending.type };
        expect(notesReducer(initialNotesState, action)).toEqual({
          ...initialNotesState,
          status: {
            ...initialNotesState.status,
            fetchNotes: ReqStatus.Loading,
          },
        });
      });

      it('should set notes and update pagination when fetch is successful', () => {
        const action = {
          type: fetchNotes.fulfilled.type,
          payload: {
            entities: {
              notes: { [mockNote2.noteId]: mockNote2, '2': { ...mockNote2, noteId: '2' } },
            },
            totalCount: 2,
          },
        };
        const state = notesReducer(initialNotesState, action);
        expect(state.entities).toEqual(action.payload.entities.notes);
        expect(state.ids).toHaveLength(2);
        expect(state.pagination.total).toBe(2);
        expect(state.status.fetchNotes).toBe(ReqStatus.Succeeded);
      });

      it('should set error when fetch fails', () => {
        const action = { type: fetchNotes.rejected.type, error: { message: 'Failed to fetch' } };
        const state = notesReducer(initialNotesState, action);
        expect(state.status.fetchNotes).toBe(ReqStatus.Failed);
        expect(state.error.fetchNotes).toEqual({ message: 'Failed to fetch' });
      });

      it('should set correct status when deleting multiple notes', () => {
        const action = { type: deleteNotes.pending.type };
        expect(notesReducer(initialNotesState, action)).toEqual({
          ...initialNotesState,
          status: {
            ...initialNotesState.status,
            deleteNotes: ReqStatus.Loading,
          },
        });
      });

      it('should remove multiple notes when delete is successful', () => {
        const initialState = {
          ...initialNotesState,
          entities: { '1': mockNote1, '2': { ...mockNote2, noteId: '2' } },
          ids: ['1', '2'],
        };
        const action = { type: deleteNotes.fulfilled.type, payload: ['1', '2'] };
        const state = notesReducer(initialState, action);
        expect(state.entities).toEqual({});
        expect(state.ids).toHaveLength(0);
        expect(state.status.deleteNotes).toBe(ReqStatus.Succeeded);
      });

      it('should set error when delete fails', () => {
        const action = { type: deleteNotes.rejected.type, error: { message: 'Failed to delete' } };
        const state = notesReducer(initialNotesState, action);
        expect(state.status.deleteNotes).toBe(ReqStatus.Failed);
        expect(state.error.deleteNotes).toEqual({ message: 'Failed to delete' });
      });
    });

    describe('userSelectedPage', () => {
      it('should set correct value for the selected page', () => {
        const action = { type: userSelectedPage.type, payload: 2 };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          pagination: {
            ...initalEmptyState.pagination,
            page: 2,
          },
        });
      });
    });

    describe('userSelectedPerPage', () => {
      it('should set correct value for number of notes per page', () => {
        const action = { type: userSelectedPerPage.type, payload: 25 };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          pagination: {
            ...initalEmptyState.pagination,
            perPage: 25,
          },
        });
      });
    });

    describe('userSortedNotes', () => {
      it('should set correct value for sorting notes', () => {
        const action = { type: userSortedNotes.type, payload: { field: 'note', direction: 'asc' } };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          sort: {
            field: 'note',
            direction: 'asc',
          },
        });
      });
    });

    describe('userFilteredNotes', () => {
      it('should set correct value to filter notes', () => {
        const action = { type: userFilteredNotes.type, payload: 'abc' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          filter: 'abc',
        });
      });
    });

    describe('userFilterCreatedBy', () => {
      it('should set correct value to filter users', () => {
        const action = { type: userFilterCreatedBy.type, payload: 'abc' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          createdByFilter: 'abc',
        });
      });
    });

    describe('userFilterAssociatedNotes', () => {
      it('should set correct value to filter associated notes', () => {
        const action = { type: userFilterAssociatedNotes.type, payload: 'abc' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          associatedFilter: 'abc',
        });
      });
    });

    describe('userSearchedNotes', () => {
      it('should set correct value to search notes', () => {
        const action = { type: userSearchedNotes.type, payload: 'abc' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          search: 'abc',
        });
      });
    });

    describe('userSelectedRow', () => {
      it('should set correct ids for selected rows', () => {
        const action = { type: userSelectedRow.type, payload: ['1'] };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          selectedIds: ['1'],
        });
      });
    });

    describe('userClosedDeleteModal', () => {
      it('should reset pendingDeleteIds when closing modal', () => {
        const action = { type: userClosedDeleteModal.type };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          pendingDeleteIds: [],
        });
      });
    });

    describe('userClosedCreateErrorToast', () => {
      it('should reset create note error', () => {
        const action = { type: userClosedCreateErrorToast.type };

        expect(
          notesReducer(
            {
              ...initalEmptyState,
              error: {
                ...initalEmptyState.error,
                createNote: new Error(),
              },
            },
            action
          ).error.createNote
        ).toBe(null);
      });
    });

    describe('userSelectedNotesForDeletion', () => {
      it('should set correct id when user selects a note to delete', () => {
        const action = { type: userSelectedNotesForDeletion.type, payload: '1' };

        expect(notesReducer(initalEmptyState, action)).toEqual({
          ...initalEmptyState,
          pendingDeleteIds: ['1'],
        });
      });
    });

    describe('userSelectedBulkDelete', () => {
      it('should update pendingDeleteIds when user chooses bulk delete', () => {
        const action = { type: userSelectedBulkDelete.type };
        const state = {
          ...initalEmptyState,
          selectedIds: ['1'],
        };

        expect(notesReducer(state, action)).toEqual({
          ...state,
          pendingDeleteIds: ['1'],
        });
      });
    });
  });

  describe('selectors', () => {
    it('should return all notes', () => {
      expect(selectAllNotes(mockGlobalState)).toEqual(
        Object.values(mockGlobalState.notes.entities)
      );
    });

    it('should return note by id', () => {
      expect(selectNoteById(mockGlobalState, '1')).toEqual(mockGlobalState.notes.entities['1']);
    });

    it('should return note ids', () => {
      expect(selectNoteIds(mockGlobalState)).toEqual(['1']);
    });

    it('should return fetch notes by document id status', () => {
      expect(selectFetchNotesByDocumentIdsStatus(mockGlobalState)).toEqual(ReqStatus.Idle);
    });

    it('should return fetch notes by document id error', () => {
      expect(selectFetchNotesByDocumentIdsError(mockGlobalState)).toEqual(null);
    });

    it('should return create note by document id status', () => {
      expect(selectCreateNoteStatus(mockGlobalState)).toEqual(ReqStatus.Idle);
    });

    it('should return create note by document id error', () => {
      expect(selectCreateNoteError(mockGlobalState)).toEqual(null);
    });

    it('should return delete note status', () => {
      expect(selectDeleteNotesStatus(mockGlobalState)).toEqual(ReqStatus.Idle);
    });

    it('should return delete note error', () => {
      expect(selectDeleteNotesError(mockGlobalState)).toEqual(null);
    });

    it('should return all notes for an existing document id', () => {
      expect(selectNotesByDocumentId(mockGlobalState, '1')).toEqual([
        mockGlobalState.notes.entities['1'],
      ]);
    });

    it('should return no notes if document id does not exist', () => {
      expect(selectNotesByDocumentId(mockGlobalState, 'wrong-document-id')).toHaveLength(0);
    });

    it('should return no notes if no notes is found with specified document id and saved object id', () => {
      expect(
        selectDocumentNotesBySavedObjectId(mockGlobalState, {
          documentId: '1',
          savedObjectId: 'wrong-savedObjectId',
        })
      ).toHaveLength(0);
      expect(
        selectDocumentNotesBySavedObjectId(mockGlobalState, {
          documentId: 'wrong-document-id',
          savedObjectId: 'some-timeline-id',
        })
      ).toHaveLength(0);
    });

    it('should return all notes for an existing document id and existing saved object id', () => {
      expect(
        selectDocumentNotesBySavedObjectId(mockGlobalState, {
          documentId: '1',
          savedObjectId: 'timeline-1',
        })
      ).toHaveLength(1);
    });

    it('should return all notes sorted for an existing document id', () => {
      const oldestNote = {
        eventId: '1', // should be a valid id based on mockTimelineData
        noteId: '1',
        note: 'note-1',
        timelineId: 'timeline-1',
        created: 1663882629000,
        createdBy: 'elastic',
        updated: 1663882629000,
        updatedBy: 'elastic',
        version: 'version',
      };
      const newestNote = {
        ...oldestNote,
        noteId: '2',
        created: 1663882689000,
      };

      const state = {
        ...mockGlobalState,
        notes: {
          ...mockGlobalState.notes,
          entities: {
            '1': oldestNote,
            '2': newestNote,
          },
          ids: ['1', '2'],
        },
      };

      const ascResult = selectNotesByDocumentId(state, '1');
      expect(ascResult[0]).toEqual(oldestNote);
      expect(ascResult[1]).toEqual(newestNote);

      const descResult = selectNotesByDocumentIdReversed(state, '1');
      expect(descResult[0]).toEqual(newestNote);
      expect(descResult[1]).toEqual(oldestNote);
    });

    it('should also return no notes if document id does not exist', () => {
      expect(selectNotesByDocumentId(mockGlobalState, 'wrong-document-id')).toHaveLength(0);
    });

    it('should return all notes for an existing saved object id', () => {
      expect(selectNotesBySavedObjectId(mockGlobalState, 'timeline-1')).toEqual([
        mockGlobalState.notes.entities['1'],
      ]);
    });

    it('should return no notes if saved object id does not exist', () => {
      expect(selectNotesBySavedObjectId(mockGlobalState, 'wrong-saved-object-id')).toHaveLength(0);
    });

    it('should return no notes if saved object id is empty string', () => {
      expect(selectNotesBySavedObjectId(mockGlobalState, '')).toHaveLength(0);
    });

    it('should return all notes sorted for an existing saved object id', () => {
      const oldestNote = {
        eventId: '1', // should be a valid id based on mockTimelineData
        noteId: '1',
        note: 'note-1',
        timelineId: 'timeline-1',
        created: 1663882629000,
        createdBy: 'elastic',
        updated: 1663882629000,
        updatedBy: 'elastic',
        version: 'version',
      };
      const newestNote = {
        ...oldestNote,
        noteId: '2',
        created: 1663882689000,
      };

      const state = {
        ...mockGlobalState,
        notes: {
          ...mockGlobalState.notes,
          entities: {
            '1': oldestNote,
            '2': newestNote,
          },
          ids: ['1', '2'],
        },
      };

      const ascResult = selectNotesBySavedObjectId(state, 'timeline-1');
      expect(ascResult[0]).toEqual(oldestNote);
      expect(ascResult[1]).toEqual(newestNote);

      const descResult = selectNotesBySavedObjectIdReversed(state, 'timeline-1');
      expect(descResult[0]).toEqual(newestNote);
      expect(descResult[1]).toEqual(oldestNote);
    });

    it('should also return no notes if saved object id does not exist', () => {
      expect(selectNotesBySavedObjectIdReversed(mockGlobalState, 'wrong-document-id')).toHaveLength(
        0
      );
    });

    it('should also return no notes if saved object id is empty string', () => {
      expect(selectNotesBySavedObjectIdReversed(mockGlobalState, '')).toHaveLength(0);
    });

    describe('makeSelectNotesBySavedObjectIds (multi-id, for Super Timeline)', () => {
      const buildState = (entities: Record<string, Note>, ids: string[]) => ({
        ...mockGlobalState,
        notes: { ...mockGlobalState.notes, entities, ids },
      });

      it('returns notes whose timelineId matches any of the provided ids', () => {
        const note1 = {
          noteId: 'n1',
          note: 'note 1',
          timelineId: 'tl-a',
          eventId: 'ev-1',
          created: 1000,
          createdBy: 'alice',
          updated: 1000,
          updatedBy: 'alice',
          version: 'v1',
        };
        const note2 = {
          ...note1,
          noteId: 'n2',
          note: 'note 2',
          timelineId: 'tl-b',
        };
        const noteOther = { ...note1, noteId: 'n3', note: 'other', timelineId: 'tl-other' };
        const state = buildState({ n1: note1, n2: note2, n3: noteOther }, ['n1', 'n2', 'n3']);

        const selector = makeSelectNotesBySavedObjectIds();
        const result = selector(state, ['tl-a', 'tl-b']);

        expect(result).toHaveLength(2);
        const noteIds = result.map((n) => n.noteId);
        expect(noteIds).toContain('n1');
        expect(noteIds).toContain('n2');
        expect(noteIds).not.toContain('n3');
      });

      it('does not duplicate a note that appears in multiple id matches', () => {
        // A note can only have one timelineId, so duplication is impossible,
        // but the test documents this expectation explicitly.
        const note = {
          noteId: 'n1',
          note: 'note',
          timelineId: 'tl-a',
          eventId: 'ev-1',
          created: 1000,
          createdBy: 'alice',
          updated: 1000,
          updatedBy: 'alice',
          version: 'v1',
        };
        const state = buildState({ n1: note }, ['n1']);
        const selector = makeSelectNotesBySavedObjectIds();
        // Pass the same id twice — the result must still contain n1 only once.
        const result = selector(state, ['tl-a', 'tl-a']);
        expect(result).toHaveLength(1);
      });

      it('returns an empty array when no notes match any of the provided ids', () => {
        const selector = makeSelectNotesBySavedObjectIds();
        expect(selector(mockGlobalState, ['no-match-1', 'no-match-2'])).toHaveLength(0);
      });

      it('returns an empty array when the ids array is empty', () => {
        const selector = makeSelectNotesBySavedObjectIds();
        expect(selector(mockGlobalState, [])).toHaveLength(0);
      });

      it('filters out empty strings from the ids array', () => {
        const selector = makeSelectNotesBySavedObjectIds();
        // mockGlobalState has a note with timelineId 'timeline-1'; empty string should not match it.
        const result = selector(mockGlobalState, ['', '']);
        expect(result).toHaveLength(0);
      });
    });

    it('should select notes pagination', () => {
      const state = {
        ...mockGlobalState,
        notes: { ...initialNotesState, pagination: { page: 2, perPage: 20, total: 100 } },
      };
      expect(selectNotesPagination(state)).toEqual({ page: 2, perPage: 20, total: 100 });
    });

    it('should select notes table sort', () => {
      const notes: NotesState = {
        ...initialNotesState,
        sort: { field: 'created', direction: 'asc' },
      };
      const state = {
        ...mockGlobalState,
        notes,
      };
      expect(selectNotesTableSort(state)).toEqual({ field: 'created', direction: 'asc' });
    });

    it('should select notes table total items', () => {
      const state = {
        ...mockGlobalState,
        notes: {
          ...initialNotesState,
          pagination: { ...initialNotesState.pagination, total: 100 },
        },
      };
      expect(selectNotesPagination(state).total).toBe(100);
    });

    it('should select notes table selected ids', () => {
      const state = {
        ...mockGlobalState,
        notes: { ...initialNotesState, selectedIds: ['1', '2'] },
      };
      expect(selectNotesTableSelectedIds(state)).toEqual(['1', '2']);
    });

    it('should select notes table search', () => {
      const state = { ...mockGlobalState, notes: { ...initialNotesState, search: 'test search' } };
      expect(selectNotesTableSearch(state)).toBe('test search');
    });

    it('should select createdBy filter', () => {
      const state = {
        ...mockGlobalState,
        notes: { ...initialNotesState, createdByFilter: 'abc' },
      };
      expect(selectNotesTableCreatedByFilter(state)).toBe('abc');
    });

    it('should select associated filter', () => {
      const state = {
        ...mockGlobalState,
        notes: { ...initialNotesState, associatedFilter: AssociatedFilter.all },
      };
      expect(selectNotesTableAssociatedFilter(state)).toBe(AssociatedFilter.all);
    });

    it('should select notes table pending delete ids', () => {
      const state = {
        ...mockGlobalState,
        notes: { ...initialNotesState, pendingDeleteIds: ['1', '2'] },
      };
      expect(selectNotesTablePendingDeleteIds(state)).toEqual(['1', '2']);
    });

    it('should select delete notes status', () => {
      const state = {
        ...mockGlobalState,
        notes: {
          ...initialNotesState,
          status: { ...initialNotesState.status, deleteNotes: ReqStatus.Loading },
        },
      };
      expect(selectDeleteNotesStatus(state)).toBe(ReqStatus.Loading);
    });

    it('should select fetch notes error', () => {
      const error = new Error('Error fetching notes');
      const reudxToolKItError = miniSerializeError(error);
      const notes: NotesState = {
        ...initialNotesState,
        error: { ...initialNotesState.error, fetchNotes: reudxToolKItError },
      };
      const state = {
        ...mockGlobalState,
        notes,
      };
      const selectedError = selectFetchNotesError(state) as SerializedError;
      expect(selectedError.message).toBe('Error fetching notes');
    });

    it('should select fetch notes status', () => {
      const state = {
        ...mockGlobalState,
        notes: {
          ...initialNotesState,
          status: { ...initialNotesState.status, fetchNotes: ReqStatus.Succeeded },
        },
      };
      expect(selectFetchNotesStatus(state)).toBe(ReqStatus.Succeeded);
    });
  });
});
