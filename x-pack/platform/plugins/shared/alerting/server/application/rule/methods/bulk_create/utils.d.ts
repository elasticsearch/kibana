import type { BulkOperationError, RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
import type { PreparedRule, PrepareRuleArgs, ApiKeyEntry } from './types';
export declare const prepareRule: <Params extends RuleParams>({ context, actionsClient, username, id, rule, apiKeys, invalidKeys, }: PrepareRuleArgs<Params>) => Promise<{
    prepared?: PreparedRule;
    error?: BulkOperationError;
}>;
export declare const invalidateKeys: (entries: Iterable<ApiKeyEntry>, context: RulesClientContext) => Promise<void>;
