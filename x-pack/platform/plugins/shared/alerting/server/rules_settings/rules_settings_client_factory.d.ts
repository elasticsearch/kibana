import type { KibanaRequest, Logger, SavedObjectsServiceStart, SecurityServiceStart } from '@kbn/core/server';
import { RulesSettingsClient } from './rules_settings_client';
export interface RulesSettingsClientFactoryOpts {
    logger: Logger;
    savedObjectsService: SavedObjectsServiceStart;
    isServerless: boolean;
    securityService: SecurityServiceStart;
}
export declare class RulesSettingsClientFactory {
    private isInitialized;
    private logger;
    private savedObjectsService;
    private securityService;
    private isServerless;
    initialize(options: RulesSettingsClientFactoryOpts): void;
    private createRulesSettingsClient;
    createWithAuthorization(request: KibanaRequest): RulesSettingsClient;
    create(request: KibanaRequest): RulesSettingsClient;
}
