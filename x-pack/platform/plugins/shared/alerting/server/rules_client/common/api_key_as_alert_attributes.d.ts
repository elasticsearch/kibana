import type { FeatureFlagsStart } from '@kbn/core-feature-flags-server';
import type { RawRule } from '../../types';
import type { CreateAPIKeyResult } from '../types';
import type { RuleDomain } from '../../application/rule/types';
export declare const API_KEY_ATTRIBUTES_TO_STRIP: readonly ["apiKey", "apiKeyOwner", "apiKeyCreatedByUser", "uiamApiKey"];
/**
 * @deprecated TODO (http-versioning) make sure this is deprecated
 * once all of the RawRules are phased out
 */
export declare function apiKeyAsAlertAttributes(apiKey: CreateAPIKeyResult | null, username: string | null, createdByUser: boolean): Pick<RawRule, 'apiKey' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'uiamApiKey'>;
export declare function apiKeyAsRuleDomainProperties(apiKey: CreateAPIKeyResult | null, username: string | null, createdByUser: boolean): Pick<RuleDomain, 'apiKey' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'uiamApiKey'>;
/**
 * Determines if the missing UIAM API key tag should be added to a rule.
 * The tag is added when:
 * - The environment is serverless
 * - The feature flag for provisioning UIAM API keys is enabled
 * - uiamApiKey is not set (null/undefined)
 * - AND apiKeyCreatedByUser is false (system-created API key)
 *
 * This indicates that the UIAM key rollout attempted to create a UIAM key but failed.
 */
export declare function shouldAddMissingUiamKeyTag(uiamApiKey: string | null | undefined, apiKeyCreatedByUser: boolean | null | undefined, isServerless: boolean, featureFlags: FeatureFlagsStart): Promise<boolean>;
/**
 * Adds the missing UIAM API key tag to the tags array if needed.
 * Returns a new array with the tag appended if the condition is met.
 */
export declare function addMissingUiamKeyTagIfNeeded(tags: string[], uiamApiKey: string | null | undefined, apiKeyCreatedByUser: boolean | null | undefined, isServerless: boolean, featureFlags: FeatureFlagsStart): Promise<string[]>;
