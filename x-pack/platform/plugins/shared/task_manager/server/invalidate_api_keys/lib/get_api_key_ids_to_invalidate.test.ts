/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsRepositoryMock } from '@kbn/core/server/mocks';
import { getApiKeyIdsToInvalidate } from './get_api_key_ids_to_invalidate';
import type {
  EncryptedSavedObjectsClient,
  EncryptedSavedObjectsClientOptions,
} from '@kbn/encrypted-saved-objects-shared';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';

const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const mockInvalidatePendingApiKeyObject1 = {
  id: '1',
  type: 'api_key_pending_invalidation',
  attributes: {
    apiKeyId: 'abcd====!',
    createdAt: '2024-04-11T17:08:44.035Z',
  },
  references: [],
};
const mockInvalidatePendingApiKeyObject2 = {
  id: '2',
  type: 'api_key_pending_invalidation',
  attributes: {
    apiKeyId: 'xyz!==!',
    createdAt: '2024-04-11T17:08:44.035Z',
  },
  references: [],
};

const mockInvalidatePendingUIAMApiKeyObject = {
  id: '2',
  type: 'api_key_pending_invalidation',
  attributes: {
    apiKeyId: '111',
    createdAt: '2024-04-11T17:08:44.035Z',
    uiamApiKey: 'essu_test_uiam_api_key',
  },
  references: [],
};

function createEncryptedSavedObjectsClientMock(opts?: EncryptedSavedObjectsClientOptions) {
  return {
    getDecryptedAsInternalUser: jest.fn(),
    createPointInTimeFinderDecryptedAsInternalUser: jest.fn((findOptions, deps) =>
      savedObjectsClientMock.create().createPointInTimeFinder(findOptions, deps)
    ),
  } as unknown as jest.Mocked<EncryptedSavedObjectsClient>;
}

