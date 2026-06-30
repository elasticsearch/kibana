import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { RulesSettingsFlappingClient } from './flapping/rules_settings_flapping_client';
import { RulesSettingsQueryDelayClient } from './query_delay/rules_settings_query_delay_client';
export interface RulesSettingsClientConstructorOptions {
    readonly logger: Logger;
    readonly savedObjectsClient: SavedObjectsClientContract;
    readonly getUserName: () => Promise<string | null>;
    readonly isServerless: boolean;
}
export declare class RulesSettingsClient {
    private readonly logger;
    private readonly savedObjectsClient;
    private readonly getUserName;
    private readonly _flapping;
    private readonly _queryDelay;
    private readonly isServerless;
    constructor(options: RulesSettingsClientConstructorOptions);
    private getModificationMetadata;
    flapping(): RulesSettingsFlappingClient;
    queryDelay(): RulesSettingsQueryDelayClient;
}
