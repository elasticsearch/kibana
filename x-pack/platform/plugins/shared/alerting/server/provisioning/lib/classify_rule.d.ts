import type { ApiKeyToConvert, ProvisioningStatusDocs } from '../types';
import type { RuleForClassification } from './fetch_first_batch';
export type ClassifyRuleResult = {
    action: 'skip';
    status: ProvisioningStatusDocs;
} | {
    action: 'convert';
    rule: ApiKeyToConvert;
};
/**
 * Classifies a rule as either skip (with status doc) or convert (with rule payload).
 * Skip: no API key, already has UIAM key, or user-created key.
 * Convert: system-generated API key and no UIAM key yet.
 */
export declare const classifyRuleForUiamProvisioning: (rule: RuleForClassification) => ClassifyRuleResult;
export interface ClassifyRulesResult {
    provisioningStatusForSkippedRules: Array<ProvisioningStatusDocs>;
    apiKeysToConvert: Array<ApiKeyToConvert>;
}
/**
 * Classifies a batch of rules into skipped (with status docs) and to-convert (rule payloads).
 */
export declare const classifyRulesForUiamProvisioning: (rules: Array<RuleForClassification>) => ClassifyRulesResult;
