import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { MaintenanceWindowsServerSetupDependencies, MaintenanceWindowsServerStartDependencies, MaintenanceWindowsServerStart } from './types';
export declare class MaintenanceWindowsPlugin implements Plugin<void, MaintenanceWindowsServerStart, MaintenanceWindowsServerSetupDependencies, MaintenanceWindowsServerStartDependencies> {
    private readonly logger;
    private licenseState;
    private readonly maintenanceWindowClientFactory;
    constructor(initializerContext: PluginInitializerContext);
    setup(core: CoreSetup<MaintenanceWindowsServerStartDependencies, unknown>, plugins: MaintenanceWindowsServerSetupDependencies): {};
    start(core: CoreStart, plugins: MaintenanceWindowsServerStartDependencies): MaintenanceWindowsServerStart;
    private createRouteHandlerContext;
    stop(): void;
}
