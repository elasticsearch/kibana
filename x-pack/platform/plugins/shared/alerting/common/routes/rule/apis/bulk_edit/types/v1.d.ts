import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
import type { bulkEditRulesRequestBodySchemaV1 } from '..';
export type BulkEditRulesRequestBody = TypeOf<typeof bulkEditRulesRequestBodySchemaV1>;
interface BulkEditActionSkippedResult {
    id: RuleResponseV1['id'];
    name?: RuleResponseV1['name'];
    skip_reason: 'RULE_NOT_MODIFIED';
}
interface BulkEditOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export interface BulkEditRulesResponse<Params extends RuleParamsV1 = never> {
    body: {
        rules: Array<RuleResponseV1<Params>>;
        skipped: BulkEditActionSkippedResult[];
        errors: BulkEditOperationError[];
        total: number;
    };
}
export {};
