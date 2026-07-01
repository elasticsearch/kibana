/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser } from '@kbn/security-plugin/common';
import { coreMock, httpServerMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { KibanaRequest, RequestHandlerContext, SavedObject } from '@kbn/core/server';
import * as Boom from '@hapi/boom';

import type { SavedObjectNoteWithoutExternalRefs } from '../../../../../common/types/timeline/note/saved_object';
import type { FrameworkRequest } from '../../../framework';
import { internalFrameworkRequest } from '../../../framework';
import type { Note } from '../../../../../common/api/timeline';
import { requestContextMock } from '../../../detection_engine/routes/__mocks__/request_context';
import { noteFieldsMigrator } from './field_migrator';
import { pickSavedNote, persistNote, createNote, updateNote } from './saved_object';

jest.mock('uuid', () => ({
  v1: jest.fn().mockReturnValue('7ba7a520-03f4-11eb-9d9d-ffba20fabba8'),
}));

jest.mock('./saved_object', () => {
  const originalModule = jest.requireActual('./saved_object');
  return {
    ...originalModule,
    createNote: jest.fn(originalModule.createNote),
    updateNote: jest.fn(originalModule.updateNote),
    persistNote: jest.fn(originalModule.persistNote),
  };
});

jest.mock('./field_migrator', () => ({
  noteFieldsMigrator: {
    extractFieldsToReferences: jest.fn(),
    populateFieldsFromReferences: jest.fn(),
    populateFieldsFromReferencesForPatch: jest.fn(),
  },
}));

describe('saved_object pick', () => {
  const mockDateNow = new Date('2020-04-03T23:00:00.000Z').valueOf();
  const getMockSavedNote = (): Note => ({
    noteId: '7ba7a520-03f4-11eb-9d9d-ffba20fabba8',
    version: 'WzQ0ODEsMV0=',
    note: '789',
    timelineId: '7af80430-03f4-11eb-9d9d-ffba20fabba8',
    created: 1601563414477,
    createdBy: 'Elastic',
    updated: 1601563414477,
    updatedBy: 'Elastic',
  });

  beforeAll(() => {
    Date = jest.fn(() => ({
      valueOf: jest.fn().mockReturnValue(mockDateNow),
    })) as unknown as DateConstructor;
  });

  afterAll(() => {
    (Date as unknown as jest.Mock).mockRestore();
  });

  describe('Set create / update time correctly ', () => {
    test('Creating a note', () => {
      const savedNote = getMockSavedNote();
      const noteId = null;
      const userInfo = { username: 'elastic' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.created).toEqual(mockDateNow);
      expect(result.updated).toEqual(mockDateNow);
    });

    test('Updating a note', () => {
      const savedNote = getMockSavedNote();
      const noteId = savedNote.noteId ?? null;
      const userInfo = { username: 'elastic' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.created).toEqual(savedNote.created);
      expect(result.updated).toEqual(mockDateNow);
    });
  });

  describe('Set userInfo correctly ', () => {
    test('Creating a note', () => {
      const savedNote = getMockSavedNote();
      const noteId = null;
      const userInfo = { username: 'elastic' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(userInfo.username);
      expect(result.updatedBy).toEqual(userInfo.username);
    });

    test('Creating a note with user email', () => {
      const savedNote = getMockSavedNote();
      const noteId = null;
      const userInfo = { username: 'elastic', email: 'some@email.com' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(userInfo.email);
      expect(result.updatedBy).toEqual(userInfo.email);
    });

    test('Creating a note with user full name', () => {
      const savedNote = getMockSavedNote();
      const noteId = null;
      const userInfo = {
        username: 'elastic',
        email: 'some@email.com',
        full_name: 'Some Full Name',
      } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(userInfo.full_name);
      expect(result.updatedBy).toEqual(userInfo.full_name);
    });

    test('Updating a note', () => {
      const savedNote = getMockSavedNote();
      const noteId = savedNote.noteId ?? null;
      const userInfo = { username: 'elastic' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(savedNote.createdBy);
      expect(result.updatedBy).toEqual(userInfo.username);
    });

    test('Updating a note with user email', () => {
      const savedNote = getMockSavedNote();
      const noteId = savedNote.noteId ?? null;
      const userInfo = { username: 'elastic', email: 'some@email.com' } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(savedNote.createdBy);
      expect(result.updatedBy).toEqual(userInfo.email);
    });

    test('Updating a note with user full name', () => {
      const savedNote = getMockSavedNote();
      const noteId = savedNote.noteId ?? null;
      const userInfo = {
        username: 'elastic',
        email: 'some@email.com',
        full_name: 'Some Full Name',
      } as AuthenticatedUser;
      const result = pickSavedNote(noteId, savedNote, userInfo);

      expect(result.createdBy).toEqual(savedNote.createdBy);
      expect(result.updatedBy).toEqual(userInfo.full_name);
    });
  });
});

describe('persistNote', () => {
  const mockDateNow = new Date('2020-04-03T23:00:00.000Z').valueOf();
  const mockMigratedAttributes = {
    eventId: 'event1',
    note: 'Test note',
    created: 112089832019,
    createdBy: 'user1',
    updated: 120812001801,
    updatedBy: 'user1',
  };
  const mockReferences = [{ id: '', name: 'timeline', type: 'timeline' }];

  const mockNoteSavedObject: SavedObject<SavedObjectNoteWithoutExternalRefs> = {
    attributes: mockMigratedAttributes,
    type: 'siem-ui-timeline-note',
    id: 'test-id',
    references: [
      {
        id: '',
        name: 'timelineId',
        type: 'siem-ui-timeline',
      },
    ],
    managed: false,
    version: 'WzQ0ODEsMV0=',
    namespaces: ['default'],
    coreMigrationVersion: '8.8.0',
    typeMigrationVersion: '8.0.0',
    updated_at: '2024-06-25T22:56:01.354Z',
    updated_by: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
    created_at: '2024-06-25T22:56:01.354Z',
    created_by: 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0',
  };
  const mockSavedObjectClient = savedObjectsClientMock.create();
  const core = coreMock.createRequestHandlerContext();
  const context = {
    ...requestContextMock.create(),
    core: {
      ...core,
      savedObjects: {
        ...core.savedObjects,
        client: mockSavedObjectClient,
      },
    },
    resolve: jest.fn(),
  } as unknown as RequestHandlerContext;
  const mockNote = { eventId: 'id', note: 'test note', timelineId: '' };
  const mockRequest: FrameworkRequest = {
    ...httpServerMock.createKibanaRequest<
      KibanaRequest<
        unknown,
        unknown,
        { note: { eventId: string; note: string; timelineId: string | null } }
      >,
      RequestHandlerContext,
      AuthenticatedUser
    >({
      body: {
        note: mockNote,
      },
    }),
    [internalFrameworkRequest]: httpServerMock.createKibanaRequest(),
    context,
    user: {
      username: 'test',
      authentication_provider: { type: 'test', name: 'test' },
      full_name: 'test',
      authentication_type: 'test',
      authentication_realm: { type: 'test', name: 'test' },
      lookup_realm: { type: 'test', name: 'test' },
      enabled: true,
      elastic_cloud_user: false,
      roles: ['superuser'],
      http_authentication_scheme: null,
    },
  };
  const mockNoteResponse = {
    ...mockNote,
    ...mockMigratedAttributes,
    noteId: 'test-id',
    version: 'WzQ0ODEsMV0=',
  };
  beforeAll(() => {
    Date = jest.fn(() => ({
      valueOf: jest.fn().mockReturnValue(mockDateNow),
    })) as unknown as DateConstructor;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedObjectClient.get.mockResolvedValue(mockNoteSavedObject);
    mockSavedObjectClient.create.mockResolvedValue(mockNoteSavedObject);
    (noteFieldsMigrator.extractFieldsToReferences as jest.Mock).mockReturnValue({
      transformedFields: mockMigratedAttributes,
      references: mockReferences,
    });
    (noteFieldsMigrator.populateFieldsFromReferences as jest.Mock).mockReturnValue({
      ...mockNoteSavedObject,
      attributes: { ...mockNoteSavedObject.attributes, timelineId: '' },
    });
    (noteFieldsMigrator.populateFieldsFromReferencesForPatch as jest.Mock).mockReturnValue({
      ...mockNoteSavedObject,
      attributes: { ...mockNoteSavedObject.attributes, timelineId: '' },
    });
  });
  it('should call createNote when noteId is null', async () => {
    mockSavedObjectClient.find.mockResolvedValue({
      total: 0,
      saved_objects: [],
      per_page: 0,
      page: 0,
    });

    (createNote as jest.Mock).mockResolvedValue({ code: 200, message: 'success', note: mockNote });

    const result = await persistNote({ request: mockRequest, noteId: null, note: mockNote });

    expect(result).toEqual({
      code: 200,
      message: 'success',
      note: mockNoteResponse,
    });
  });

  it('should call updateNote when noteId is provided', async () => {
    const noteId = 'test-id';
    mockSavedObjectClient.find.mockResolvedValue({
      total: 0,
      saved_objects: [],
      per_page: 0,
      page: 0,
    });

    (updateNote as jest.Mock).mockResolvedValue({ code: 200, message: 'success', note: mockNote });

    const result = await persistNote({ request: mockRequest, noteId, note: mockNote });

    expect(result).toEqual({ code: 200, message: 'success', note: mockNoteResponse });
  });

  it('should handle 403 errors', async () => {
    mockSavedObjectClient.find.mockResolvedValue({
      total: 101,
      saved_objects: [],
      per_page: 0,
      page: 0,
    });
    (createNote as jest.Mock).mockResolvedValue({
      code: 403,
      message:
        'Cannot create more than 100 notes per document without associating them to a timeline',
      note: mockNote,
    });

    await expect(
      persistNote({ request: mockRequest, noteId: null, note: mockNote })
    ).rejects.toThrow(
      Boom.forbidden(
        'Cannot create more than 100 notes per document without associating them to a timeline'
      )
    );
  });
});
