import type { ProvisioningStatusDocs, UiamApiKeyByRuleId } from '../types';
/**
 * Builds a provisioning status doc for a rule that was skipped (no API key, already has UIAM key, or user-created key).
 */
export declare const createSkippedRuleStatus: (ruleId: string, message: string) => ProvisioningStatusDocs;
/**
 * Builds a provisioning status doc for a rule whose UIAM API key conversion failed.
 */
export declare const createFailedConversionStatus: (ruleId: string, message: string, errorCode?: string) => ProvisioningStatusDocs;
/**
 * Result item from a bulkUpdate call (has id and optional error).
 */
export interface BulkUpdateResultItem {
    id: string;
    error?: {
        message?: string;
    };
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
export declare const prepareProvisioningStatusWrite: (payload: ProvisioningStatusWritePayload) => {
    docs: Array<ProvisioningStatusDocs>;
    counts: ProvisioningStatusCounts;
};
/**
 * Builds a provisioning status doc from a single saved object result of a bulk rule update.
 */
export declare const createStatusFromBulkUpdateResult: (so: BulkUpdateResultItem) => ProvisioningStatusDocs;
export interface StatusDocsAndOrphanedKeysResult {
    provisioningStatusForCompletedRules: Array<ProvisioningStatusDocs>;
    provisioningStatusForFailedRules: Array<ProvisioningStatusDocs>;
    orphanedUiamApiKeys: string[];
}
/**
 * Builds status docs from bulk update results (split into completed/failed) and collects UIAM API keys for rules that failed to update (orphaned).
 */
export declare const statusDocsAndOrphanedKeysFromBulkUpdate: (savedObjects: Array<BulkUpdateResultItem>, rulesWithUiamApiKeys: Map<string, UiamApiKeyByRuleId>) => StatusDocsAndOrphanedKeysResult;
