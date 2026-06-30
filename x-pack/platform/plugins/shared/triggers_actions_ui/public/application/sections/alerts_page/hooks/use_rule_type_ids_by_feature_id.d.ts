import { AlertConsumers } from '@kbn/rule-data-utils';
import type { RuleTypeIndex } from '../../../../types';
export type RuleTypeIdsByFeatureId<T = string[]> = Partial<Record<typeof AlertConsumers.SIEM | typeof AlertConsumers.OBSERVABILITY | typeof AlertConsumers.STACK_ALERTS | typeof AlertConsumers.ML, T>>;
/**
 * Groups all rule type ids under their respective feature id
 */
export declare const useRuleTypeIdsByFeatureId: (ruleTypesIndex: RuleTypeIndex) => Partial<Record<"ml" | "observability" | "siem" | "stackAlerts", string[]>>;
