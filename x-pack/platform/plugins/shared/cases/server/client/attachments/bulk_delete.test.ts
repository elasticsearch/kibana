/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { File } from '@kbn/files-plugin/common';
import { FileNotFoundError } from '@kbn/files-plugin/server/file_service/errors';
import {
  bulkDeleteAttachments,
  bulkDeleteFileAttachments,
  retrieveFilesIgnoringNotFound,
} from './bulk_delete';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  MAX_BULK_DELETE_ATTACHMENTS,
  MAX_DELETE_FILES,
} from '../../../common/constants';
import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import { Operations } from '../../authorization';
import { mockCaseComments } from '../../mocks';
import { createCasesClientMock, createCasesClientMockArgs } from '../mocks';

describe('bulk_delete', () => {
  describe('bulkDeleteFileAttachments', () => {
    describe('errors', () => {
      const casesClient = createCasesClientMock();
      const clientArgs = createCasesClientMockArgs();

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it(`throws 400 when trying to delete more than ${MAX_DELETE_FILES} files at a time`, async () => {
        const fileIds = new Array(MAX_DELETE_FILES + 1).fill('fake-ids');

        await expect(
          bulkDeleteFileAttachments({ caseId: 'mock-id', fileIds }, clientArgs, casesClient)
        ).rejects.toThrow(
          'Failed to delete file attachments for case: mock-id: Error: The length of the field ids is too long. Array must be of length <= 10'
        );
      });
    });
  });

  describe('bulkDeleteAttachments', () => {
    const clientArgs = createCasesClientMockArgs();
    const userComment = mockCaseComments[0];
    const otherUserComment = mockCaseComments[1];
    const alertAttachment = mockCaseComments[3];
    // `security.attack` is a unified-only type: it exists solely in the unified saved object and
    // cannot be transformed into the legacy attachment schema.
    const attackAttachment = {
      type: CASE_ATTACHMENT_SAVED_OBJECT,
      id: 'mock-attack-attachment-1',
      attributes: {
        ...userComment.attributes,
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-doc-1',
        metadata: {
          title: 'Credential harvesting',
          alertCount: 1,
          index: '.alerts-security.attack.discovery.alerts-default',
        },
      },
      references: [{ type: 'cases', name: 'associated-cases', id: 'mock-id-1' }],
      updated_at: '2019-11-25T22:32:30.608Z',
      version: 'WzYsMV0=',
    } as unknown as (typeof mockCaseComments)[number];

    beforeEach(() => {
      jest.clearAllMocks();

      clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
        saved_objects: [userComment, otherUserComment],
      });
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map()
      );
    });

    it('deletes all the requested attachments in a single call and refreshes', async () => {
      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-2'] },
        clientArgs
      );

      expect(clientArgs.services.attachmentService.bulkDelete).toHaveBeenCalledWith({
        savedObjectIds: ['mock-comment-1', 'mock-comment-2'],
        refresh: true,
      });
    });

    it('deduplicates the requested ids', async () => {
      clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
        saved_objects: [userComment],
      });

      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-1'] },
        clientArgs
      );

      expect(clientArgs.services.attachmentService.getter.bulkGet).toHaveBeenCalledWith(
        ['mock-comment-1'],
        'unified'
      );
      expect(clientArgs.services.attachmentService.bulkDelete).toHaveBeenCalledWith({
        savedObjectIds: ['mock-comment-1'],
        refresh: true,
      });
    });

    it('authorizes every attachment owner', async () => {
      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-2'] },
        clientArgs
      );

      expect(clientArgs.authorization.ensureAuthorized).toHaveBeenCalledWith({
        entities: [
          { id: 'mock-comment-1', owner: 'securitySolution' },
          { id: 'mock-comment-2', owner: 'securitySolution' },
        ],
        operation: Operations.deleteComment,
      });
    });

    it('records a user action for each deleted attachment', async () => {
      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-2'] },
        clientArgs
      );

      expect(
        clientArgs.services.userActionService.creator.bulkCreateAttachmentDeletion
      ).toHaveBeenCalledWith({
        caseId: 'mock-id-1',
        attachments: [
          expect.objectContaining({ id: 'mock-comment-1', owner: 'securitySolution' }),
          expect.objectContaining({ id: 'mock-comment-2', owner: 'securitySolution' }),
        ],
        user: expect.anything(),
      });
    });

    it('updates the case attachment stats', async () => {
      clientArgs.services.attachmentService.getter.getCaseAttatchmentStats.mockResolvedValue(
        new Map([['mock-id-1', { userComments: 1, alerts: 3, events: 2 }]])
      );

      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-2'] },
        clientArgs
      );

      const args = clientArgs.services.caseService.patchCase.mock.calls[0][0];

      expect(args.updatedAttributes.total_comments).toEqual(1);
      expect(args.updatedAttributes.total_alerts).toEqual(3);
      expect(args.updatedAttributes.total_events).toEqual(2);
    });

    it('removes the case id from the deleted alerts', async () => {
      clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
        saved_objects: [alertAttachment],
      });

      await bulkDeleteAttachments(
        { caseId: 'mock-id-4', attachmentIds: ['mock-comment-4'] },
        clientArgs
      );

      expect(clientArgs.services.alertsService.removeCaseIdFromAlerts).toHaveBeenCalledWith({
        alerts: [{ id: 'test-id', index: 'test-index' }],
        caseId: 'mock-id-4',
      });
    });

    it('deletes a unified-only attachment, which has no legacy representation', async () => {
      clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
        saved_objects: [attackAttachment],
      });

      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-attack-attachment-1'] },
        clientArgs
      );

      expect(clientArgs.services.attachmentService.bulkDelete).toHaveBeenCalledWith({
        savedObjectIds: ['mock-attack-attachment-1'],
        refresh: true,
      });
    });

    it('does not call the alert service when no alert was deleted', async () => {
      await bulkDeleteAttachments(
        { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-2'] },
        clientArgs
      );

      expect(clientArgs.services.alertsService.removeCaseIdFromAlerts).not.toHaveBeenCalled();
    });

    describe('errors', () => {
      it(`throws when trying to delete more than ${MAX_BULK_DELETE_ATTACHMENTS} attachments at a time`, async () => {
        const attachmentIds = new Array(MAX_BULK_DELETE_ATTACHMENTS + 1)
          .fill('id')
          .map((id, index) => `${id}-${index}`);

        await expect(
          bulkDeleteAttachments({ caseId: 'mock-id-1', attachmentIds }, clientArgs)
        ).rejects.toThrow(
          `Failed to bulk delete attachments for case: mock-id-1: Error: The length of the field ids is too long. Array must be of length <= ${MAX_BULK_DELETE_ATTACHMENTS}`
        );
      });

      it('throws when the ids are empty', async () => {
        await expect(
          bulkDeleteAttachments({ caseId: 'mock-id-1', attachmentIds: [] }, clientArgs)
        ).rejects.toThrow(
          'Failed to bulk delete attachments for case: mock-id-1: Error: The length of the field ids is too short. Array must be of length >= 1'
        );
      });

      it('throws a not found error when an attachment does not exist', async () => {
        clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
          saved_objects: [
            userComment,
            {
              id: 'does-not-exist',
              type: 'cases-comment',
              error: { error: 'Not Found', message: 'Not found', statusCode: 404 },
              references: [],
            },
          ],
        });

        await expect(
          bulkDeleteAttachments(
            { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'does-not-exist'] },
            clientArgs
          )
        ).rejects.toThrow('These attachments does-not-exist do not exist in mock-id-1.');

        expect(clientArgs.services.attachmentService.bulkDelete).not.toHaveBeenCalled();
      });

      it('throws a not found error when an attachment belongs to another case', async () => {
        clientArgs.services.attachmentService.getter.bulkGet.mockResolvedValue({
          saved_objects: [userComment, alertAttachment],
        });

        await expect(
          bulkDeleteAttachments(
            { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1', 'mock-comment-4'] },
            clientArgs
          )
        ).rejects.toThrow('These attachments mock-comment-4 do not exist in mock-id-1.');

        expect(clientArgs.services.attachmentService.bulkDelete).not.toHaveBeenCalled();
      });

      it('does not delete anything when the user is not authorized', async () => {
        clientArgs.authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

        await expect(
          bulkDeleteAttachments(
            { caseId: 'mock-id-1', attachmentIds: ['mock-comment-1'] },
            clientArgs
          )
        ).rejects.toThrow(
          'Failed to bulk delete attachments for case: mock-id-1: Error: Unauthorized'
        );

        expect(clientArgs.services.attachmentService.bulkDelete).not.toHaveBeenCalled();
      });
    });
  });

  describe('retrieveFilesIgnoringNotFound', () => {
    const mockLogger = loggerMock.create();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns an empty array when the results is an empty array', () => {
      expect(retrieveFilesIgnoringNotFound([], [], mockLogger)).toEqual([]);
    });

    it('returns a fulfilled file', async () => {
      expect(retrieveFilesIgnoringNotFound([createFakeFile()], ['abc'], mockLogger)).toEqual([{}]);
    });

    it('logs a warning when encountering a file not found error', async () => {
      const fileNotFound = new FileNotFoundError('not found');

      expect(retrieveFilesIgnoringNotFound([fileNotFound], ['abc'], mockLogger)).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn.mock.calls[0]).toMatchInlineSnapshot(`
        Array [
          "Failed to find file id: abc: Error: not found",
        ]
      `);
    });

    it('logs a warning without the fileId when the results length is different from the file ids', async () => {
      const fileNotFound = new FileNotFoundError('not found');

      expect(retrieveFilesIgnoringNotFound([fileNotFound], ['abc', '123'], mockLogger)).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn.mock.calls[0]).toMatchInlineSnapshot(`
        Array [
          "Failed to find file: Error: not found",
        ]
      `);
    });

    it('throws when encountering an error that is not a file not found', async () => {
      const otherError = new Error('other error');

      expect.assertions(2);

      expect(() => retrieveFilesIgnoringNotFound([otherError], ['abc'], mockLogger)).toThrow(
        otherError
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('throws when encountering an error that is not a file not found after a valid file', async () => {
      const otherError = new Error('other error');
      const fileResult = createFakeFile();

      expect.assertions(2);

      expect(() =>
        retrieveFilesIgnoringNotFound([fileResult, otherError], ['1', '2'], mockLogger)
      ).toThrow(otherError);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});

const createFakeFile = () => {
  return {} as File;
};
