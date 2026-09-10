/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  SavedObjectsFindResponse,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';
import { isUiamCredential } from '@kbn/core-security-server';
import type { AggregationsStringTermsBucketKeys } from '@elastic/elasticsearch/lib/api/types';
import type { ApiKeyToInvalidate } from '../../saved_objects/schemas/api_key_to_invalidate';
import type { SavedObjectTypesToQuery } from './run_invalidate';
import { queryForApiKeysInUse } from './query_for_api_keys_in_use';

/**
 * Matches a raw Elasticsearch API key id (short, URL-safe base64). ESO ciphertext is standard
 * base64 of iv+salt+tag+payload — well over 100 characters and typically containing `+`/`/`/`=` —
 * so a value matching this pattern was stored in plaintext, not encrypted with a lost key.
 */
const PLAINTEXT_ES_API_KEY_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Positively identifies attribute values persisted in plaintext by the pre-encryption-fix
 * provisioning bug (elastic/kibana#269487, elastic/kibana#272530). A decrypt failure alone is not
 * enough to conclude the value is plaintext — it could equally be valid ciphertext whose
 * encryption key was lost (e.g. misconfigured key rotation), which must stay loud and recoverable.
 */
function hasVerifiedPlaintextKeyMaterial({
  apiKeyId,
  uiamApiKey,
}: {
  apiKeyId?: string;
  uiamApiKey?: string;
}): boolean {
  if (uiamApiKey) {
    return isUiamCredential(uiamApiKey);
  }
  return !!apiKeyId && PLAINTEXT_ES_API_KEY_ID_REGEX.test(apiKeyId);
}

export interface ApiKeyIdAndSOId {
  id: string;
  apiKeyId: string;
}

export interface UiamApiKeyAndSOId {
  id: string;
  apiKeyId: string;
  uiamApiKey: string;
}

export interface UndecryptableApiKeyAndSOId {
  id: string;
  /** Raw stored value — plaintext when written by the pre-encryption-fix provisioning bug. */
  apiKeyId?: string;
  /** Raw stored value — plaintext when written by the pre-encryption-fix provisioning bug. */
  uiamApiKey?: string;
  error: Error;
}

interface GetApiKeyIdsToInvalidateOpts {
  apiKeySOsPendingInvalidation: SavedObjectsFindResponse<ApiKeyToInvalidate>;
  encryptedSavedObjectsClient?: EncryptedSavedObjectsClient;
  logger?: Logger;
  savedObjectsClient: SavedObjectsClientContract;
  savedObjectType: string;
  savedObjectTypesToQuery: SavedObjectTypesToQuery[];
}

interface GetApiKeysToInvalidateResult {
  apiKeyIdsToInvalidate: ApiKeyIdAndSOId[];
  uiamApiKeysToInvalidate?: UiamApiKeyAndSOId[];
  apiKeyIdsToExclude: ApiKeyIdAndSOId[];
  undecryptableApiKeysToInvalidate?: UndecryptableApiKeyAndSOId[];
}

export async function getApiKeyIdsToInvalidate({
  apiKeySOsPendingInvalidation,
  encryptedSavedObjectsClient,
  logger,
  savedObjectsClient,
  savedObjectType,
  savedObjectTypesToQuery,
}: GetApiKeyIdsToInvalidateOpts): Promise<GetApiKeysToInvalidateResult> {
  const apiKeyIds: ApiKeyIdAndSOId[] = [];
  const uiamApiKeys: UiamApiKeyAndSOId[] = [];
  const undecryptableApiKeys: UndecryptableApiKeyAndSOId[] = [];
  // Undecryptable SOs without verifiable plaintext material: not deletable, but they must be
  // excluded from subsequent fetch pages within this run to avoid re-processing them.
  const undrainableSOIds: string[] = [];

  if (encryptedSavedObjectsClient) {
    // Decrypt the apiKeyId for each pending invalidation SO. allSettled so a single decrypt
    // failure does not block draining of the healthy SOs in the batch.
    const decryptResults = await Promise.allSettled(
      // async wrapper so a synchronous throw from the client also settles as a rejection
      apiKeySOsPendingInvalidation.saved_objects.map(async (apiKeyPendingInvalidationSO) =>
        encryptedSavedObjectsClient.getDecryptedAsInternalUser<ApiKeyToInvalidate>(
          savedObjectType,
          apiKeyPendingInvalidationSO.id
        )
      )
    );

    decryptResults.forEach((decryptResult, index) => {
      const apiKeyPendingInvalidationSO = apiKeySOsPendingInvalidation.saved_objects[index];

      if (decryptResult.status === 'rejected') {
        // The SO is only routed to deletion when the raw stored values are positively identified
        // as plaintext from the pre-encryption-fix provisioning bug — in that case they are the
        // real key id/key and the key can still be invalidated before the SO is deleted. Any
        // other decrypt failure (e.g. valid ciphertext whose encryption key was lost through
        // misconfigured rotation) is left in place, since the data may be recoverable by fixing
        // the key configuration.
        const { uiamApiKey, apiKeyId } = apiKeyPendingInvalidationSO.attributes;
        if (hasVerifiedPlaintextKeyMaterial({ apiKeyId, uiamApiKey })) {
          undecryptableApiKeys.push({
            id: apiKeyPendingInvalidationSO.id,
            apiKeyId,
            uiamApiKey,
            error: decryptResult.reason,
          });
        } else {
          logger?.error(
            `Failed to decrypt "${savedObjectType}" saved object "${
              apiKeyPendingInvalidationSO.id
            }": ${decryptResult.reason?.message ?? decryptResult.reason}`
          );
          undrainableSOIds.push(apiKeyPendingInvalidationSO.id);
        }
        return;
      }

      const { uiamApiKey, apiKeyId } = decryptResult.value.attributes;
      if (uiamApiKey) {
        uiamApiKeys.push({
          id: decryptResult.value.id,
          apiKeyId,
          uiamApiKey,
        });
      } else {
        apiKeyIds.push({
          id: decryptResult.value.id,
          apiKeyId,
        });
      }
    });
  } else {
    // No decryption needed, return the apiKeyId as-is
    apiKeySOsPendingInvalidation.saved_objects.forEach((apiKeyPendingInvalidationSO) => {
      const { uiamApiKey, apiKeyId } = apiKeyPendingInvalidationSO.attributes;
      if (uiamApiKey) {
        uiamApiKeys.push({
          id: apiKeyPendingInvalidationSO.id,
          apiKeyId,
          uiamApiKey,
        });
      } else {
        apiKeyIds.push({
          id: apiKeyPendingInvalidationSO.id,
          apiKeyId,
        });
      }
    });
  }

  // Query saved objects index to see if any API keys are in use. Raw ids from undecryptable SOs
  // are included: when the stored value is plaintext (the provisioning bug) it is a real key id
  // that may still be referenced.
  const apiKeyIdStrings = apiKeyIds.map(({ apiKeyId }) => apiKeyId);
  const uiamApiKeyIdStrings = uiamApiKeys.map(({ apiKeyId }) => apiKeyId);
  const undecryptableApiKeyIdStrings = undecryptableApiKeys
    .map(({ apiKeyId }) => apiKeyId)
    .filter((apiKeyId): apiKeyId is string => Boolean(apiKeyId));
  const allApiKeyIdStrings = apiKeyIdStrings
    .concat(uiamApiKeyIdStrings)
    .concat(undecryptableApiKeyIdStrings);

  let apiKeyIdsInUseBuckets: AggregationsStringTermsBucketKeys[] = [];

  for (const type of savedObjectTypesToQuery) {
    apiKeyIdsInUseBuckets = apiKeyIdsInUseBuckets.concat(
      await queryForApiKeysInUse({
        apiKeyIds: allApiKeyIdStrings,
        savedObjectTypeToQuery: type,
        savedObjectsClient,
      })
    );
  }

  const apiKeyIdsToInvalidate: ApiKeyIdAndSOId[] = [];
  const uiamApiKeysToInvalidate: UiamApiKeyAndSOId[] = [];
  const apiKeyIdsToExclude: ApiKeyIdAndSOId[] = [];
  const undecryptableApiKeysToInvalidate: UndecryptableApiKeyAndSOId[] = [];

  apiKeyIds.forEach(({ id, apiKeyId }) => {
    if (apiKeyIdsInUseBuckets.find((bucket) => bucket.key === apiKeyId)) {
      apiKeyIdsToExclude.push({ id, apiKeyId });
    } else {
      apiKeyIdsToInvalidate.push({ id, apiKeyId });
    }
  });

  uiamApiKeys.forEach(({ id, apiKeyId, uiamApiKey }) => {
    if (apiKeyIdsInUseBuckets.find((bucket) => bucket.key === apiKeyId)) {
      apiKeyIdsToExclude.push({ id, apiKeyId });
    } else {
      uiamApiKeysToInvalidate.push({ id, apiKeyId, uiamApiKey });
    }
  });

  undecryptableApiKeys.forEach((undecryptableApiKey) => {
    // If the raw id matches a key still in use, keep the SO for a later run rather than
    // deleting it — deleting now would leak the key once the referencing object releases it.
    if (
      undecryptableApiKey.apiKeyId &&
      apiKeyIdsInUseBuckets.find((bucket) => bucket.key === undecryptableApiKey.apiKeyId)
    ) {
      apiKeyIdsToExclude.push({
        id: undecryptableApiKey.id,
        apiKeyId: undecryptableApiKey.apiKeyId,
      });
    } else {
      undecryptableApiKeysToInvalidate.push(undecryptableApiKey);
    }
  });

  undrainableSOIds.forEach((id) => {
    apiKeyIdsToExclude.push({ id, apiKeyId: '' });
  });

  return {
    apiKeyIdsToInvalidate,
    apiKeyIdsToExclude,
    ...(uiamApiKeysToInvalidate.length > 0 ? { uiamApiKeysToInvalidate } : {}),
    ...(undecryptableApiKeysToInvalidate.length > 0 ? { undecryptableApiKeysToInvalidate } : {}),
  };
}
