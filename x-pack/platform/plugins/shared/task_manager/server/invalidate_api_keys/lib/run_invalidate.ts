/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';
import type { ApiKeyToInvalidate } from '../../saved_objects/schemas/api_key_to_invalidate';
import { getFindFilter } from './get_find_filter';
import { getApiKeyIdsToInvalidate } from './get_api_key_ids_to_invalidate';
import { PAGE_SIZE } from './constants';
import { invalidateApiKeysAndDeletePendingApiKeySavedObject } from './invalidate_api_keys_and_delete_so';
import type { ApiKeyInvalidationFn, UiamApiKeyInvalidationFn } from '../invalidate_api_keys_task';

export interface SavedObjectTypesToQuery {
  type: string;
  apiKeyAttributePath: string;
}

interface RunInvalidateOpts {
  encryptedSavedObjectsClient?: EncryptedSavedObjectsClient;
  invalidateApiKeyFn?: ApiKeyInvalidationFn;
  invalidateUiamApiKeyFn?: UiamApiKeyInvalidationFn;
  logger: Logger;
  missingApiKeyRetries?: Record<string, number>;
  removalDelay: string;
  savedObjectsClient: SavedObjectsClientContract;
  savedObjectType: string;
  savedObjectTypesToQuery: SavedObjectTypesToQuery[];
}

export interface RunInvalidateResult {
  totalInvalidated: number;
  missingApiKeyRetries: Record<string, number>;
}

export async function runInvalidate(opts: RunInvalidateOpts): Promise<RunInvalidateResult> {
  const {
    encryptedSavedObjectsClient,
    invalidateApiKeyFn,
    invalidateUiamApiKeyFn,
    logger,
    removalDelay,
    savedObjectsClient,
    savedObjectType,
  } = opts;

  let hasMoreApiKeysPendingInvalidation = true;
  let missingApiKeyRetries = opts.missingApiKeyRetries ?? {};
  let totalInvalidated = 0;

  const excludedSOIds = new Set<string>();

  do {
    const filter = getFindFilter({
      removalDelay,
      excludedSOIds: [...excludedSOIds],
      savedObjectType,
    });
    const apiKeysToInvalidate = await savedObjectsClient.find<ApiKeyToInvalidate>({
      type: savedObjectType,
      page: 1,
      sortField: 'createdAt',
      sortOrder: 'asc',
      perPage: PAGE_SIZE,
      ...(filter.length > 0 ? { filter } : {}),
    });

    if (apiKeysToInvalidate.total > 0) {
      const {
        apiKeyIdsToExclude,
        apiKeyIdsToInvalidate,
        uiamApiKeysToInvalidate,
        undecryptableApiKeysToInvalidate,
      } = await getApiKeyIdsToInvalidate({
        apiKeySOsPendingInvalidation: apiKeysToInvalidate,
        encryptedSavedObjectsClient,
        logger,
        savedObjectsClient,
        savedObjectType,
        savedObjectTypesToQuery: opts.savedObjectTypesToQuery,
      });
      apiKeyIdsToExclude.forEach(({ id }) => excludedSOIds.add(id));

      const result = await invalidateApiKeysAndDeletePendingApiKeySavedObject({
        apiKeyIdsToInvalidate,
        uiamApiKeysToInvalidate,
        undecryptableApiKeysToInvalidate,
        invalidateApiKeyFn,
        invalidateUiamApiKeyFn,
        logger,
        missingApiKeyRetries,
        savedObjectsClient,
        savedObjectType,
      });
      totalInvalidated += result.totalInvalidated;
      missingApiKeyRetries = result.missingApiKeyRetries;
    }

    hasMoreApiKeysPendingInvalidation = apiKeysToInvalidate.total > PAGE_SIZE;
  } while (hasMoreApiKeysPendingInvalidation);

  return { totalInvalidated, missingApiKeyRetries };
}
