import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
interface BuildOngoingAlertOpts<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert & AlertData;
    legacyAlert: LegacyAlert<LegacyState, LegacyContext, ActionGroupIds | RecoveryActionGroupId>;
    rule: AlertRule;
    ruleData?: AlertRuleData;
    isImproving: boolean | null;
    payload?: DeepPartial<AlertData>;
    runTimestamp?: string;
    timestamp: string;
    kibanaVersion: string;
    dangerouslyCreateAlertsInAllSpaces?: boolean;
}
/**
 * Updates an existing alert document with data from the LegacyAlert class
 * Currently only populates framework fields and not any rule type specific fields
 */
export declare const buildOngoingAlert: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ alert, legacyAlert, payload, isImproving, rule, ruleData, runTimestamp, timestamp, kibanaVersion, dangerouslyCreateAlertsInAllSpaces, }: BuildOngoingAlertOpts<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId>) => Alert & AlertData;
export {};
