import type { RecoveredActionGroupId, ActionGroup } from '@kbn/alerting-types';
export type ReservedActionGroups<RecoveryActionGroupId extends string> = RecoveryActionGroupId | RecoveredActionGroupId;
export type WithoutReservedActionGroups<ActionGroupIds extends string, RecoveryActionGroupId extends string> = ActionGroupIds extends ReservedActionGroups<RecoveryActionGroupId> ? never : ActionGroupIds;
export declare function getBuiltinActionGroups<RecoveryActionGroupId extends string>(customRecoveryGroup?: ActionGroup<RecoveryActionGroupId>): [ActionGroup<ReservedActionGroups<RecoveryActionGroupId>>];
export type { RecoveredActionGroupId, DefaultActionGroupId } from '@kbn/alerting-types';
export { RecoveredActionGroup } from '@kbn/alerting-types';
