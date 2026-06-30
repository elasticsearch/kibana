import type { Logger } from '@kbn/core/server';
import type { AlertInstanceContext, AlertInstanceState } from '@kbn/alerting-state-types';
import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
import type { UntypedNormalizedRuleType } from '../../../rule_type_registry';
import type { IIndexPatternString } from '../../../alerts_service/resource_installer_utils';
import type { TrackedAADAlerts } from '../../types';
import type { LegacyAlertsClient } from '../../legacy_alerts_client';
interface AlertBuilderOpts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    rule: AlertRule;
    reportedAlerts: Record<string, DeepPartial<AlertData>>;
    legacyAlertsClient: LegacyAlertsClient<State, Context, ActionGroupIds, RecoveryActionGroupId>;
    currentTime: string;
    logger: Logger;
    trackedAlerts: TrackedAADAlerts<AlertData>;
    ruleType: UntypedNormalizedRuleType;
    alertRuleData: AlertRuleData;
    runTimestampString?: string;
    kibanaVersion: string;
    indexTemplateAndPattern: IIndexPatternString;
    ruleInfoMessage: string;
    logTags: {
        tags: string[];
    };
    isUsingDataStreams: boolean;
}
export declare class AlertBuilder<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    private readonly rule;
    private readonly alertRuleData;
    private readonly currentTime;
    private readonly logger;
    private readonly trackedAlerts;
    private readonly ruleType;
    private readonly runTimestampString?;
    private readonly kibanaVersion;
    private readonly createAlertsInAllSpaces;
    private readonly indexTemplateAndPattern;
    private readonly ruleInfoMessage;
    private readonly logTags;
    private readonly isUsingDataStreams;
    private readonly reportedAlerts;
    private legacyAlertsClient;
    constructor({ rule, legacyAlertsClient, currentTime, logger, trackedAlerts, ruleType, alertRuleData, runTimestampString, reportedAlerts, kibanaVersion, indexTemplateAndPattern, ruleInfoMessage, logTags, isUsingDataStreams, }: AlertBuilderOpts<State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>);
    buildAlerts(): Array<Alert & AlertData>;
    getBulkBody(alertsToIndex: Array<Alert & AlertData>): any[];
    private getAlertsWithValidIndexNames;
    private buildActiveAlerts;
    private buildRecoveredAlerts;
    private buildDelayedAlerts;
    private getBulkOperation;
    private isRecoveredDelayedAlert;
}
export {};
