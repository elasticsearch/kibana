import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
interface BuildDelayedAlertOpts<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
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
 * Builds an alert document for an alert that is in the `delayed` state
 * (i.e. an alert that the executor has reported but that has not yet
 * crossed `alertDelay`).
 *
 * The document includes the rule type payload from this run so that when
 * the alert later transitions to `active` (either by graduating past
 * `alertDelay` or via flap-hold reactivation), the predecessor doc carries
 * enough information for the active builder to produce a complete document
 * even when the executor does not report a payload on the graduation run.
 */
export declare const buildDelayedAlert: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ legacyAlert, rule, ruleData, payload, runTimestamp, timestamp, kibanaVersion, dangerouslyCreateAlertsInAllSpaces, }: BuildDelayedAlertOpts<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId>) => Alert & AlertData;
export {};
