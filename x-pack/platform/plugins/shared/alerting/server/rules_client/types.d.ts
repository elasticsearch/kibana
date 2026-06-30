import type { KueryNode } from '@kbn/es-query';
import type { Logger, SavedObjectsClientContract, PluginInitializerContext, ISavedObjectsRepository, UiSettingsServiceStart } from '@kbn/core/server';
import type { FeatureFlagsStart } from '@kbn/core-feature-flags-server';
import type { ActionsClient, ActionsAuthorization } from '@kbn/actions-plugin/server';
import type { GrantAPIKeyResult as SecurityPluginGrantAPIKeyResult, InvalidateAPIKeyResult as SecurityPluginInvalidateAPIKeyResult } from '@kbn/security-plugin/server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { IEventLogClient, IEventLogger } from '@kbn/event-log-plugin/server';
import type { AuditLogger } from '@kbn/security-plugin/server';
import type { DistributiveOmit } from '@elastic/eui';
import type { RuleTypeRegistry, IntervalSchedule, RuleSnoozeSchedule, RawRuleAlertsFilter, RuleSystemAction, RuleAction } from '../types';
import type { AlertingAuthorization } from '../authorization';
import type { AlertingRulesConfig } from '../config';
import type { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import type { GetAlertIndicesAlias } from '../lib';
import type { AlertsService } from '../alerts_service';
import type { BackfillClient } from '../backfill_client/backfill_client';
import type { IScopedChangeTrackingService } from './lib/change_tracking';
export type { BulkEditOperation, BulkEditFields, } from '../application/rule/methods/bulk_edit/types';
export type { BulkEditParamsOperation } from '../application/rule/methods/bulk_edit_params/types';
export type { FindResult } from '../application/rule/methods/find/find_rules';
export type { GetAlertSummaryParams } from './methods/get_alert_summary';
export type { GetExecutionLogByIdParams, GetGlobalExecutionLogParams, } from './methods/get_execution_log';
export type { GetGlobalExecutionKPIParams, GetRuleExecutionKPIParams, } from './methods/get_execution_kpi';
export type { GetGlobalExecutionSummaryParams } from './methods/get_execution_summary';
export type { GetActionErrorLogByIdParams } from './methods/get_action_error_log';
export type { GetRuleHistoryParams, GetRuleHistoryResult, RuleChangeHistoryDocument, } from './methods/get_rule_history';
export interface RulesClientContext {
    readonly logger: Logger;
    readonly getUserName: () => Promise<string | null>;
    readonly spaceId: string;
    readonly namespace?: string;
    readonly taskManager: TaskManagerStartContract;
    readonly unsecuredSavedObjectsClient: SavedObjectsClientContract;
    readonly authorization: AlertingAuthorization;
    readonly ruleTypeRegistry: RuleTypeRegistry;
    readonly minimumScheduleInterval: AlertingRulesConfig['minimumScheduleInterval'];
    readonly maxScheduledPerMinute: AlertingRulesConfig['maxScheduledPerMinute'];
    readonly minimumScheduleIntervalInMs: number;
    readonly createAPIKey: (name: string) => Promise<CreateAPIKeyResult>;
    readonly getActionsClient: () => Promise<ActionsClient>;
    readonly actionsAuthorization: ActionsAuthorization;
    readonly getEventLogClient: () => Promise<IEventLogClient>;
    readonly internalSavedObjectsRepository: ISavedObjectsRepository;
    readonly encryptedSavedObjectsClient: EncryptedSavedObjectsClient;
    readonly kibanaVersion: PluginInitializerContext['env']['packageInfo']['version'];
    readonly auditLogger?: AuditLogger;
    readonly eventLogger?: IEventLogger;
    readonly changeTrackingService?: IScopedChangeTrackingService;
    readonly isAuthenticationTypeAPIKey: () => boolean;
    readonly getAuthenticationAPIKey: (name: string) => CreateAPIKeyResult;
    readonly cloneAPIKey: (name: string) => Promise<CreateAPIKeyResult>;
    readonly cloneApiKeysOnCreate?: boolean;
    /**
     * Synchronously invalidates the ES and/or UIAM API keys belonging to a rule, instead
     * of queueing them via {@link bulkMarkApiKeysForInvalidation} (which is only drained by
     * `invalidate_pending_api_keys` after `xpack.alerting.invalidateApiKeysTask.removalDelay`,
     * default `1h`). Used by callers that need the key invalidated immediately
     * (e.g. revoking compromised credentials, test cleanup).
     *
     * Errors are logged but not thrown; callers must not depend on this for security guarantees.
     *
     * Optional on the context so consumers (and tests) that never trigger
     * `invalidateApiKeyNow` on rule delete are not forced to wire it. In production it is
     * always provided by {@link RulesClientFactory}.
     */
    readonly invalidateApiKeyNow?: (params: {
        ruleName: string;
        apiKey?: string | null;
        uiamApiKey?: string | null;
    }) => Promise<void>;
    readonly connectorAdapterRegistry: ConnectorAdapterRegistry;
    readonly getAlertIndicesAlias: GetAlertIndicesAlias;
    readonly alertsService: AlertsService | null;
    readonly backfillClient: BackfillClient;
    readonly isSystemAction: (actionId: string) => boolean;
    readonly uiSettings: UiSettingsServiceStart;
    readonly shouldGrantUiam?: boolean;
    readonly isServerless: boolean;
    readonly featureFlags: FeatureFlagsStart;
}
export type NormalizedAlertAction = DistributiveOmit<RuleAction, 'actionTypeId'>;
export type NormalizedSystemAction = Omit<RuleSystemAction, 'actionTypeId'>;
export type NormalizedAlertDefaultActionWithGeneratedValues = Omit<RuleAction, 'uuid' | 'alertsFilter' | 'actionTypeId'> & {
    uuid: string;
    alertsFilter?: RawRuleAlertsFilter;
};
export type NormalizedAlertSystemActionWithGeneratedValues = Omit<RuleSystemAction, 'uuid' | 'actionTypeId'> & {
    uuid: string;
};
export type NormalizedAlertActionWithGeneratedValues = NormalizedAlertDefaultActionWithGeneratedValues | NormalizedAlertSystemActionWithGeneratedValues;
export type CreateAPIKeyResult = {
    apiKeysEnabled: false;
} | {
    apiKeysEnabled: true;
    result?: SecurityPluginGrantAPIKeyResult;
    uiamResult?: SecurityPluginGrantAPIKeyResult;
};
export type InvalidateAPIKeyResult = {
    apiKeysEnabled: false;
} | {
    apiKeysEnabled: true;
    result: SecurityPluginInvalidateAPIKeyResult;
};
export interface RuleBulkOperationAggregation {
    alertTypeId: {
        buckets: Array<{
            key: string[];
            doc_count: number;
        }>;
    };
}
export interface SavedObjectOptions {
    id?: string;
    migrationVersion?: Record<string, string>;
}
export interface ScheduleTaskOptions {
    id: string;
    consumer: string;
    ruleTypeId: string;
    schedule: IntervalSchedule;
    throwOnConflict: boolean;
}
export interface IndexType {
    [key: string]: unknown;
}
export interface MuteOptions extends IndexType {
    alertId: string;
    alertInstanceId: string;
}
export interface SnoozeOptions extends IndexType {
    snoozeSchedule: RuleSnoozeSchedule;
}
export interface BulkOptionsFilter {
    filter?: string | KueryNode;
}
export interface BulkOptionsIds {
    ids?: string[];
}
export type BulkOptions = BulkOptionsFilter | BulkOptionsIds;
export interface BulkOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export type BulkAction = 'DELETE' | 'ENABLE' | 'DISABLE' | 'GET' | 'BULK_EDIT' | 'BULK_EDIT_PARAMS';
export interface RuleBulkOperationAggregation {
    alertTypeId: {
        buckets: Array<{
            key: string[];
            doc_count: number;
        }>;
    };
}
export type DenormalizedAction = DistributiveOmit<NormalizedAlertActionWithGeneratedValues, 'id'> & {
    actionRef: string;
    actionTypeId: string;
};
interface DashboardItem {
    refId: string;
}
interface InvestigationGuide {
    blob: string;
}
export interface DenormalizedArtifacts {
    dashboards?: DashboardItem[];
    investigation_guide?: InvestigationGuide;
}
