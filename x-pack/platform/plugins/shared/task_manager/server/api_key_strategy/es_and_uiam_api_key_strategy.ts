/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AuthenticatedUser,
  Logger,
  SecurityServiceStart,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';
import { truncate } from 'lodash';
import { ApiKeyType } from '../config';
import type { ConcreteTaskInstance, TaskInstance } from '../task';
import { createApiKey, getApiKeyFromRequest, hasApiKey } from '../lib/api_key_utils';
import type {
  ApiKeySOFields,
  ApiKeyStrategy,
  GrantApiKeysOpts,
  InvalidationTarget,
} from './api_key_strategy';
import { markApiKeysForInvalidation } from './api_key_strategy';
import {
  UIAM_LOGS_CREDENTIALS_TAGS,
  UIAM_LOGS_GRANT_TAGS,
  UIAM_LOGS_USAGE_TAGS,
} from '../constants';

interface UiamApiKeyResult {
  apiKey: string;
  apiKeyId: string;
}

export class EsAndUiamApiKeyStrategy implements ApiKeyStrategy {
  public readonly shouldGrantUiam = true;
  public readonly typeToUse: ApiKeyType;
  private readonly security: SecurityServiceStart;
  private readonly logger: Logger;

  constructor(apiKeyType: ApiKeyType, security: SecurityServiceStart, logger: Logger) {
    this.typeToUse = apiKeyType;
    this.security = security;
    this.logger = logger;
  }

  async grantApiKeys(
    taskInstances: TaskInstance[],
    request: KibanaRequest,
    security: SecurityServiceStart,
    opts?: GrantApiKeysOpts
  ): Promise<Map<string, ApiKeySOFields>> {
    // Resolve identity once and thread it through every consumer below.
    // `apiKeyCreatedByUser` is derived from whether the incoming request is
    // authenticated with an API key (ES or UIAM). It is stored on `userScope`
    // and is used by `getApiKeyIdsForInvalidation` to short-circuit invalidation
    // of BOTH the ES and UIAM keys associated with this task.
    //
    // Invariant: when this flag is true, the same flag must govern invalidation
    // for every credential (ES and UIAM) that this strategy persists on the task.
    // This is safe today because we only attach a UIAM key when the request is
    // either UIAM-authenticated (reused as-is) or credential-less (granted anew),
    // and in both cases `apiKeyCreatedByUser` correctly reflects ownership for
    // both credentials. If future changes allow the ES and UIAM credentials to
    // have different ownership (e.g., mint a new UIAM key while reusing a
    // caller-supplied ES key), this invariant breaks and both fields must become
    // independent flags on `userScope` (e.g., `esApiKeyCreatedByUser` /
    // `uiamApiKeyCreatedByUser`) with matching per-credential checks in
    // `getApiKeyIdsForInvalidation`.
    const user = security.authc.getCurrentUser(request);
    const apiKeyCreatedByUser = hasApiKey(user, request);

    const esKeys = await createApiKey(taskInstances, request, security, {
      user,
      apiKeyCreatedByUser,
    });
    const uiamKeys =
      opts?.onEsKey === true
        ? new Map<string, UiamApiKeyResult>()
        : await this.grantUiamApiKeys(taskInstances, request, user, apiKeyCreatedByUser);

    const result = new Map<string, ApiKeySOFields>();
    taskInstances.forEach((task) => {
      const esKey = esKeys.get(task.id!);
      if (esKey) {
        const uiamKey = uiamKeys.get(task.id!);
        result.set(task.id!, {
          apiKey: esKey.apiKey,
          ...(uiamKey ? { uiamApiKey: uiamKey.apiKey } : {}),
          userScope: {
            apiKeyId: esKey.apiKeyId,
            ...(uiamKey ? { uiamApiKeyId: uiamKey.apiKeyId } : {}),
            spaceId: request.spaceId,
            apiKeyCreatedByUser,
            userProfileId: user?.profile_uid,
            userName: user?.username,
          },
        });
      }
    });

    return result;
  }