describe('getApiKeyIdsToInvalidate', () => {
  describe('with encryptedSavedObjectsClient', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();

    test('should get decrypted api key pending invalidation saved object', async () => {
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
        mockInvalidatePendingApiKeyObject1
      );
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
        mockInvalidatePendingApiKeyObject2
      );

      const result = await getApiKeyIdsToInvalidate({
        apiKeySOsPendingInvalidation: {
          saved_objects: [
            {
              id: '1',
              type: 'api_key_pending_invalidation',
              score: 0,
              attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
              references: [],
            },
            {
              id: '2',
              type: 'api_key_pending_invalidation',
              score: 0,
              attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
              references: [],
            },
          ],
          total: 2,
          per_page: 10,
          page: 1,
        },
        encryptedSavedObjectsClient,
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
        savedObjectTypesToQuery: [],
      });

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(2);
      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
        1,
        'api_key_pending_invalidation',
        '1'
      );
      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
        2,
        'api_key_pending_invalidation',
        '2'
      );
      expect(internalSavedObjectsRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        apiKeyIdsToInvalidate: [
          { id: '1', apiKeyId: 'abcd====!' },
          { id: '2', apiKeyId: 'xyz!==!' },
        ],
        apiKeyIdsToExclude: [],
      });
    });

    test('should get decrypted UIAM api key pending invalidation saved object', async () => {
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
        mockInvalidatePendingApiKeyObject1
      );
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
        mockInvalidatePendingUIAMApiKeyObject
      );

      const result = await getApiKeyIdsToInvalidate({
        apiKeySOsPendingInvalidation: {
          saved_objects: [
            {
              id: '1',
              type: 'api_key_pending_invalidation',
              score: 0,
              attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
              references: [],
            },
            {
              id: '2',
              type: 'api_key_pending_invalidation',
              score: 0,
              attributes: {
                apiKeyId: '111',
                createdAt: '2024-04-11T17:08:44.035Z',
                uiamApiKey: 'essu_test_uiam_api_key',
              },
              references: [],
            },
          ],
          total: 2,
          per_page: 10,
          page: 1,
        },
        encryptedSavedObjectsClient,
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
        savedObjectTypesToQuery: [],
      });

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(2);
      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
        1,
        'api_key_pending_invalidation',
        '1'
      );
      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
        2,
        'api_key_pending_invalidation',
        '2'
      );
      expect(internalSavedObjectsRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        apiKeyIdsToInvalidate: [{ id: '1', apiKeyId: 'abcd====!' }],
        uiamApiKeysToInvalidate: [
          { id: '2', apiKeyId: '111', uiamApiKey: 'essu_test_uiam_api_key' },
        ],
        apiKeyIdsToExclude: [],
      });
    });
  });

  describe('without encryptedSavedObjectsClient', () => {
    test('should use saved object information', async () => {
      const result = await getApiKeyIdsToInvalidate({
        apiKeySOsPendingInvalidation: {
          saved_objects: [
            {
              id: '3',
              type: 'api_key_to_invalidate',
              score: 0,
              attributes: { apiKeyId: 'abc', createdAt: '2024-04-11T17:08:44.035Z' },
              references: [],
            },
            {
              id: '4',
              type: 'api_key_to_invalidate',
              score: 0,
              attributes: { apiKeyId: 'def', createdAt: '2024-04-11T17:08:44.035Z' },
              references: [],
            },
          ],
          total: 2,
          per_page: 10,
          page: 1,
        },
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_to_invalidate',
        savedObjectTypesToQuery: [],
      });

      expect(internalSavedObjectsRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        apiKeyIdsToInvalidate: [
          { id: '3', apiKeyId: 'abc' },
          { id: '4', apiKeyId: 'def' },
        ],
        apiKeyIdsToExclude: [],
      });
    });
  });

  test('should exclude some api key IDs when they are still in use by AD_HOC_RUN_SAVED_OBJECT_TYPE', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject1
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject2
    );
    // first call to find aggregates any AD_HOC_RUN_SAVED_OBJECT_TYPE SOs by apiKeyId
    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 2,
      page: 1,
      per_page: 10,
      aggregations: {
        apiKeyId: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'abcd====!', doc_count: 1 }],
        },
      },
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
          {
            id: '2',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        { type: 'ad_hoc_run_params', apiKeyAttributePath: 'ad_hoc_run_params.attributes.apiKeyId' },
      ],
    });

    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(2);
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
      1,
      'api_key_pending_invalidation',
      '1'
    );
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
      2,
      'api_key_pending_invalidation',
      '2'
    );
    expect(internalSavedObjectsRepository.find).toHaveBeenCalledWith({
      type: 'ad_hoc_run_params',
      perPage: 0,
      filter: `ad_hoc_run_params.attributes.apiKeyId: "abcd====!" OR ad_hoc_run_params.attributes.apiKeyId: "xyz!==!"`,
      namespaces: ['*'],
      aggs: {
        apiKeyId: {
          terms: {
            field: `ad_hoc_run_params.attributes.apiKeyId`,
            size: 100,
          },
        },
      },
    });
    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '2', apiKeyId: 'xyz!==!' }],
      apiKeyIdsToExclude: [{ id: '1', apiKeyId: 'abcd====!' }],
    });
  });

  test('should exclude some api key IDs when they are still in use by ACTION_TASK_PARAMS_SAVED_OBJECT_TYPE', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject1
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject2
    );
    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 2,
      page: 1,
      per_page: 10,
      aggregations: {
        apiKeyId: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'abcd====!', doc_count: 1 }],
        },
      },
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
          {
            id: '2',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        {
          type: 'action_task_params',
          apiKeyAttributePath: 'action_task_params.attributes.apiKeyId',
        },
      ],
    });

    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledTimes(2);
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
      1,
      'api_key_pending_invalidation',
      '1'
    );
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenNthCalledWith(
      2,
      'api_key_pending_invalidation',
      '2'
    );
    expect(internalSavedObjectsRepository.find).toHaveBeenCalledWith({
      type: 'action_task_params',
      perPage: 0,
      filter: `action_task_params.attributes.apiKeyId: "abcd====!" OR action_task_params.attributes.apiKeyId: "xyz!==!"`,
      namespaces: ['*'],
      aggs: {
        apiKeyId: {
          terms: {
            field: `action_task_params.attributes.apiKeyId`,
            size: 100,
          },
        },
      },
    });
    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '2', apiKeyId: 'xyz!==!' }],
      apiKeyIdsToExclude: [{ id: '1', apiKeyId: 'abcd====!' }],
    });
  });

  test('should exclude some api key IDs when they are still in use by TASK_SAVED_OBJECT_TYPE', async () => {
    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 2,
      page: 1,
      per_page: 10,
      aggregations: {
        apiKeyId: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'abcdefghijklmnop', doc_count: 1 }],
        },
      },
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_to_invalidate',
            score: 0,
            attributes: { apiKeyId: 'xyzaaaakkk', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
          {
            id: '2',
            type: 'api_key_to_invalidate',
            score: 0,
            attributes: { apiKeyId: 'abcdefghijklmnop', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        {
          type: 'task',
          apiKeyAttributePath: 'task.attributes.userScope.apiKeyId',
        },
      ],
    });

    expect(internalSavedObjectsRepository.find).toHaveBeenCalledWith({
      type: 'task',
      perPage: 0,
      filter: `task.attributes.userScope.apiKeyId: "xyzaaaakkk" OR task.attributes.userScope.apiKeyId: "abcdefghijklmnop"`,
      namespaces: ['*'],
      aggs: {
        apiKeyId: {
          terms: {
            field: `task.attributes.userScope.apiKeyId`,
            size: 100,
          },
        },
      },
    });
    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '1', apiKeyId: 'xyzaaaakkk' }],
      apiKeyIdsToExclude: [{ id: '2', apiKeyId: 'abcdefghijklmnop' }],
    });
  });

  test('should not fail the batch when encryptedSavedObjectsClient.getDecryptedAsInternalUser throws; the SO is collected as undecryptable', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    const decryptError = new Error('failfail');
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject1
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockImplementationOnce(() => {
      throw decryptError;
    });
    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 0,
      page: 1,
      per_page: 10,
      aggregations: {
        apiKeyId: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [],
        },
      },
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              apiKeyId: 'encryptedencrypted',
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
          {
            id: '2',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              apiKeyId: 'encryptedencrypted',
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        {
          type: 'ad_hoc_run_params',
          apiKeyAttributePath: 'ad_hoc_run_params.attributes.apiKeyId',
        },
      ],
    });

    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '1', apiKeyId: 'abcd====!' }],
      apiKeyIdsToExclude: [],
      undecryptableApiKeysToInvalidate: [
        {
          id: '2',
          apiKeyId: 'encryptedencrypted',
          uiamApiKey: undefined,
          error: decryptError,
        },
      ],
    });
  });

  test('should throw error if malformed savedObjectsClient.find response', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject1
    );

    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 2,
      page: 1,
      per_page: 10,
      // missing aggregations
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              apiKeyId: 'encryptedencrypted',
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        {
          type: 'task',
          apiKeyAttributePath: 'task.attributes.userScope.apiKeyId',
        },
      ],
    });

    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '1', apiKeyId: 'abcd====!' }],
      apiKeyIdsToExclude: [],
    });
  });

  test('should throw error if savedObjectsClient.find throws error', async () => {
    internalSavedObjectsRepository.find.mockImplementationOnce(() => {
      throw new Error('failfail');
    });
    await expect(
      getApiKeyIdsToInvalidate({
        apiKeySOsPendingInvalidation: {
          saved_objects: [
            {
              id: '1',
              type: 'api_key_to_invalidate',
              score: 0,
              attributes: {
                apiKeyId: 'abdedfasd',
                createdAt: '2024-04-11T17:08:44.035Z',
              },
              references: [],
            },
          ],
          total: 2,
          per_page: 10,
          page: 1,
        },
        savedObjectsClient: internalSavedObjectsRepository,
        savedObjectType: 'api_key_pending_invalidation',
        savedObjectTypesToQuery: [
          {
            type: 'task',
            apiKeyAttributePath: 'task.attributes.userScope.apiKeyId',
          },
        ],
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"failfail"`);
  });
});

describe('undecryptable saved objects', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should collect SOs that fail decryption with their raw stored attributes instead of failing the batch', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    const decryptError = new Error(
      'Failed to decrypt attribute "apiKeyId" of saved object "api_key_pending_invalidation,1": Invalid initialization vector'
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockRejectedValueOnce(decryptError);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(
      mockInvalidatePendingApiKeyObject2
    );

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              // raw stored values — plaintext when written by the pre-encryption-fix bug
              apiKeyId: 'plaintext-key-id',
              uiamApiKey: 'essu_plaintext_uiam_key',
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
          {
            id: '2',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: { apiKeyId: 'encryptedencrypted', createdAt: '2024-04-11T17:08:44.035Z' },
            references: [],
          },
        ],
        total: 2,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [],
    });

    expect(result).toEqual({
      apiKeyIdsToInvalidate: [{ id: '2', apiKeyId: 'xyz!==!' }],
      apiKeyIdsToExclude: [],
      undecryptableApiKeysToInvalidate: [
        {
          id: '1',
          apiKeyId: 'plaintext-key-id',
          uiamApiKey: 'essu_plaintext_uiam_key',
          error: decryptError,
        },
      ],
    });
  });

  test('should exclude an undecryptable SO whose raw apiKeyId is still in use', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    const decryptError = new Error(
      'Failed to decrypt attribute "apiKeyId" of saved object "api_key_pending_invalidation,1": Invalid initialization vector'
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockRejectedValueOnce(decryptError);
    internalSavedObjectsRepository.find.mockResolvedValueOnce({
      saved_objects: [],
      total: 1,
      page: 1,
      per_page: 10,
      aggregations: {
        apiKeyId: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'plaintext-key-id', doc_count: 1 }],
        },
      },
    });

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              apiKeyId: 'plaintext-key-id',
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
        ],
        total: 1,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [
        { type: 'ad_hoc_run_params', apiKeyAttributePath: 'ad_hoc_run_params.attributes.apiKeyId' },
      ],
    });

    expect(result).toEqual({
      apiKeyIdsToInvalidate: [],
      apiKeyIdsToExclude: [{ id: '1', apiKeyId: 'plaintext-key-id' }],
    });
  });

  test('should not clean up an undecryptable SO whose stored attributes are not recognizable as plaintext', async () => {
    const encryptedSavedObjectsClient = createEncryptedSavedObjectsClientMock();
    const logger = loggingSystemMock.createLogger();
    const decryptError = new Error(
      'Failed to decrypt attribute "apiKeyId" of saved object "api_key_pending_invalidation,1": Unsupported state or unable to authenticate data'
    );
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockRejectedValueOnce(decryptError);

    // valid ESO ciphertext shape: long standard base64 with +/= — not a plaintext key id
    const ciphertextApiKeyId = `${Buffer.from(new Array(100).fill(7)).toString('base64')}==`;

    const result = await getApiKeyIdsToInvalidate({
      apiKeySOsPendingInvalidation: {
        saved_objects: [
          {
            id: '1',
            type: 'api_key_pending_invalidation',
            score: 0,
            attributes: {
              apiKeyId: ciphertextApiKeyId,
              createdAt: '2024-04-11T17:08:44.035Z',
            },
            references: [],
          },
        ],
        total: 1,
        per_page: 10,
        page: 1,
      },
      encryptedSavedObjectsClient,
      logger,
      savedObjectsClient: internalSavedObjectsRepository,
      savedObjectType: 'api_key_pending_invalidation',
      savedObjectTypesToQuery: [],
    });

    // not deletable — excluded from this run so the fetch loop skips it, and kept loud
    expect(result).toEqual({
      apiKeyIdsToInvalidate: [],
      apiKeyIdsToExclude: [{ id: '1', apiKeyId: '' }],
    });
    expect(logger.error).toHaveBeenCalledWith(
      `Failed to decrypt "api_key_pending_invalidation" saved object "1": ${decryptError.message}`
    );
  });
});
