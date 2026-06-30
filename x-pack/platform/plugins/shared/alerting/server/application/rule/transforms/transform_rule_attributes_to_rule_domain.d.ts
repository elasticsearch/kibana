import type { Logger } from '@kbn/core/server';
import type { SavedObjectReference } from '@kbn/core/server';
import type { RuleDomain, Monitoring, RuleParams } from '../types';
import type { RawRule } from '../../../types';
import type { UntypedNormalizedRuleType } from '../../../rule_type_registry';
export declare const updateMonitoring: ({ monitoring, timestamp, duration, }: {
    monitoring: Monitoring;
    timestamp: string;
    duration?: number;
}) => Monitoring;
interface TransformEsToRuleParams {
    id: RuleDomain['id'];
    logger: Logger;
    ruleType: UntypedNormalizedRuleType;
    references?: SavedObjectReference[];
}
export declare const transformRuleAttributesToRuleDomain: <Params extends RuleParams = never>(esRule: RawRule, transformParams: TransformEsToRuleParams, isSystemAction: (connectorId: string) => boolean) => RuleDomain<Params>;
export {};
