import type { RuleParams } from '../../../types/rule';
import type { SanitizedRule } from '../../../../../types';
export interface BulkEnableRulesParams {
    filter?: string;
    ids?: string[];
}
export interface BulkEnableRulesError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export interface BulkEnableRulesResult<Params extends RuleParams> {
    rules: Array<SanitizedRule<Params>>;
    errors: BulkEnableRulesError[];
    total: number;
    taskIdsFailedToBeEnabled: string[];
}
