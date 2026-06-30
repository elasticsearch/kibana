import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { RulesSettingsClientApi, RulesSettingsFlappingProperties, RulesSettingsQueryDelayProperties } from '../types';
export declare const DEFAULT_CACHE_INTERVAL_MS = 60000;
export interface RulesSettingsServiceConstructorOptions {
    readonly isServerless: boolean;
    cacheInterval?: number;
    logger: Logger;
    getRulesSettingsClientWithRequest(request: KibanaRequest): RulesSettingsClientApi;
}
interface Settings {
    queryDelaySettings: RulesSettingsQueryDelayProperties;
    flappingSettings: RulesSettingsFlappingProperties;
}
export declare class RulesSettingsService {
    private readonly options;
    private cacheIntervalMs;
    private defaultQueryDelaySettings;
    private settings;
    constructor(options: RulesSettingsServiceConstructorOptions);
    getSettings(request: KibanaRequest, spaceId: string): Promise<Settings>;
    private fetchSettings;
}
export {};
