import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
export declare const bulkMarkApiKeysForInvalidation: ({ apiKeys }: {
    apiKeys: string[];
}, logger: Logger, savedObjectsClient: SavedObjectsClientContract) => Promise<void>;
