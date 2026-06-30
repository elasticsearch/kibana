import type { AlertConsumers, DefaultAlertFieldName } from '@kbn/rule-data-utils';
import type { PhrasesFilter } from '@kbn/es-query';
export type AlertsFeatureIdsFilter = PhrasesFilter & {
    meta: PhrasesFilter['meta'] & {
        ruleTypeIds: string[];
        consumers: string[];
    };
};
/**
 * Creates a match_phrase filter without an index pattern
 */
export declare const createMatchPhraseFilter: (field: DefaultAlertFieldName, value: string) => AlertsFeatureIdsFilter;
/**
 * Creates a match_phrases filter without an index pattern
 */
export declare const createMatchPhrasesFilter: (field: DefaultAlertFieldName, values: string[], alias?: string | null) => AlertsFeatureIdsFilter;
/**
 * Creates a match_phrase filter targeted to filtering alerts by producer
 */
export declare const createRuleProducerFilter: (producer: AlertConsumers) => AlertsFeatureIdsFilter;
/**
 * Creates a match_phrase filter targeted to filtering alerts by rule type ids
 */
export declare const createRuleTypesFilter: (ruleTypeIds: string[], consumers: string[], alias: string) => AlertsFeatureIdsFilter;
