/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { SavedObjectErrorResult } from '@kbn/core/server';
import { UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE } from '../../saved_objects';
import {
  UiamApiKeyProvisioningStatus,
  UiamApiKeyProvisioningEntityType,
} from '../../saved_objects/schemas/raw_uiam_api_keys_provisioning_status';
import type { ProvisioningStatusDocs, UiamApiKeyByRuleId } from '../types';
import { getErrorMessage } from './error_utils';

/**
 * Builds a provisioning status doc for a rule that was skipped (no API key, already has UIAM key, or user-created key).
 */
export const createSkippedRuleStatus = (
  ruleId: string,
  message: string
): ProvisioningStatusDocs => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: ruleId,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: ruleId,
    entityType: UiamApiKeyProvisioningEntityType.RULE,
    status: UiamApiKeyProvisioningStatus.SKIPPED,
    message,
  },
});

/**
 * Builds a provisioning status doc for a rule whose UIAM API key conversion failed.
 */
export const createFailedConversionStatus = (
  ruleId: string,
  message: string,
  errorCode?: string
): ProvisioningStatusDocs => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: ruleId,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: ruleId,
    entityType: UiamApiKeyProvisioningEntityType.RULE,
    status: UiamApiKeyProvisioningStatus.FAILED,
    message,
    ...(errorCode ? { errorCode } : {}),
  },
});

/**
 * Result item from a bulkUpdate call (has id and optional error).
 */
export interface BulkUpdateResultItem {
  id: string;
  error?: SavedObjectErrorResult['error'];
}

export interface ProvisioningStatusWritePayload {
  skipped: Array<ProvisioningStatusDocs>;
  failedConversions: Array<ProvisioningStatusDocs>;
  completed: Array<ProvisioningStatusDocs>;
  failed: Array<ProvisioningStatusDocs>;
}

export interface ProvisioningStatusCounts {
  skipped: number;
  failedConversions: number;
  completed: number;
  failed: number;
  total: number;
}

/**
 * Builds the flat docs array and counts (including total) for a provisioning status write.
 * Use before bulkCreate and for logging.
 */
export const prepareProvisioningStatusWrite = (
  payload: ProvisioningStatusWritePayload
): { docs: Array<ProvisioningStatusDocs>; counts: ProvisioningStatusCounts } => {
  const { skipped, failedConversions, completed, failed } = payload;
  const docs = [...skipped, ...failedConversions, ...completed, ...failed];
  const counts: ProvisioningStatusCounts = {
    skipped: skipped.length,
    failedConversions: failedConversions.length,
    completed: completed.length,
    failed: failed.length,
    total: docs.length,
  };
  return { docs, counts };
};

/**
 * Builds a provisioning status doc from a single saved object result of a bulk rule update.
 */
export const createStatusFromBulkUpdateResult = (
  so: BulkUpdateResultItem
): ProvisioningStatusDocs => ({
  type: UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE,
  id: so.id,
  attributes: {
    '@timestamp': new Date().toISOString(),
    entityId: so.id,
    entityType: UiamApiKeyProvisioningEntityType.RULE,
    status: so.error ? UiamApiKeyProvisioningStatus.FAILED : UiamApiKeyProvisioningStatus.COMPLETED,
    ...(so.error
      ? {
          message: `Error bulk updating the rule with ID ${so.id}: ${
            so.error.message ?? getErrorMessage(so.error)
          }`,
        }
      : {}),
  },
});

export interface StatusDocsAndOrphanedKeysResult {
  provisioningStatusForCompletedRules: Array<ProvisioningStatusDocs>;
  provisioningStatusForFailedRules: Array<ProvisioningStatusDocs>;
  orphanedUiamApiKeys: string[];
}

/**
 * Builds status docs from bulk update results (split into completed/failed) and collects UIAM API keys for rules that failed to update (orphaned).
 */
export const statusDocsAndOrphanedKeysFromBulkUpdate = (
  savedObjects: Array<BulkUpdateResultItem>,
  rulesWithUiamApiKeys: Map<string, UiamApiKeyByRuleId>
): StatusDocsAndOrphanedKeysResult => {
  const provisioningStatusForCompletedRules: Array<ProvisioningStatusDocs> = [];
  const provisioningStatusForFailedRules: Array<ProvisioningStatusDocs> = [];
  const orphanedUiamApiKeys: string[] = [];
  for (const so of savedObjects) {
    const statusDoc = createStatusFromBulkUpdateResult(so);
    if (isSavedObjectErrorResult(so)) {
      provisioningStatusForFailedRules.push(statusDoc);
      const uiamApiKey = rulesWithUiamApiKeys.get(so.id)?.uiamApiKey;
      if (uiamApiKey) {
        orphanedUiamApiKeys.push(uiamApiKey);
      }
    } else {
      provisioningStatusForCompletedRules.push(statusDoc);
    }
  }
  return {
    provisioningStatusForCompletedRules,
    provisioningStatusForFailedRules,
    orphanedUiamApiKeys,
  };
};
