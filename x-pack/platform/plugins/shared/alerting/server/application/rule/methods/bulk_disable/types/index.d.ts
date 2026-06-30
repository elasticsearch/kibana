import type { TypeOf } from '@kbn/config-schema';
import type { bulkDisableRulesRequestBodySchema } from '../schemas';
import type { SanitizedRule } from '../../../../../types';
import type { RuleParams } from '../../../types';
export interface BulkOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export type BulkDisableRulesRequestBody = TypeOf<typeof bulkDisableRulesRequestBodySchema>;
export interface BulkDisableRulesResult<Params extends RuleParams> {
    rules: Array<SanitizedRule<Params>>;
    errors: BulkOperationError[];
    total: number;
}
