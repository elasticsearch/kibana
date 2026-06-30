import type { CoreStart, SavedObjectsClientContract } from '@kbn/core/server';
import type { ConvertUiamAPIKeysResponse } from '@kbn/core-security-server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';
import type { AlertingPluginsStart } from '../plugin';
import type { UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE } from '../saved_objects';
import type { RawRule } from '../types';
export interface ProvisioningRunContext {
    coreStart: CoreStart;
    plugins: AlertingPluginsStart;
    uiamConvert: (keys: string[]) => Promise<ConvertUiamAPIKeysResponse | null>;
    encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
    unsafeSavedObjectsClient: SavedObjectsClientContract;
    savedObjectsClient: SavedObjectsClientContract;
}
export interface ProvisioningStatusDocs {
    type: typeof UIAM_API_KEYS_PROVISIONING_STATUS_SAVED_OBJECT_TYPE;
    id: string;
    attributes: {
        '@timestamp': string;
        entityId: string;
        entityType: string;
        status: string;
        message?: string;
        errorCode?: string;
    };
}
export interface ApiKeyToConvert {
    ruleId: string;
    /** Full decrypted rule attributes (includes apiKey); required for ESO-safe full rule update when persisting uiamApiKey */
    attributes: RawRule;
    /** Saved object version token; forwarded to bulkUpdate for optimistic concurrency control */
    version?: string;
    /**
     * Space the rule lives in. Threaded through to bulkUpdate so the SOR targets
     * the correct namespace for `multiple-isolated` rules.
     */
    namespace?: string;
}
export interface UiamApiKeyByRuleId {
    ruleId: string;
    uiamApiKey: string;
    /** Full decrypted rule attributes; required for ESO-safe full rule update */
    attributes: RawRule;
    /** Saved object version token; forwarded to bulkUpdate for optimistic concurrency control */
    version?: string;
    /**
     * Space the rule lives in. Threaded through to bulkUpdate so the SOR targets
     * the correct namespace for `multiple-isolated` rules.
     */
    namespace?: string;
}
export interface GetApiKeysToConvertResult {
    apiKeysToConvert: Array<ApiKeyToConvert>;
    provisioningStatusForSkippedRules: Array<ProvisioningStatusDocs>;
    /** True when response.total exceeds the first batch, so more rules may be provisioned on a later run */
    hasMoreToProvision: boolean;
}
export interface ConvertApiKeysResult {
    rulesWithUiamApiKeys: Map<string, UiamApiKeyByRuleId>;
    provisioningStatusForFailedConversions: Array<ProvisioningStatusDocs>;
}
