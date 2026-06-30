import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
import type { bulkEnableBodySchemaV1 } from '..';
export type BulkEnableRulesRequestBody = TypeOf<typeof bulkEnableBodySchemaV1>;
interface BulkEnableOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
export interface BulkEnableRulesResponse<Params extends RuleParamsV1 = never> {
    body: {
        rules: Array<RuleResponseV1<Params>>;
        errors: BulkEnableOperationError[];
        total: number;
        task_ids_failed_to_be_enabled: string[];
    };
}
export {};
