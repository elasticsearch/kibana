import type { RuleActionParams } from '../../../types';
import type { RuleTypeParams } from '../../..';
import type { Rule } from '../../../../common';
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
export declare const legacyRuleActionsSavedObjectType = "siem-detection-engine-rule-actions";
/**
 * This is how it is stored on disk in its "raw format" for 7.16+
 * @deprecated Remove this once the legacy notification/side car is gone
 */
export interface LegacyRuleAlertSavedObjectAction {
    group: string;
    params: RuleActionParams;
    action_type_id: string;
    actionRef: string;
}
/**
 * We keep this around to migrate and update data for the old deprecated rule actions saved object mapping but we
 * do not use it anymore within the code base. Once we feel comfortable that users are upgrade far enough and this is no longer
 * needed then it will be safe to remove this saved object and all its migrations.
 * @deprecated Remove this once the legacy notification/side car is gone
 */
export interface LegacyIRuleActionsAttributes extends Record<string, unknown> {
    actions: LegacyRuleAlertSavedObjectAction[];
    ruleThrottle: string;
    alertThrottle: string | null;
}
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
interface LegacyRuleNotificationAlertTypeParams extends RuleTypeParams {
    ruleAlertId: string;
}
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
export type LegacyRuleNotificationAlertType = Rule<LegacyRuleNotificationAlertTypeParams>;
export {};
