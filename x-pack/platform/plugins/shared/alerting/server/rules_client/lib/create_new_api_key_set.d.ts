import type { RawRule } from '../../types';
import type { RuleApiKeyOwnership } from '../common';
import type { RulesClientContext } from '../types';
export declare function createNewAPIKeySet(context: RulesClientContext, { id, ruleName, username, shouldUpdateApiKey, errorMessage, apiKeyOwnership, }: {
    id: string;
    ruleName: string;
    username: string | null;
    shouldUpdateApiKey: boolean;
    errorMessage?: string;
    apiKeyOwnership?: RuleApiKeyOwnership;
}): Promise<Pick<RawRule, 'apiKey' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'uiamApiKey'>>;
