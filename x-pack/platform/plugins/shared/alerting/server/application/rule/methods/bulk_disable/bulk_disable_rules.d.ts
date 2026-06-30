import type { BulkDisableRulesResult, BulkDisableRulesRequestBody } from './types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
export declare const bulkDisableRules: <Params extends RuleParams>(context: RulesClientContext, options: BulkDisableRulesRequestBody) => Promise<BulkDisableRulesResult<Params>>;
