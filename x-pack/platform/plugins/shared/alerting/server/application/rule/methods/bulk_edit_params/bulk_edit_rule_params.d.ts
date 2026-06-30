import type { BulkEditResult } from '../../../../rules_client/common/bulk_edit/types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkEditRuleParamsOptions } from './types';
import type { RuleParams } from '../../types';
export declare function bulkEditRuleParamsWithReadAuth<Params extends RuleParams>(context: RulesClientContext, options: BulkEditRuleParamsOptions<Params>): Promise<BulkEditResult<Params>>;
