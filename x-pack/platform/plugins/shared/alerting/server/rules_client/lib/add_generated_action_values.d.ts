import type { NormalizedAlertAction, NormalizedAlertDefaultActionWithGeneratedValues, NormalizedAlertSystemActionWithGeneratedValues, NormalizedSystemAction, RulesClientContext } from '..';
export declare function addGeneratedActionValues(actions: NormalizedAlertAction[] | undefined, systemActions: NormalizedSystemAction[] | undefined, context: RulesClientContext): Promise<{
    actions: NormalizedAlertDefaultActionWithGeneratedValues[];
    systemActions: NormalizedAlertSystemActionWithGeneratedValues[];
}>;
