import type { RawRule } from '../../../types';
import type { RuleDomain } from '../types';
import type { DenormalizedAction, DenormalizedArtifacts } from '../../../rules_client';
interface TransformRuleToEsParams {
    legacyId: RawRule['legacyId'];
    paramsWithRefs: RawRule['params'];
    meta?: RawRule['meta'];
}
export declare const transformRuleDomainToRuleAttributes: ({ actionsWithRefs, artifactsWithRefs, rule, params, }: {
    actionsWithRefs: DenormalizedAction[];
    artifactsWithRefs: DenormalizedArtifacts;
    rule: Omit<RuleDomain, "actions" | "params" | "systemActions">;
    params: TransformRuleToEsParams;
}) => RawRule;
export {};
