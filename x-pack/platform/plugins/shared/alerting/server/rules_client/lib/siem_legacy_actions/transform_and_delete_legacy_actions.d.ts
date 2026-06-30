import type { SavedObject, SavedObjectReference } from '@kbn/core/server';
import type { RulesClientContext } from '../..';
import type { RawRule, RawRuleAction } from '../../../types';
type TransformAndDeleteLegacyActions = (context: RulesClientContext, rules: Array<SavedObject<RawRule>>, skipActionsValidation: boolean) => TransformAndDeleteLegacyActionsReturn;
type TransformAndDeleteLegacyActionsReturn = Promise<Record<string, {
    transformedActions: RawRuleAction[];
    transformedReferences: SavedObjectReference[];
}>>;
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 * retrieves legacy actions for SIEM rule and deletes associated sidecar SO
 * @param context RulesClient context
 * @param params.ruleId - id of rule to be migrated
 * @returns
 */
export declare const transformAndDeleteLegacyActions: TransformAndDeleteLegacyActions;
export {};
