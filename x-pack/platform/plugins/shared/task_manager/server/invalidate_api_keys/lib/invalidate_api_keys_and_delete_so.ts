/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { isMissingApiKey, isRevokedApiKey, isUiamCredential } from '@kbn/core-security-server';
import type {
  ApiKeyIdAndSOId,
  UiamApiKeyAndSOId,
  UndecryptableApiKeyAndSOId,
} from './get_api_key_ids_to_invalidate';
import { invalidateAPIKeys, invalidateUiamAPIKeys } from './invalidate_api_keys';
import type { ApiKeyInvalidationFn, UiamApiKeyInvalidationFn } from '../invalidate_api_keys_task';
import { UIAM_LOGS_INVALIDATE_TAGS } from '../../constants';

const MAX_MISSING_KEY_RETRIES = 5;

interface InvalidateApiKeysAndDeleteSO {
  apiKeyIdsToInvalidate: ApiKeyIdAndSOId[];
  uiamApiKeysToInvalidate?: UiamApiKeyAndSOId[];
  undecryptableApiKeysToInvalidate?: UndecryptableApiKeyAndSOId[];
  invalidateApiKeyFn?: ApiKeyInvalidationFn;
  invalidateUiamApiKeyFn?: UiamApiKeyInvalidationFn;
  logger: Logger;
  missingApiKeyRetries: Record<string, number>;
  savedObjectsClient: SavedObjectsClientContract;
  savedObjectType: string;
}

export interface InvalidateApiKeysResult {
  totalInvalidated: number;
  missingApiKeyRetries: Record<string, number>;
}

