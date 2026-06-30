/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsBulkResponse } from '@kbn/core/server';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { CASE_ATTACHMENT_SAVED_OBJECT, CASE_COMMENT_SAVED_OBJECT } from '../../../common/constants';
import { createUserAttachment } from '../../services/attachments/test_utils';
import { createErrorSO } from '../../services/test_utils';
import { resolveAttachmentSavedObjectTypes } from './saved_object_type';

type BulkGetSavedObjects = SavedObjectsBulkResponse['saved_objects'];

const mockBulkGetResponse = (savedObjects: unknown[]): SavedObjectsBulkResponse => ({
  saved_objects: savedObjects as BulkGetSavedObjects,
});

describe('resolveAttachmentSavedObjectTypes', () => {
  const client = savedObjectsClientMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns [] and skips bulkGet when called with no ids', async () => {
    await expect(resolveAttachmentSavedObjectTypes(client, [])).resolves.toEqual([]);
    expect(client.bulkGet).not.toHaveBeenCalled();
  });

  it('issues a single bulkGet probing both SO types per id', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createUserAttachment(), id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '2' },
        { ...createUserAttachment(), id: '2', type: CASE_COMMENT_SAVED_OBJECT },
      ])
    );

    await resolveAttachmentSavedObjectTypes(client, ['1', '2']);

    expect(client.bulkGet).toHaveBeenCalledTimes(1);
    expect(client.bulkGet).toHaveBeenCalledWith([
      { id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT },
      { id: '1', type: CASE_COMMENT_SAVED_OBJECT },
      { id: '2', type: CASE_ATTACHMENT_SAVED_OBJECT },
      { id: '2', type: CASE_COMMENT_SAVED_OBJECT },
    ]);
  });

  it('resolves to the unified SO when the unified entry hits', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createUserAttachment(), id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).resolves.toEqual([
      CASE_ATTACHMENT_SAVED_OBJECT,
    ]);
  });

  it('resolves to the legacy SO when only the legacy entry hits', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '1' },
        { ...createUserAttachment(), id: '1', type: CASE_COMMENT_SAVED_OBJECT },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).resolves.toEqual([
      CASE_COMMENT_SAVED_OBJECT,
    ]);
  });

  it('resolves to null when both entries 404', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '1' },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).resolves.toEqual([null]);
  });

  it('resolves multiple ids in mixed states by id-keyed lookup (not by response order)', async () => {
    // Respond with the legacy/unified rows in a different order than the request
    // to confirm the resolver doesn't rely on positional alignment.
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '3' },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '3' },
        { ...createUserAttachment(), id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '2' },
        { ...createUserAttachment(), id: '2', type: CASE_COMMENT_SAVED_OBJECT },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1', '2', '3'])).resolves.toEqual([
      CASE_ATTACHMENT_SAVED_OBJECT,
      CASE_COMMENT_SAVED_OBJECT,
      null,
    ]);
  });

  it('rejects when the unified entry returns a non-404 error', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT, { statusCode: 503 }), id: '1' },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).rejects.toThrow(
      `Failed to resolve attachment SO type for ${CASE_ATTACHMENT_SAVED_OBJECT}/1`
    );
  });

  it('rejects when the legacy entry returns a non-404 error', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createErrorSO(CASE_ATTACHMENT_SAVED_OBJECT), id: '1' },
        { ...createErrorSO(CASE_COMMENT_SAVED_OBJECT, { statusCode: 500 }), id: '1' },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).rejects.toThrow(
      `Failed to resolve attachment SO type for ${CASE_COMMENT_SAVED_OBJECT}/1`
    );
  });

  it('rejects when the unified entry is missing from the bulkGet response', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([{ ...createErrorSO(CASE_COMMENT_SAVED_OBJECT), id: '1' }])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).rejects.toThrow(
      /SO bulkGet response missing entry for id="1".*unified=false, legacy=true/
    );
  });

  it('rejects when the legacy entry is missing from the bulkGet response', async () => {
    client.bulkGet.mockResolvedValue(
      mockBulkGetResponse([
        { ...createUserAttachment(), id: '1', type: CASE_ATTACHMENT_SAVED_OBJECT },
      ])
    );

    await expect(resolveAttachmentSavedObjectTypes(client, ['1'])).rejects.toThrow(
      /SO bulkGet response missing entry for id="1".*unified=true, legacy=false/
    );
  });
});
