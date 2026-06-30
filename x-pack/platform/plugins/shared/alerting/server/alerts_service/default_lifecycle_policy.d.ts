import type { IlmPolicy } from '@elastic/elasticsearch/lib/api/types';
/**
 * Default alert index ILM policy
 * - _meta.managed: notify users this is a managed policy and should be modified
 *     at their own risk
 * - no delete phase as we want to keep these indices around indefinitely
 *
 * This should be used by all alerts-as-data indices
 */
export declare const DEFAULT_ALERTS_ILM_POLICY_NAME = ".alerts-ilm-policy";
export declare const DEFAULT_ALERTS_ILM_POLICY: IlmPolicy;
