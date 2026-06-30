import type { TypeOf } from '@kbn/config-schema';
import type { bulkDisableRulesRequestBodySchemaV1 } from '..';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
export interface BulkOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export type BulkDisableRulesRequestBody = TypeOf<typeof bulkDisableRulesRequestBodySchemaV1>;
export interface BulkDisableRulesResponse<Params extends RuleParamsV1 = never> {
    body: {
        rules: Array<RuleResponseV1<Params>>;
        errors: BulkOperationError[];
        total: number;
    };
}
