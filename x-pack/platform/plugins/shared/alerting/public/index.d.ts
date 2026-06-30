import type { PluginInitializerContext } from '@kbn/core/public';
import { AlertingPublicPlugin } from './plugin';
export type { PluginSetupContract, PluginStartContract } from './plugin';
export type { AlertNavigationHandler } from './alert_navigation_registry';
export declare function plugin(initializerContext: PluginInitializerContext): AlertingPublicPlugin;
