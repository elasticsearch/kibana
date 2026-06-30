import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { Observable } from 'rxjs';
import type { AlertInstanceContext, AlertInstanceState, IRuleTypeAlerts, RuleAlertData, DataStreamAdapter } from '../types';
import type { InitializationPromise } from './create_resource_installation_helper';
import type { LegacyAlertsClientParams, AlertRuleData } from '../alerts_client';
import type { IAlertsClient } from '../alerts_client/types';
import type { SetAlertsToUntrackedParams } from './lib/set_alerts_to_untracked';
import type { ClearAlertFlappingHistoryParams } from './lib/clear_alert_flapping_history';
import type { IsExistingAlertParams } from './lib/is_existing_alert';
/**
 * Default field limit for alerts-as-data (`.alerts-*`) indices, their index
 * templates and component templates.
 *
 * Usage:
 * - `AlertsService` uses it only as a fallback when `totalFieldsLimit` is not
 *   provided (e.g. in tests). In production the value comes from
 *   `xpack.alerting.alertsService.totalFieldsLimit` (see `config.ts`), so keep
 *   that config default in sync with this constant.
 * - Re-exported from `@kbn/alerting-plugin/server` and consumed directly by
 *   `rule_registry` (`resource_installer.ts`) when installing its own
 *   technical/component templates, and by the AAD integration tests.
 *
 * Note: other plugins (alerting_v2, security_solution siem_migrations /
 * workflow_insights, elastic_assistant, ecs_data_quality_dashboard) define
 * their own local field-limit constants and are NOT affected by this value.
 */
export declare const TOTAL_FIELDS_LIMIT = 2800;
export declare const ECS_CONTEXT = "ecs";
export declare const ECS_COMPONENT_TEMPLATE_NAME: string;
interface AlertsServiceParams {
    logger: Logger;
    pluginStop$: Observable<void>;
    kibanaVersion: string;
    elasticsearchClientPromise: Promise<ElasticsearchClient>;
    timeoutMs?: number;
    dataStreamAdapter: DataStreamAdapter;
    elasticsearchAndSOAvailability$: Observable<boolean>;
    isServerless: boolean;
    /**
     * Field limit applied to alerts-as-data indices/templates. Defaults to
     * `TOTAL_FIELDS_LIMIT` when not provided (e.g. in tests). In production this
     * is sourced from `xpack.alerting.alertsService.totalFieldsLimit`.
     */
    totalFieldsLimit?: number;
}
export interface CreateAlertsClientParams extends LegacyAlertsClientParams {
    namespace: string;
    rule: AlertRuleData;
}
export type MuteInstances = Array<{
    ruleId: string;
    alertInstanceIds?: string[];
}>;
interface IAlertsService {
    /**
     * Register solution specific resources. If common resource initialization is
     * complete, go ahead and install those resources, otherwise add to queue to
     * await initialization
     *
     * Solution specific resources include:
     * - Component template - solution specific mappings for fields used only by solution rule types
     * - Index templates - solution specific template that combines common and solution specific component templates
     * - Concrete write index - solution specific write index
     */
    register(opts: IRuleTypeAlerts, timeoutMs?: number): void;
    isInitialized(): boolean;
    /**
     * Returns promise that resolves when the resources for the given
     * context in the given namespace are installed. These include the context specific component template,
     * the index template for the default namespace and the concrete write index
     * for the default namespace.
     */
    getContextInitializationPromise(context: string, namespace: string): Promise<InitializationPromise>;
    /**
     * If the rule type has registered an alert context, initialize and return an AlertsClient,
     * otherwise return null. Currently registering an alert context is optional but in the future
     * we will make it a requirement for all rule types and this function should not return null.
     */
    createAlertsClient<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(opts: CreateAlertsClientParams): Promise<IAlertsClient<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId> | null>;
}
export type PublicAlertsService = Pick<IAlertsService, 'getContextInitializationPromise'>;
export type PublicFrameworkAlertsService = PublicAlertsService & {
    enabled: () => boolean;
    /**
     * Field limit applied to alerts-as-data (`.alerts-*`) resources, sourced from
     * `xpack.alerting.alertsService.totalFieldsLimit`. Consumed by `rule_registry`
     * so its technical/component templates and indices use the same configurable
     * limit as the alerting framework. Optional so existing mocks remain valid;
     * consumers fall back to `TOTAL_FIELDS_LIMIT` when it is not provided.
     */
    getTotalFieldsLimit?: () => number;
};
export declare class AlertsService implements IAlertsService {
    private readonly options;
    private initialized;
    private isServerless;
    private isInitializing;
    private resourceInitializationHelper;
    private registeredContexts;
    private commonInitPromise;
    private dataStreamAdapter;
    private totalFieldsLimit;
    constructor(options: AlertsServiceParams);
    isInitialized(): boolean;
    createAlertsClient<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(opts: CreateAlertsClientParams): Promise<IAlertsClient<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId> | null>;
    getContextInitializationPromise(context: string, namespace: string): Promise<InitializationPromise>;
    register(opts: IRuleTypeAlerts, timeoutMs?: number): void;
    /**
     * Initializes the common ES resources needed for framework alerts as data
     * - ILM policy - common policy shared by all AAD indices
     * - Component template - common mappings for fields populated and used by the framework
     */
    private initializeCommon;
    private initializeContext;
    setAlertsToUntracked(opts: SetAlertsToUntrackedParams): Promise<{
        "kibana.alert.rule.uuid": string;
        "kibana.alert.uuid": string;
    }[]>;
    clearAlertFlappingHistory(opts: ClearAlertFlappingHistoryParams): Promise<never[] | undefined>;
    isExistingAlert(params: IsExistingAlertParams): Promise<boolean>;
    private _updateMuteState;
    muteAlertInstance({ ruleId, alertInstanceId, indices, logger, }: {
        ruleId: string;
        alertInstanceId: string;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
    unmuteAlertInstance({ ruleId, alertInstanceId, indices, logger, }: {
        ruleId: string;
        alertInstanceId: string;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
    muteAllAlerts({ ruleId, indices, logger, }: {
        ruleId: string;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
    unmuteAllAlerts({ ruleId, indices, logger, }: {
        ruleId: string;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
    muteAlertInstances({ targets, indices, logger, }: {
        targets: MuteInstances;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
    unmuteAlertInstances({ targets, indices, logger, }: {
        targets: MuteInstances;
        indices: string[];
        logger: Logger;
    }): Promise<void>;
}
export {};
