import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkGetRulesParams } from './types';
import type { RuleParams } from '../../types';
import type { BulkGetRulesResponse } from './types/bulk_get_rules_response';
export declare function bulkGetRules<Params extends RuleParams = never>(context: RulesClientContext, params: BulkGetRulesParams): Promise<BulkGetRulesResponse<Params>>;
