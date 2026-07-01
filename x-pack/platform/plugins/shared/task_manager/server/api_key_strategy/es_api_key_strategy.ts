/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  SecurityServiceStart,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { ApiKeyType } from '../config';
import type { ConcreteTaskInstance, TaskInstance } from '../task';
import { getApiKeyAndUserScope } from '../lib/api_key_utils';
import type {
  ApiKeySOFields,
  ApiKeyStrategy,
  GrantApiKeysOpts,
  InvalidationTarget,
} from './api_key_strategy';
import { markApiKeysForInvalidation } from './api_key_strategy';

export class EsApiKeyStrategy implements ApiKeyStrategy {
  public readonly shouldGrantUiam = false;
  public readonly typeToUse = ApiKeyType.ES;

  async grantApiKeys(
    taskInstances: TaskInstance[],
    request: KibanaRequest,
    security: SecurityServiceStart,
    opts?: GrantApiKeysOpts
  ): Promise<Map<string, ApiKeySOFields>> {
    return getApiKeyAndUserScope(taskInstances, request, security, opts);
  }

  getApiKeyForFakeRequest(taskInstance: ConcreteTaskInstance): string | undefined {
    return taskInstance.apiKey;
  }

  getApiKeyIdsForInvalidation(taskInstance: ConcreteTaskInstance): InvalidationTarget[] {
    const { userScope, uiamApiKey } = taskInstance;
    if (!userScope || userScope.apiKeyCreatedByUser) {
      return [];
    }

    const targets: InvalidationTarget[] = [{ apiKeyId: userScope.apiKeyId }];

    // Defense-in-depth for rollbacks / config changes: a deployment may have
    // previously run with `EsAndUiamApiKeyStrategy` and persisted a UIAM key
    // alongside the ES key on existing tasks. If the deployment later falls
    // back to `EsApiKeyStrategy` (e.g., `api_key_type` flipped back to `es`,
    // or UIAM disabled), those UIAM keys would otherwise become orphaned and
    // never be invalidated. Still emit an invalidation target for them so the
    // invalidation task can clean them up. Invalidation is best-effort and
    // idempotent, so it is safe to always emit when both values are present.
    if (userScope.uiamApiKeyId && uiamApiKey) {
      targets.push({ apiKeyId: userScope.uiamApiKeyId, uiamApiKey });
    }

    return targets;
  }

  async markForInvalidation(
    targets: InvalidationTarget[],
    logger: Logger,
    savedObjectsClient: SavedObjectsClientContract
  ): Promise<void> {
    return markApiKeysForInvalidation(targets, logger, savedObjectsClient);
  }
}
