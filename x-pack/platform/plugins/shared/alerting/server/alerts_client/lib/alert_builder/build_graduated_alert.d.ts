import type { Alert } from '@kbn/alerts-as-data-utils';
import type { DeepPartial } from '@kbn/utility-types';
import type { Alert as LegacyAlert } from '../../../alert/alert';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData } from '../../../types';
import type { AlertRule, AlertRuleData } from '../../types';
interface BuildGraduatedAlertOpts<AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string> {
    alert: Alert & AlertData;
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
 * Builds an alert document for an alert that is graduating from the
 * `delayed` state to `active` for the first time.
 *
 * The predecessor doc (`alert`) is the previously-indexed delayed AAD doc,
 * which already carries the rule type fields reported during the delayed
 * runs. Those fields are preserved via deepmerge so the resulting active
 * doc is complete even if the executor does not report a fresh payload on
 * the run that triggers graduation (e.g. flap-hold reactivation).
 *
 * Field-level differences vs. `buildOngoingAlert`:
 * - `EVENT_ACTION` is `'open'` (the alert is becoming user-visible for the
 *   first time), not `'active'`.
 * - `ALERT_STATUS` is set explicitly to `ALERT_STATUS_ACTIVE`. The
 *   predecessor's status is `'delayed'`, so we must override it; the
 *   ongoing builder relies on the predecessor already being `'active'`.
 * - `ALERT_SEVERITY_IMPROVING` is set to `false`, mirroring `buildNewAlert`.
 *   There is no prior active state to compute an "improving" comparison
 *   against.
 * - `ALERT_PREVIOUS_ACTION_GROUP` is intentionally omitted. There was no
 *   previous *active* action group on this alert.
 */
export declare const buildGraduatedAlert: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ alert, legacyAlert, rule, ruleData, payload, runTimestamp, timestamp, kibanaVersion, dangerouslyCreateAlertsInAllSpaces, }: BuildGraduatedAlertOpts<AlertData, LegacyState, LegacyContext, ActionGroupIds, RecoveryActionGroupId>) => Alert & AlertData;
export {};
