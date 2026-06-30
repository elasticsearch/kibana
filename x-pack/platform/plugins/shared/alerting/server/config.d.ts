import type { TypeOf, Type } from '@kbn/config-schema';
export declare const DEFAULT_MAX_ALERTS = 1000;
declare const rulesSchema: import("@kbn/config-schema").ObjectType<{
    minimumScheduleInterval: import("@kbn/config-schema").ObjectType<{
        value: Type<string>;
        enforce: Type<boolean>;
    }>;
    maxScheduledPerMinute: Type<number>;
    overwriteProducer: Type<"observability" | "siem" | "stackAlerts" | undefined>;
    run: import("@kbn/config-schema").ObjectType<{
        timeout: Type<string | undefined>;
        actions: import("@kbn/config-schema").ObjectType<{
            max: Type<number>;
            connectorTypeOverrides: Type<Readonly<{
                max?: number | undefined;
            } & {
                id: string;
            }>[] | undefined>;
        }>;
        alerts: import("@kbn/config-schema").ObjectType<{
            max: Type<number>;
        }>;
        ruleTypeOverrides: Type<Readonly<{
            timeout?: string | undefined;
        } & {
            id: string;
        }>[] | undefined>;
    }>;
    apiKeyType: Type<"es" | "uiam">;
}>;
export declare const configSchema: import("@kbn/config-schema").ObjectType<{
    healthCheck: import("@kbn/config-schema").ObjectType<{
        interval: Type<string>;
    }>;
    invalidateApiKeysTask: import("@kbn/config-schema").ObjectType<{
        interval: Type<string>;
        removalDelay: Type<string>;
    }>;
    maxEphemeralActionsPerAlert: Type<number | undefined>;
    enableFrameworkAlerts: Type<boolean>;
    alertsService: import("@kbn/config-schema").ObjectType<{
        totalFieldsLimit: Type<number>;
    }>;
    ruleChangeTracking: import("@kbn/config-schema").ObjectType<{
        enabled: Type<boolean>;
        scope: Type<string[]>;
    }>;
    cancelAlertsOnRuleTimeout: Type<boolean>;
    rules: import("@kbn/config-schema").ObjectType<{
        minimumScheduleInterval: import("@kbn/config-schema").ObjectType<{
            value: Type<string>;
            enforce: Type<boolean>;
        }>;
        maxScheduledPerMinute: Type<number>;
        overwriteProducer: Type<"observability" | "siem" | "stackAlerts" | undefined>;
        run: import("@kbn/config-schema").ObjectType<{
            timeout: Type<string | undefined>;
            actions: import("@kbn/config-schema").ObjectType<{
                max: Type<number>;
                connectorTypeOverrides: Type<Readonly<{
                    max?: number | undefined;
                } & {
                    id: string;
                }>[] | undefined>;
            }>;
            alerts: import("@kbn/config-schema").ObjectType<{
                max: Type<number>;
            }>;
            ruleTypeOverrides: Type<Readonly<{
                timeout?: string | undefined;
            } & {
                id: string;
            }>[] | undefined>;
        }>;
        apiKeyType: Type<"es" | "uiam">;
    }>;
    rulesSettings: import("@kbn/config-schema").ObjectType<{
        enabled: Type<boolean>;
        cacheInterval: Type<number>;
    }>;
    gapAutoFillScheduler: Type<Readonly<{
        timeout?: string | undefined;
    } & {
        enabled: boolean;
    }> | undefined>;
    disabledRuleTypes: Type<string[] | undefined>;
    enabledRuleTypes: Type<string[] | undefined>;
}>;
export type AlertingConfig = TypeOf<typeof configSchema>;
export type RulesConfig = TypeOf<typeof rulesSchema>;
export type AlertingRulesConfig = Pick<AlertingConfig['rules'], 'minimumScheduleInterval' | 'maxScheduledPerMinute' | 'run' | 'apiKeyType'> & {
    isUsingSecurity: boolean;
};
export type ActionsConfig = RulesConfig['run']['actions'];
export type ActionTypeConfig = Omit<ActionsConfig, 'connectorTypeOverrides'>;
export {};
