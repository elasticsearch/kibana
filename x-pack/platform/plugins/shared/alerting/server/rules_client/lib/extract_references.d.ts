import type { SavedObjectReference } from '@kbn/core/server';
import type { RuleTypeParams, Artifacts } from '../../types';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { DenormalizedAction, NormalizedAlertActionWithGeneratedValues } from '../types';
import type { RulesClientContext, DenormalizedArtifacts } from '../types';
export declare function extractReferences<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams>(context: RulesClientContext, ruleType: UntypedNormalizedRuleType, ruleActions: NormalizedAlertActionWithGeneratedValues[], ruleParams: Params, ruleArtifacts: Artifacts): Promise<{
    actions: DenormalizedAction[];
    artifacts: Required<DenormalizedArtifacts>;
    params: ExtractedParams;
    references: SavedObjectReference[];
}>;
