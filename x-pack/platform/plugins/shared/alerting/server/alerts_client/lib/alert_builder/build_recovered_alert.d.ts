import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
interface BuildRecoveredAlertOpts<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert & AlertData;
    legacyAlert: LegacyAlert<LegacyState, LegacyContext, ActionGroupIds | RecoveryActionGroupId>;
    rule: AlertRule;
    ruleData?: AlertRuleData;
    runTimestamp?: string;
    recoveryActionGroup: string;
    payload?: DeepPartial<AlertData>;
    timestamp: string;
    kibanaVersion: string;
    dangerouslyCreateAlertsInAllSpaces?: boolean;
}
/**
 * Updates an active alert document to recovered
 * Currently only populates framework fields and not any rule type specific fields
 */
export declare const buildRecoveredAlert: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ alert, legacyAlert, rule, ruleData, timestamp, payload, runTimestamp, recoveryActionGroup, kibanaVersion, dangerouslyCreateAlertsInAllSpaces, }: BuildRecoveredAlertOpts<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId>) => Alert & AlertData;
export {};
