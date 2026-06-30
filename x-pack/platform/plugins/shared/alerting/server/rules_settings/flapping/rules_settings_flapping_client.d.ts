import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { RulesSettingsFlapping, RulesSettingsFlappingProperties, RulesSettingsModificationMetadata } from '../../../common';
export interface RulesSettingsFlappingClientConstructorOptions {
    readonly logger: Logger;
    readonly savedObjectsClient: SavedObjectsClientContract;
    readonly getModificationMetadata: () => Promise<RulesSettingsModificationMetadata>;
}
export declare class RulesSettingsFlappingClient {
    private readonly logger;
    private readonly savedObjectsClient;
    private readonly getModificationMetadata;
    constructor(options: RulesSettingsFlappingClientConstructorOptions);
    get(): Promise<RulesSettingsFlapping>;
    update(newFlappingProperties: RulesSettingsFlappingProperties): Promise<{
        updatedAt: string;
        updatedBy: string | null;
        enabled: boolean;
        lookBackWindow: number;
        statusChangeThreshold: number;
        createdBy: string | null;
        createdAt: string;
    } | undefined>;
    private updateWithOCC;
    private getSettings;
    private createSettings;
    /**
     * Helper function to ensure that a rules-settings saved object always exists.
     * Ensures the creation of the saved object is done lazily during retrieval.
     */
    private getOrCreate;
}
