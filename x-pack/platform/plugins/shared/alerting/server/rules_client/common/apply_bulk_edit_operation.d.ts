import type { BulkEditOperation } from '../types';
import type { BulkEditRuleParamsOperation } from '../../application/rule/methods/bulk_edit_params/types';
/**
 * this method takes BulkEdit operation and applies it to rule, by mutating it
 * @param operation BulkEditOperation
 * @param rule object rule to update
 * @returns modified rule
 */
export declare const applyBulkEditOperation: <R extends object>(operation: BulkEditOperation | BulkEditRuleParamsOperation, rule: R) => {
    modifiedAttributes: R;
    isAttributeModified: boolean;
};
