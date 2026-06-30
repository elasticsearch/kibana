import type { SavedObjectsBulkUpdateObject, SavedObjectsFindResult } from '@kbn/core/server';
import type { RuleParams } from '../../../application/rule/types';
import type { BulkOperationError, RulesClientContext } from '../../types';
import type { BulkEditActionSkipResult } from '../../../types';
import { type RawRule } from '../../../types';
import type { ApiKeysMap, ParamsModifier, ShouldIncrementRevision, UpdateAttributesFnOpts, UpdateAttributesFnResult } from './types';
export interface UpdateRuleInMemoryOpts<Params extends RuleParams> {
    rule: SavedObjectsFindResult<RawRule>;
    apiKeysMap: ApiKeysMap;
    rules: Array<SavedObjectsBulkUpdateObject<RawRule>>;
    skipped: BulkEditActionSkipResult[];
    errors: BulkOperationError[];
    username: string | null;
    updateAttributesFn: (opts: UpdateAttributesFnOpts<Params>) => Promise<UpdateAttributesFnResult<Params>>;
    shouldInvalidateApiKeys: boolean;
    paramsModifier?: ParamsModifier<Params>;
    shouldIncrementRevision?: ShouldIncrementRevision<Params>;
}
export declare function updateRuleInMemory<Params extends RuleParams>(context: RulesClientContext, { rule, updateAttributesFn, paramsModifier, apiKeysMap, rules, skipped, errors, username, shouldInvalidateApiKeys, shouldIncrementRevision, }: UpdateRuleInMemoryOpts<Params>): Promise<void>;
