import type { TypeOf } from '@kbn/config-schema';
import type { bulkDeleteRulesRequestBodySchemaV1 } from '..';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
export interface BulkOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export type BulkDeleteRulesRequestBody = TypeOf<typeof bulkDeleteRulesRequestBodySchemaV1>;
export interface BulkDeleteRulesResponse<Params extends RuleParamsV1 = never> {
    body: {
        rules: Array<RuleResponseV1<Params>>;
        errors: BulkOperationError[];
        total: number;
        taskIdsFailedToBeDeleted: string[];
    };
}
