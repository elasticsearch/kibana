import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
import type { BulkCreateRulesParams, BulkCreateRulesResult } from './types';
export declare function bulkCreateRules<Params extends RuleParams = never>(context: RulesClientContext, params: BulkCreateRulesParams<Params>): Promise<BulkCreateRulesResult>;
