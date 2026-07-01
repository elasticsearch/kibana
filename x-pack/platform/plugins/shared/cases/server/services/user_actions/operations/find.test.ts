/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { UserActionFinder } from './find';
import { createSavedObjectsSerializerMock } from '../../../client/mocks';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import {
  createConnectorUserAction,
  createUserActionFindSO,
  createUserActionSO,
} from '../test_utils';
import { createSOFindResponse, mockPointInTimeFinder } from '../../test_utils';
import { omit } from 'lodash';
import type { SavedObjectsFindResponse } from '@kbn/core/server';

describe('UserActionsService: Finder', () => {
  const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
  const mockLogger = loggerMock.create();
  const auditMockLocker = auditLoggerMock.create();
  const savedObjectsSerializer = createSavedObjectsSerializerMock();

  const attributesToValidateIfMissing = ['created_at', 'created_by', 'owner', 'action', 'payload'];

  let finder: UserActionFinder;

  beforeEach(() => {
    jest.resetAllMocks();
    finder = new UserActionFinder({
      log: mockLogger,
      unsecuredSavedObjectsClient,
      savedObjectsSerializer,
      auditLogger: auditMockLocker,
    });
  });

  const mockFind = (soFindRes: SavedObjectsFindResponse) => {
    unsecuredSavedObjectsClient.find.mockResolvedValue(soFindRes);
  };

  const mockFinder = (soFindRes: SavedObjectsFindResponse) =>
    mockPointInTimeFinder(unsecuredSavedObjectsClient)(soFindRes);

  const decodingTests: Array<
    [keyof UserActionFinder, (soFindRes: SavedObjectsFindResponse) => void]
  > = [
    ['find', mockFind],
    ['findAll', mockFinder],
    ['findStatusChanges', mockFinder],
  ];

  describe('find', () => {
    it('sets the comment_id to null if it is omitted', async () => {
      const userAction = createUserActionSO();
      const attributes = omit({ ...userAction.attributes }, 'comment_id');
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      mockFind(soFindRes);

      const res = await finder.find({ caseId: '1' });
      const commentId = res.saved_objects[0].attributes.comment_id;

      expect(commentId).toBe(null);
    });

    describe('types filter', () => {
      beforeEach(() => {
        const userAction = createUserActionSO();
        const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
        mockFind(soFindRes);
      });

      it('filters by type=comment and action=create when types includes "user"', async () => {
        await finder.find({ caseId: '1', types: ['user'] });

        expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: expect.objectContaining({
              arguments: expect.arrayContaining([
                expect.objectContaining({
                  arguments: expect.arrayContaining([
                    expect.objectContaining({
                      value: 'cases-user-actions.attributes.type',
                    }),
                    expect.objectContaining({
                      value: 'comment',
                    }),
                  ]),
                }),
                expect.objectContaining({
                  arguments: expect.arrayContaining([
                    expect.objectContaining({
                      value: 'cases-user-actions.attributes.action',
                    }),
                    expect.objectContaining({
                      value: 'create',
                    }),
                  ]),
                }),
              ]),
            }),
          })
        );
      });
    });

    describe('author filter', () => {
      beforeEach(() => {
        const userAction = createUserActionSO();
        const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
        mockFind(soFindRes);
      });

      it('applies author filter on created_by.username', async () => {
        await finder.find({ caseId: '1', author: 'testuser' });

        expect(unsecuredSavedObjectsClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: expect.objectContaining({
              type: 'function',
              function: 'is',
              arguments: expect.arrayContaining([
                expect.objectContaining({
                  value: 'cases-user-actions.attributes.created_by.username',
                }),
                expect.objectContaining({
                  value: 'testuser',
                }),
              ]),
            }),
          })
        );
      });

      it('does not apply author filter when author is not provided', async () => {
        await finder.find({ caseId: '1' });

        const callFilter = unsecuredSavedObjectsClient.find.mock.calls[0][0].filter;
        expect(callFilter).toBeUndefined();
      });
    });
  });

  describe('findAll', () => {
    it('uses createPointInTimeFinder to fetch all user actions', async () => {
      const userAction = createUserActionSO();
      const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
      mockFinder(soFindRes);

      const res = await finder.findAll({ caseId: '1' });

      expect(unsecuredSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalled();
      expect(res).toHaveLength(1);
    });

    it('applies author filter in findAll', async () => {
      const userAction = createUserActionSO();
      const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
      mockFinder(soFindRes);

      await finder.findAll({ caseId: '1', author: 'testuser' });

      expect(unsecuredSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            type: 'function',
            function: 'is',
            arguments: expect.arrayContaining([
              expect.objectContaining({
                value: 'cases-user-actions.attributes.created_by.username',
              }),
              expect.objectContaining({
                value: 'testuser',
              }),
            ]),
          }),
        })
      );
    });

    it('applies types filter in findAll', async () => {
      const userAction = createUserActionSO();
      const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
      mockFinder(soFindRes);

      await finder.findAll({ caseId: '1', types: ['status'] });

      expect(unsecuredSavedObjectsClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            type: 'function',
            function: 'is',
            arguments: expect.arrayContaining([
              expect.objectContaining({
                value: 'cases-user-actions.attributes.type',
              }),
              expect.objectContaining({
                value: 'status',
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('findStatusChanges', () => {
    it('sets the comment_id to null if it is omitted', async () => {
      const userAction = createUserActionSO();
      const attributes = omit({ ...userAction.attributes }, 'comment_id');
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      mockFinder(soFindRes);

      const res = await finder.findStatusChanges({ caseId: '1' });
      const commentId = res[0].attributes.comment_id;

      expect(commentId).toBe(null);
    });
  });

  describe.each(decodingTests)('Decoding: %s', (soMethodName, method) => {
    it('decodes correctly', async () => {
      const userAction = createUserActionSO();
      const soFindRes = createSOFindResponse([createUserActionFindSO(userAction)]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).resolves.not.toThrow();
    });

    it.each(attributesToValidateIfMissing)('throws if %s is omitted', async (key) => {
      const userAction = createUserActionSO();
      const attributes = omit({ ...userAction.attributes }, key);
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).rejects.toThrow(
        `Invalid value "undefined" supplied to "${key}"`
      );
    });

    it('throws if type is omitted', async () => {
      const userAction = createUserActionSO();
      const attributes = omit({ ...userAction.attributes }, 'type');
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).rejects.toThrow();
    });

    it('throws if missing attributes from the payload', async () => {
      const userAction = createUserActionSO();
      const attributes = omit({ ...userAction.attributes }, 'payload.title');
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).rejects.toThrow(
        'Invalid value "undefined" supplied to "payload,title"'
      );
    });

    it('throws if missing nested attributes from the payload', async () => {
      const userAction = createConnectorUserAction();
      const attributes = omit({ ...userAction.attributes }, 'payload.connector.fields.issueType');
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).rejects.toThrow(
        'Invalid value "undefined" supplied to "payload,connector,fields,issueType",Invalid value "{"priority":"high","parent":"2"}" supplied to "payload,connector,fields"'
      );
    });

    it('strips out excess attributes', async () => {
      const userAction = createUserActionSO();
      const attributes = { ...userAction.attributes, 'not-exists': 'not-exists' };
      const soFindRes = createSOFindResponse([{ ...userAction, attributes, score: 0 }]);
      method(soFindRes);

      await expect(finder[soMethodName]({ caseId: '1' })).resolves.toMatchSnapshot();
    });
  });
});
