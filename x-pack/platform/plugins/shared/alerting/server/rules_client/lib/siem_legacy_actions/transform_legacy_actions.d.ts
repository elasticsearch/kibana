import type { SavedObjectReference } from '@kbn/core/server';
import type { RawRuleAction } from '../../../types';
import type { LegacyIRuleActionsAttributes } from './types';
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 * transforms siem legacy actions {@link LegacyIRuleActionsAttributes} objects into {@link RawRuleAction}
 * @param legacyActionsAttr
 * @param references
 * @returns array of RawRuleAction
 */
export declare const transformFromLegacyActions: (legacyActionsAttr: LegacyIRuleActionsAttributes, references: SavedObjectReference[]) => RawRuleAction[];
