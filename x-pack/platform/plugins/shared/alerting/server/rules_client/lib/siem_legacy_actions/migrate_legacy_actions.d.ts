import type { SavedObject } from '@kbn/core/server';
import type { RulesClientContext } from '../..';
import type { RawRule } from '../../../types';
interface BulkMigrateLegacyActionsParams {
    context: RulesClientContext;
    rules: Array<SavedObject<RawRule>>;
    skipActionsValidation?: boolean;
}
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 * migrates SIEM legacy actions and merges rule actions and references
 * @param context RulesClient context
 * @param rules Rules to check for legacy actions
 * @param skipActionsValidation Skip validating actions after transformation
 * @returns IDs of rules that had actions migrated
 */
export declare const bulkMigrateLegacyActions: ({ context, rules, skipActionsValidation, }: BulkMigrateLegacyActionsParams) => Promise<string[]>;
export {};