export async function invalidateApiKeysAndDeletePendingApiKeySavedObject({
  apiKeyIdsToInvalidate,
  uiamApiKeysToInvalidate,
  undecryptableApiKeysToInvalidate,
  invalidateApiKeyFn,
  invalidateUiamApiKeyFn,
  logger,
  missingApiKeyRetries: inputRetries,
  savedObjectsClient,
  savedObjectType,
}: InvalidateApiKeysAndDeleteSO): Promise<InvalidateApiKeysResult> {
  let totalInvalidated = 0;
  const missingApiKeyRetries = { ...inputRetries };

  // ES APIKey invalidation
  if (apiKeyIdsToInvalidate.length > 0) {
    const ids = apiKeyIdsToInvalidate.map(({ apiKeyId }) => apiKeyId);
    const response = await invalidateAPIKeys({ ids }, invalidateApiKeyFn);
    if (response.apiKeysEnabled === true && response.result.error_count > 0) {
      logger.error(`Failed to invalidate API Keys [count="${ids.length}"]`);
    } else {
      await Promise.all(
        apiKeyIdsToInvalidate.map(async ({ id }) => {
          try {
            await savedObjectsClient.delete(savedObjectType, id);
            totalInvalidated++;
          } catch (err) {
            logger.error(`Failed to delete invalidated API key. Error: ${err.message}`);
          }
        })
      );
    }
  }

  // UIAM APIKey invalidation
  if (uiamApiKeysToInvalidate && uiamApiKeysToInvalidate.length > 0) {
    for (const { uiamApiKey, apiKeyId, id } of uiamApiKeysToInvalidate) {
      const response = await invalidateUiamAPIKeys(
        { uiamApiKey, apiKeyId },
        invalidateUiamApiKeyFn
      );

      if (response.apiKeysEnabled === true && response.result.error_count > 0) {
        if (isRevokedApiKey(response.result)) {
          logger.warn(
            `UIAM APIKey is already revoked, removing pending invalidation. ` +
              `Error: ${response.result.error_details?.map((d) => d.reason).join('; ')}`,
            { tags: UIAM_LOGS_INVALIDATE_TAGS }
          );
        } else if (isMissingApiKey(response.result)) {
          const retryCount = (missingApiKeyRetries[id] ?? 0) + 1;
          missingApiKeyRetries[id] = retryCount;
          if (retryCount < MAX_MISSING_KEY_RETRIES) {
            logger.warn(
              `UIAM APIKey not found, will retry (${retryCount}/${MAX_MISSING_KEY_RETRIES}). ` +
                `Error: ${response.result.error_details?.map((d) => d.reason).join('; ')}`,
              { tags: UIAM_LOGS_INVALIDATE_TAGS }
            );
            continue;
          }
          logger.warn(
            `UIAM APIKey not found after ${MAX_MISSING_KEY_RETRIES} attempts, removing pending invalidation. ` +
              `Error: ${response.result.error_details?.map((d) => d.reason).join('; ')}`,
            { tags: UIAM_LOGS_INVALIDATE_TAGS }
          );
        } else {
          logger.error(
            `Failed to invalidate UIAM APIKey: ${response.result.error_details
              ?.map((d) => d.reason)
              .join('; ')}`,
            { tags: UIAM_LOGS_INVALIDATE_TAGS }
          );
          continue;
        }
      }

      try {
        await savedObjectsClient.delete(savedObjectType, id);
        delete missingApiKeyRetries[id];
        totalInvalidated++;
      } catch (err) {
        logger.error(`Failed to delete invalidated UIAM API key. Error: ${err.message}`, {
          tags: UIAM_LOGS_INVALIDATE_TAGS,
        });
      }
    }
  }

  // Undecryptable pending-invalidation SOs (e.g. attributes persisted in plaintext by a
  // pre-encryption-fix provisioning run). Decryption failures are deterministic, so these SOs can
  // never be drained through the normal path — each one produces decrypt errors on every run,
  // forever. Attempt a best-effort invalidation with the raw stored values (the real key id/key
  // when the root cause is the plaintext bug), then delete the SO regardless of the outcome.
  if (undecryptableApiKeysToInvalidate && undecryptableApiKeysToInvalidate.length > 0) {
    for (const { id, apiKeyId, uiamApiKey, error } of undecryptableApiKeysToInvalidate) {
      let invalidationOutcome = 'skipped (no usable raw key material)';
      try {
        if (uiamApiKey && apiKeyId && isUiamCredential(uiamApiKey)) {
          const response = await invalidateUiamAPIKeys(
            { uiamApiKey, apiKeyId },
            invalidateUiamApiKeyFn
          );
          invalidationOutcome =
            response.apiKeysEnabled === true && response.result.error_count > 0
              ? `UIAM invalidation failed: ${response.result.error_details
                  ?.map((d) => d.reason)
                  .join('; ')}`
              : 'UIAM key invalidated with raw stored value';
        } else if (apiKeyId) {
          const response = await invalidateAPIKeys({ ids: [apiKeyId] }, invalidateApiKeyFn);
          invalidationOutcome =
            response.apiKeysEnabled === true && response.result.error_count > 0
              ? 'ES key invalidation failed'
              : 'ES key invalidated with raw stored value';
        }
      } catch (invalidationError) {
        invalidationOutcome = `invalidation attempt errored: ${invalidationError.message}`;
      }

      try {
        await savedObjectsClient.delete(savedObjectType, id);
        totalInvalidated++;
        logger.warn(
          `Deleted undecryptable "${savedObjectType}" saved object "${id}" (decryption error: ${error.message}). Best-effort key invalidation outcome: ${invalidationOutcome}.`,
          { tags: UIAM_LOGS_INVALIDATE_TAGS }
        );
      } catch (deleteError) {
        logger.error(
          `Failed to delete undecryptable "${savedObjectType}" saved object "${id}". Error: ${deleteError.message}`,
          { tags: UIAM_LOGS_INVALIDATE_TAGS }
        );
      }
    }
  }

  logger.debug(`Total invalidated API keys "${totalInvalidated}"`);
  return { totalInvalidated, missingApiKeyRetries };
}
