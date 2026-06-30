import type { Logger } from '@kbn/core/server';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/server';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import type { TaskRunnerFactory } from './task_runner';
import type { RuleType, RuleTypeParams, RuleTypeState, AlertInstanceState, AlertInstanceContext } from './types';
import type { ActionGroup, RuleAlertData } from '../common';
import type { ILicenseState } from './lib/license_state';
import type { InMemoryMetrics } from './monitoring';
import type { AlertingRulesConfig } from '.';
import type { AlertsService } from './alerts_service/alerts_service';
import type { AlertingConfig } from './config';
export interface ConstructorOptions {
    config: AlertingConfig;
    logger: Logger;
    taskManager: TaskManagerSetupContract;
    taskRunnerFactory: TaskRunnerFactory;
    licenseState: ILicenseState;
    licensing: LicensingPluginSetup;
    minimumScheduleInterval: AlertingRulesConfig['minimumScheduleInterval'];
    inMemoryMetrics: InMemoryMetrics;
    alertsService: AlertsService | null;
}
export interface RegistryRuleType extends Pick<UntypedNormalizedRuleType, 'name' | 'actionGroups' | 'recoveryActionGroup' | 'defaultActionGroupId' | 'actionVariables' | 'category' | 'producer' | 'solution' | 'minimumLicenseRequired' | 'isExportable' | 'ruleTaskTimeout' | 'defaultScheduleInterval' | 'doesSetRecoveryContext' | 'alerts' | 'priority' | 'internallyManaged' | 'autoRecoverAlerts'> {
    id: string;
    enabledInLicense: boolean;
    hasAlertsMappings: boolean;
    validLegacyConsumers: string[];
}
export type NormalizedRuleType<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, State extends RuleTypeState, InstanceState extends AlertInstanceState, InstanceContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> = {
    validLegacyConsumers: string[];
    actionGroups: Array<ActionGroup<ActionGroupIds | RecoveryActionGroupId>>;
} & Omit<RuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>, 'recoveryActionGroup' | 'actionGroups'> & Pick<Required<RuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>>, 'recoveryActionGroup'>;
export type UntypedNormalizedRuleType = NormalizedRuleType<RuleTypeParams, RuleTypeParams, RuleTypeState, AlertInstanceState, AlertInstanceContext, string, string, RuleAlertData>;
export declare class RuleTypeRegistry {
    private readonly config;
    private readonly logger;
    private readonly taskManager;
    private readonly ruleTypes;
    private readonly taskRunnerFactory;
    private readonly licenseState;
    private readonly minimumScheduleInterval;
    private readonly licensing;
    private readonly inMemoryMetrics;
    private readonly alertsService;
    constructor({ config, logger, taskManager, taskRunnerFactory, licenseState, licensing, minimumScheduleInterval, inMemoryMetrics, alertsService, }: ConstructorOptions);
    has(id: string): boolean;
    ensureRuleTypeEnabled(id: string): void;
    register<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams, State extends RuleTypeState, InstanceState extends AlertInstanceState, InstanceContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData>(ruleType: RuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>): void;
    get<Params extends RuleTypeParams = RuleTypeParams, ExtractedParams extends RuleTypeParams = RuleTypeParams, State extends RuleTypeState = RuleTypeState, InstanceState extends AlertInstanceState = AlertInstanceState, InstanceContext extends AlertInstanceContext = AlertInstanceContext, ActionGroupIds extends string = string, RecoveryActionGroupId extends string = string, AlertData extends RuleAlertData = RuleAlertData>(id: string): NormalizedRuleType<Params, ExtractedParams, State, InstanceState, InstanceContext, ActionGroupIds, RecoveryActionGroupId, AlertData>;
    list(): Map<string, RegistryRuleType>;
    getAllTypes(): string[];
    getFilteredTypes({ excludeInternallyManaged, categories, }: {
        excludeInternallyManaged?: boolean;
        categories: string[];
    }): string[];
}
