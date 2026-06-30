import type { BulkEditResult } from '../../../../rules_client/common/bulk_edit/types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { BulkEditOptionsFilter, BulkEditOptionsIds } from './types';
import type { RuleParams } from '../../types';
export declare const bulkEditFieldsToExcludeFromRevisionUpdates: Set<string>;
export type BulkEditOptions<Params extends RuleParams> = BulkEditOptionsFilter<Params> | BulkEditOptionsIds<Params>;
export declare function bulkEditRules<Params extends RuleParams>(context: RulesClientContext, options: BulkEditOptions<Params>): Promise<BulkEditResult<Params>>;
