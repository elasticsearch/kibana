import type { KibanaRequest, Logger, SavedObjectsServiceStart, SecurityServiceStart, UiSettingsServiceStart } from '@kbn/core/server';
import { MaintenanceWindowClient } from './client';
export interface MaintenanceWindowClientFactoryOpts {
    logger: Logger;
    savedObjectsService: SavedObjectsServiceStart;
    securityService: SecurityServiceStart;
    uiSettings: UiSettingsServiceStart;
}
export declare class MaintenanceWindowClientFactory {
    private isInitialized;
    private logger;
    private savedObjectsService;
    private securityService;
    private uiSettings;
    initialize(options: MaintenanceWindowClientFactoryOpts): void;
    private getSoClient;
    private createMaintenanceWindowClient;
    createWithAuthorization(request: KibanaRequest): MaintenanceWindowClient;
    createWithoutAuthorization(request: KibanaRequest): MaintenanceWindowClient;
    createInternal(request: KibanaRequest): MaintenanceWindowClient;
}
