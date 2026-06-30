import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { RulesSettingsModificationMetadata, RulesSettingsQueryDelayProperties, RulesSettingsQueryDelay } from '../../../common';
export interface RulesSettingsQueryDelayClientConstructorOptions {
    readonly logger: Logger;
    readonly savedObjectsClient: SavedObjectsClientContract;
    readonly isServerless: boolean;
    readonly getModificationMetadata: () => Promise<RulesSettingsModificationMetadata>;
}
export declare class RulesSettingsQueryDelayClient {
    private readonly logger;
    private readonly savedObjectsClient;
    private readonly isServerless;
    private readonly getModificationMetadata;
    constructor(options: RulesSettingsQueryDelayClientConstructorOptions);
    get(): Promise<RulesSettingsQueryDelay>;
    update(newQueryDelayProperties: RulesSettingsQueryDelayProperties): Promise<{
        updatedAt: string;
        updatedBy: string | null;
        delay: number;
        createdBy: string | null;
        createdAt: string;
    }>;
    private updateWithOCC;
    private getSettings;
    private createSettings;
    /**
     * Helper function to ensure that a rules-settings saved object always exists.
     * Ensures the creation of the saved object is done lazily during retrieval.
     */
    private getOrCreate;
}
