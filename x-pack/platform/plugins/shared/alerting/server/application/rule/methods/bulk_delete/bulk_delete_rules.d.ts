import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkDeleteRulesResult, BulkDeleteRulesParams } from './types';
import type { RuleParams } from '../../types';
export declare const bulkDeleteRules: <Params extends RuleParams>(context: RulesClientContext, options: BulkDeleteRulesParams) => Promise<BulkDeleteRulesResult<Params>>;
