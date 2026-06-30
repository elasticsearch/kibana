import type { Alert } from '@kbn/alerts-as-data-utils';
import type { Alert as LegacyAlert } from '../../alert';
import type { ActionGroup, AlertInstanceState, AlertInstanceContext, RuleAlertData } from '../../types';
export declare const isAlertImproving: <AlertData extends RuleAlertData, LegacyState extends AlertInstanceState, LegacyContext extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>(alert: Alert & AlertData, legacyAlert: LegacyAlert<LegacyState, LegacyContext, ActionGroupIds | RecoveryActionGroupId>, actionGroups: Array<ActionGroup<string>>) => boolean | null;
