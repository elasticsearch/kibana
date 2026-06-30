import type { RulesClientContext, CreateAPIKeyResult } from '../types';
export interface ResolvedAPIKey {
    createdAPIKey: CreateAPIKeyResult | null;
    isAuthTypeApiKey: boolean;
}
export interface RuleApiKeyOwnership {
    apiKeyCreatedByUser?: boolean | null;
}
export declare const resolveRuleAPIKey: (context: RulesClientContext, name: string, enabled: boolean, apiKeyOwnership?: RuleApiKeyOwnership) => Promise<ResolvedAPIKey>;
