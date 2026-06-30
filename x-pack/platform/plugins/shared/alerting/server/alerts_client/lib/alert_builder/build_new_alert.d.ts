import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
interface BuildNewAlertOpts<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    legacyAlert: LegacyAlert<LegacyState, LegacyContext, ActionGroupIds | RecoveryActionGroupId>;
    rule: AlertRule;
    ruleData?: AlertRuleData;
    payload?: DeepPartial<AlertData>;
    runTimestamp?: string;
    timestamp: string;
    kibanaVersion: string;
    dangerouslyCreateAlertsInAllSpaces?: boolean;
}
/**
 * Builds a new alert document from the LegacyAlert class
 * Currently only populates framework fields and not any rule type specific fields
 */
export declare const buildNewAlert: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ legacyAlert, rule, ruleData, runTimestamp, timestamp, payload, kibanaVersion, dangerouslyCreateAlertsInAllSpaces, }: BuildNewAlertOpts<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId>) => Alert & AlertData;
export {};
