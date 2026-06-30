import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { TypeOf } from '@kbn/config-schema';
import type { bulkDeleteRulesRequestBodySchema } from '../schemas';
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
export type BulkDeleteRulesRequestBody = TypeOf<typeof bulkDeleteRulesRequestBodySchema>;
export interface BulkDeleteRulesParams extends BulkDeleteRulesRequestBody {
    changeTracking?: Omit<RuleChangeTracking, 'action'>;
}
export interface BulkDeleteRulesResult<Params extends RuleParams> {
    rules: Array<SanitizedRule<Params>>;
    errors: BulkOperationError[];
    total: number;
    taskIdsFailedToBeDeleted: string[];
}
