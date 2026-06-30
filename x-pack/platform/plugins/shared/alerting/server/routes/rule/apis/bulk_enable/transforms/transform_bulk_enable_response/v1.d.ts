import type { BulkEnableRulesResult } from '../../../../../../application/rule/methods/bulk_enable/types';
import type { RuleParams } from '../../../../../../application/rule/types';
export declare const transformBulkEnableResponseInternal: <Params extends RuleParams = never>(response: BulkEnableRulesResult<Params>) => {
    rules: import("../../../../../../../common/routes/rule/response").RuleResponseInternal<Record<string, any>>[];
    errors: import("../../../../../../application/rule/methods/bulk_enable/types").BulkEnableRulesError[];
    total: number;
    task_ids_failed_to_be_enabled: string[];
};
