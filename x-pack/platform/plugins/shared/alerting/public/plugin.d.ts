import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/public';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { KqlPluginStart } from '@kbn/kql/public';
import type { ServerlessPluginStart } from '@kbn/serverless/public';
import type { MaintenanceWindowsServerStart } from '@kbn/maintenance-windows-plugin/server';
import type { AlertNavigationHandler } from './alert_navigation_registry';
import type { Rule } from '../common';
export interface PluginSetupContract {
    /**
     * Register a customized view of the particular rule type. Stack Management provides a generic overview, but a developer can register a
     * custom navigation to provide the user an extra link to a more curated view. The alerting plugin doesn't actually do
     * anything with this information, but it can be used by other plugins via the `getNavigation` functionality. Currently
     * the trigger_actions_ui plugin uses it to expose the link from the generic rule details view in Stack Management.
     *
     * @param applicationId The application id that the user should be navigated to, to view a particular rule in a custom way.
     * @param ruleType The rule type that has been registered with Alerting.Server.PluginSetupContract.registerType. If
     * no such rule with that id exists, a warning is output to the console log. It used to throw an error, but that was temporarily moved
     * because it was causing flaky test failures with https://github.com/elastic/kibana/issues/59229 and needs to be
     * investigated more.
     * @param handler The navigation handler should return either a relative URL, or a state object. This information can be used,
     * in conjunction with the consumer id, to navigate the user to a custom URL to view a rule's details.
     * @throws an error if the given applicationId and ruleType combination has already been registered.
     *
     * @deprecated use "getViewInAppRelativeUrl" on the server side rule type instead.
     */
    registerNavigation: (applicationId: string, ruleType: string, handler: AlertNavigationHandler) => void;
    /**
     * Register a customized view for all rule types with this application id. Stack Management provides a generic overview, but a developer can register a
     * custom navigation to provide the user an extra link to a more curated view. The alerting plugin doesn't actually do
     * anything with this information, but it can be used by other plugins via the `getNavigation` functionality. Currently
     * the trigger_actions_ui plugin uses it to expose the link from the generic rule details view in Stack Management.
     *
     * @param applicationId The application id that the user should be navigated to, to view a particular rule in a custom way.
     * @param handler The navigation handler should return either a relative URL, or a state object. This information can be used,
     * in conjunction with the consumer id, to navigate the user to a custom URL to view a rule's details.
     *
     * @deprecated use "getViewInAppRelativeUrl" on the server side rule type instead.
     */
    registerDefaultNavigation: (applicationId: string, handler: AlertNavigationHandler) => void;
}
export interface PluginStartContract {
    getNavigation: (ruleId: Rule['id']) => Promise<string | undefined>;
    getMaxAlertsPerRun: () => number;
}
export interface AlertingPluginSetup {
    management: ManagementSetup;
    maintenanceWindows?: MaintenanceWindowsServerStart;
}
export interface AlertingPluginStart {
    licensing: LicensingPluginStart;
    spaces: SpacesPluginStart;
    kql: KqlPluginStart;
    data: DataPublicPluginStart;
    serverless?: ServerlessPluginStart;
}
export interface AlertingUIConfig {
    rules: {
        run: {
            alerts: {
                max: number;
            };
        };
    };
}
export declare class AlertingPublicPlugin implements Plugin<PluginSetupContract, PluginStartContract, AlertingPluginSetup, AlertingPluginStart> {
    private readonly initContext;
    private alertNavigationRegistry?;
    private config;
    readonly maxAlertsPerRun: number;
    constructor(initContext: PluginInitializerContext);
    setup(core: CoreSetup, plugins: AlertingPluginSetup): {
        registerNavigation: (applicationId: string, ruleTypeId: string, handler: AlertNavigationHandler) => Promise<void>;
        registerDefaultNavigation: (applicationId: string, handler: AlertNavigationHandler) => Promise<void>;
    };
    start(core: CoreStart): {
        getNavigation: (ruleId: Rule["id"]) => Promise<string | undefined>;
        getMaxAlertsPerRun: () => number;
    };
}
