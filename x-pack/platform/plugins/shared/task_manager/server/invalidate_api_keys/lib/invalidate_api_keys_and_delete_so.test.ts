/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsRepositoryMock } from '@kbn/core/server/mocks';
import { invalidateApiKeysAndDeletePendingApiKeySavedObject } from './invalidate_api_keys_and_delete_so';

const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const invalidateApiKeyFn = jest.fn();

describe('invalidateApiKeysAndDeletePendingApiKeySavedObject', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should succeed when there are no api keys to invalidate', async () => {
    const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
      apiKeyIdsToInvalidate: [],
      invalidateApiKeyFn,
      logger,
      missingApiKeyRetries: {},
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
    });
    expect(result.totalInvalidated).toEqual(0);
    expect(result.missingApiKeyRetries).toEqual({});
    expect(logger.debug).toHaveBeenCalledWith(`Total invalidated API keys "0"`);
  });

  test('should succeed when there are api keys to invalidate', async () => {
    invalidateApiKeyFn.mockResolvedValue({
      invalidated_api_keys: ['1', '2'],
      previously_invalidated_api_keys: [],
      error_count: 0,
    });
    const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
      apiKeyIdsToInvalidate: [
        { id: '1', apiKeyId: 'abcd====!' },
        { id: '2', apiKeyId: 'xyz!==!' },
      ],
      invalidateApiKeyFn,
      logger,
      missingApiKeyRetries: {},
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_to_invalidate',
    });
    expect(invalidateApiKeyFn).toHaveBeenCalledWith({
      ids: ['abcd====!', 'xyz!==!'],
    });
    expect(internalSavedObjectsRepository.delete).toHaveBeenCalledTimes(2);
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      1,
      'api_key_to_invalidate',
      '1'
    );
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      2,
      'api_key_to_invalidate',
      '2'
    );
    expect(result.totalInvalidated).toEqual(2);
    expect(logger.debug).toHaveBeenCalledWith(`Total invalidated API keys "2"`);
  });

  test('should handle errors during invalidation', async () => {
    invalidateApiKeyFn.mockResolvedValueOnce({
      invalidated_api_keys: ['1'],
      previously_invalidated_api_keys: [],
      error_count: 1,
    });
    const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
      apiKeyIdsToInvalidate: [
        { id: '1', apiKeyId: 'abcd====!' },
        { id: '2', apiKeyId: 'xyz!==!' },
      ],
      invalidateApiKeyFn,
      logger,
      missingApiKeyRetries: {},
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
    });
    expect(invalidateApiKeyFn).toHaveBeenCalledWith({
      ids: ['abcd====!', 'xyz!==!'],
    });
    expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(`Failed to invalidate API Keys [count=\"2\"]`);
    expect(result.totalInvalidated).toEqual(0);
    expect(logger.debug).toHaveBeenCalledWith(`Total invalidated API keys "0"`);
  });

  test('should handle null security plugin', async () => {
    const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
      apiKeyIdsToInvalidate: [
        { id: '1', apiKeyId: 'abcd====!' },
        { id: '2', apiKeyId: 'xyz!==!' },
      ],
      logger,
      missingApiKeyRetries: {},
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
    });
    expect(invalidateApiKeyFn).not.toHaveBeenCalled();
    expect(internalSavedObjectsRepository.delete).toHaveBeenCalledTimes(2);
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      1,
      'api_key_pending_invalidation',
      '1'
    );
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      2,
      'api_key_pending_invalidation',
      '2'
    );
    expect(result.totalInvalidated).toEqual(2);
    expect(logger.debug).toHaveBeenCalledWith(`Total invalidated API keys "2"`);
  });

  test('should handle null result from invalidateAsInternalUser', async () => {
    invalidateApiKeyFn.mockResolvedValueOnce(null);
    const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
      apiKeyIdsToInvalidate: [
        { id: '1', apiKeyId: 'abcd====!' },
        { id: '2', apiKeyId: 'xyz!==!' },
      ],
      invalidateApiKeyFn,
      logger,
      missingApiKeyRetries: {},
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_to_invalidate',
    });
    expect(invalidateApiKeyFn).toHaveBeenCalledWith({
      ids: ['abcd====!', 'xyz!==!'],
    });
    expect(internalSavedObjectsRepository.delete).toHaveBeenCalledTimes(2);
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      1,
      'api_key_to_invalidate',
      '1'
    );
    expect(internalSavedObjectsRepository.delete).toHaveBeenNthCalledWith(
      2,
      'api_key_to_invalidate',
      '2'
    );
    expect(result.totalInvalidated).toEqual(2);
    expect(logger.debug).toHaveBeenCalledWith(`Total invalidated API keys "2"`);
  });

  describe('UIAM API key invalidation', () => {
    const invalidateUiamApiKeyFn = jest.fn();

    beforeEach(() => {
      invalidateUiamApiKeyFn.mockReset();
    });

    test('should delete SO when UIAM invalidation succeeds', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: ['uiam_key_1'],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.totalInvalidated).toEqual(1);
    });

    test('should delete SO and warn when UIAM returns APIKEY_REVOKED (0xD38358)', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [{ type: 'exception', code: '0xD38358', reason: 'APIKEY_REVOKED' }],
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('UIAM APIKey is already revoked'),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.totalInvalidated).toEqual(1);
    });

    test('should NOT delete SO when UIAM returns APIKEY_MISSING and retry count is below threshold', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [{ type: 'exception', code: '0x28D520', reason: 'APIKEY_MISSING' }],
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('UIAM APIKey not found, will retry (1/5)'),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();
      expect(result.totalInvalidated).toEqual(0);
      expect(result.missingApiKeyRetries).toEqual({ so_1: 1 });
    });

    test('should delete SO after APIKEY_MISSING reaches the retry threshold', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [{ type: 'exception', code: '0x28D520', reason: 'APIKEY_MISSING' }],
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: { so_1: 4 },
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('UIAM APIKey not found after 5 attempts'),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.totalInvalidated).toEqual(1);
      expect(result.missingApiKeyRetries).not.toHaveProperty('so_1');
    });

    test('should clean up retry entry when SO is successfully deleted', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: ['uiam_key_1'],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: { so_1: 2 },
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.missingApiKeyRetries).not.toHaveProperty('so_1');
    });

    test('should not mutate the input missingApiKeyRetries', async () => {
      const inputRetries: Record<string, number> = { so_1: 2 };
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [{ type: 'exception', code: '0x28D520', reason: 'APIKEY_MISSING' }],
      });

      await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: inputRetries,
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(inputRetries).toEqual({ so_1: 2 });
    });

    test('should NOT delete SO when UIAM returns an unknown error', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [{ type: 'exception', reason: 'Internal Server Error' }],
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to invalidate UIAM APIKey'),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();
      expect(result.totalInvalidated).toEqual(0);
    });

    test('should delete SO when UIAM security is disabled', async () => {
      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        uiamApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'uiam_key_1', uiamApiKey: 'essu_cred_1' },
        ],
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.totalInvalidated).toEqual(1);
    });
  });

  describe('undecryptable API key invalidation', () => {
    const invalidateUiamApiKeyFn = jest.fn();
    const decryptError = new Error(
      'Failed to decrypt attribute "apiKeyId" of saved object "api_key_pending_invalidation,so_1": Invalid initialization vector'
    );

    beforeEach(() => {
      invalidateUiamApiKeyFn.mockReset();
    });

    test('should invalidate with raw UIAM values and delete SO when raw uiamApiKey is a UIAM credential', async () => {
      invalidateUiamApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: ['plaintext-key-id'],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        undecryptableApiKeysToInvalidate: [
          {
            id: 'so_1',
            apiKeyId: 'plaintext-key-id',
            uiamApiKey: 'essu_plaintext_key',
            error: decryptError,
          },
        ],
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(invalidateUiamApiKeyFn).toHaveBeenCalledTimes(1);
      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Deleted undecryptable "api_key_pending_invalidation" saved object "so_1"'
        ),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('UIAM key invalidated with raw stored value'),
        expect.anything()
      );
      expect(result.totalInvalidated).toEqual(1);
    });

    test('should invalidate with raw ES key id and delete SO when there is no UIAM credential', async () => {
      invalidateApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: ['plaintext-key-id'],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        undecryptableApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'plaintext-key-id', error: decryptError },
        ],
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(invalidateApiKeyFn).toHaveBeenCalledWith({ ids: ['plaintext-key-id'] });
      expect(invalidateUiamApiKeyFn).not.toHaveBeenCalled();
      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(result.totalInvalidated).toEqual(1);
    });

    test('should still delete SO when the raw-value invalidation attempt errors', async () => {
      invalidateApiKeyFn.mockRejectedValueOnce(new Error('invalidation exploded'));

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        undecryptableApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'garbage-ciphertext', error: decryptError },
        ],
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        'api_key_pending_invalidation',
        'so_1'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('invalidation attempt errored: invalidation exploded'),
        expect.anything()
      );
      expect(result.totalInvalidated).toEqual(1);
    });

    test('should log an error and not count the SO when deletion fails', async () => {
      invalidateApiKeyFn.mockResolvedValueOnce({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });
      internalSavedObjectsRepository.delete.mockRejectedValueOnce(new Error('delete failed'));

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate: [],
        undecryptableApiKeysToInvalidate: [
          { id: 'so_1', apiKeyId: 'plaintext-key-id', error: decryptError },
        ],
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries: {},
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to delete undecryptable "api_key_pending_invalidation" saved object "so_1"'
        ),
        expect.objectContaining({ tags: expect.arrayContaining(['uiam-api-key-invalidate']) })
      );
      expect(result.totalInvalidated).toEqual(0);
    });
  });
});