  private async grantUiamApiKeys(
    taskInstances: TaskInstance[],
    request: KibanaRequest,
    user: AuthenticatedUser | null,
    apiKeyCreatedByUser: boolean
  ): Promise<Map<string, UiamApiKeyResult>> {
    const uiam = this.security.authc.apiKeys.uiam;
    const uiamKeyByTaskIdMap = new Map<string, UiamApiKeyResult>();

    if (!uiam) {
      return uiamKeyByTaskIdMap;
    }

    if (apiKeyCreatedByUser) {
      const apiKeyResult = getApiKeyFromRequest(request);
      if (apiKeyResult && isUiamCredential(apiKeyResult.api_key)) {
        taskInstances.forEach((task) => {
          uiamKeyByTaskIdMap.set(task.id!, {
            apiKey: apiKeyResult.api_key,
            apiKeyId: apiKeyResult.id,
          });
        });
      }
      return uiamKeyByTaskIdMap;
    }

    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    if (!authorizationHeader || !isUiamCredential(authorizationHeader)) {
      this.logger.debug(
        'Request credential is not UIAM-compatible, skipping UIAM API key grant. Only ES API keys will be used.',
        { tags: UIAM_LOGS_CREDENTIALS_TAGS }
      );
      return uiamKeyByTaskIdMap;
    }

    const taskTypes = [...new Set(taskInstances.map((task) => task.taskType))];
    const uiamKeyByTaskTypeMap = new Map<string, UiamApiKeyResult>();

    for (const taskType of taskTypes) {
      const apiKeyNamePrefix = `TaskManager-UIAM: ${taskType}`;
      const apiKeyName = user ? `${apiKeyNamePrefix} - ${user.username}` : apiKeyNamePrefix;

      try {
        const uiamResult = await uiam.grant(request, {
          name: truncate(apiKeyName, { length: 256 }),
        });

        if (uiamResult) {
          uiamKeyByTaskTypeMap.set(taskType, {
            apiKey: uiamResult.api_key,
            apiKeyId: uiamResult.id,
          });
        } else {
          this.logger.error(`Failed to create UIAM API key for task type: ${taskType}`, {
            tags: UIAM_LOGS_GRANT_TAGS,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to create UIAM API key for task type: ${taskType}: ${errorMessage}`,
          { tags: UIAM_LOGS_GRANT_TAGS }
        );
      }
    }

    taskInstances.forEach((task) => {
      const uiamKeyResult = uiamKeyByTaskTypeMap.get(task.taskType);
      if (uiamKeyResult) {
        uiamKeyByTaskIdMap.set(task.id!, uiamKeyResult);
      }
    });

    return uiamKeyByTaskIdMap;
  }

  getApiKeyForFakeRequest(taskInstance: ConcreteTaskInstance): string | undefined {
    if (this.typeToUse === ApiKeyType.UIAM) {
      if (taskInstance.uiamApiKey) {
        return taskInstance.uiamApiKey;
      }

      // No UIAM key available even though the strategy is configured to use UIAM.
      // Fall back to the ES API key so the task can still run, but emit
      // observability so we can detect UIAM regressions in production:
      //   - If the task was scheduled with a user-supplied ES API key
      //     (`apiKeyCreatedByUser: true`), it is *expected* not to have a UIAM
      //     key attached. Emit a debug-level message.
      //   - Otherwise, the task should have had a UIAM key. Emit a warn-level
      //     message so the fallback is actioned.
      // Mirrors the alerting rule loader behavior (see PR #264434).
      const { userScope, apiKey } = taskInstance;
      if (apiKey) {
        if (userScope?.apiKeyCreatedByUser) {
          this.logger.debug(
            'UIAM API key is not provided to create a fake request, falling back to ES API key created by the user.',
            { tags: UIAM_LOGS_USAGE_TAGS }
          );
        } else {
          this.logger.warn(
            'UIAM API key is not provided to create a fake request, falling back to regular API key.',
            { tags: UIAM_LOGS_USAGE_TAGS }
          );
        }
      }
      return apiKey;
    }
    return taskInstance.apiKey;
  }

  getApiKeyIdsForInvalidation(taskInstance: ConcreteTaskInstance): InvalidationTarget[] {
    const { userScope, uiamApiKey } = taskInstance;
    // `apiKeyCreatedByUser` gates invalidation for BOTH the ES and UIAM keys.
    // See the invariant documented in `grantApiKeys`: both credentials are
    // currently persisted with the same ownership, so a single flag is
    // sufficient. Revisit if ES and UIAM credentials ever diverge in ownership.
    if (!userScope || userScope.apiKeyCreatedByUser) {
      return [];
    }

    const targets: InvalidationTarget[] = [{ apiKeyId: userScope.apiKeyId }];

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
