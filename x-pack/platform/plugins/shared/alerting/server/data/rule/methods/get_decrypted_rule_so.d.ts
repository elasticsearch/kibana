import type { SavedObject } from '@kbn/core/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SavedObjectsGetOptions } from '@kbn/core-saved-objects-api-server';
import type { RawRule } from '../../../types';
export interface GetDecryptedRuleSoParams {
    encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
    id: string;
    savedObjectsGetOptions?: SavedObjectsGetOptions;
}
export declare const getDecryptedRuleSo: (params: GetDecryptedRuleSoParams) => Promise<SavedObject<RawRule>>;
