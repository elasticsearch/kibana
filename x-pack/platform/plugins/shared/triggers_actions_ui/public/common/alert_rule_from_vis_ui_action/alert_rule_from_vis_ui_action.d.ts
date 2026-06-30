import type { ActionTypeRegistryContract, AlertRuleFromVisUIActionData, RuleTypeRegistryContract } from '@kbn/alerts-ui-shared';
import type { LensApi } from '@kbn/lens-plugin/public';
import type { Action } from '@kbn/ui-actions-plugin/public';
import { type ServiceDependencies } from './rule_flyout_component';
interface Context {
    data?: AlertRuleFromVisUIActionData;
    embeddable: LensApi;
}
export declare class AlertRuleFromVisAction implements Action<Context> {
    private ruleTypeRegistry;
    private actionTypeRegistry;
    private startDependencies;
    type: string;
    id: string;
    constructor(ruleTypeRegistry: RuleTypeRegistryContract, actionTypeRegistry: ActionTypeRegistryContract, startDependencies: ServiceDependencies);
    getIconType: () => string;
    isCompatible({ embeddable }: Context): Promise<boolean>;
    getDisplayName: () => string;
    shouldAutoExecute: () => Promise<boolean>;
    execute({ embeddable, data }: Context): Promise<void>;
}
export {};
