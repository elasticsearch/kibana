import type { AlertRuleFromVisUIActionData } from '@kbn/alerts-ui-shared';
import type { LensApi } from '@kbn/lens-plugin/public';
import type { RuleTypeRegistryContract, ActionTypeRegistryContract } from '@kbn/alerts-ui-shared';
import type { ServiceDependencies } from './rule_flyout_component';
export declare const loadAlertRuleFlyoutContent: ({ embeddable, data, closeFlyout, startDependencies, ruleTypeRegistry, actionTypeRegistry, }: {
    embeddable: LensApi;
    data?: AlertRuleFromVisUIActionData;
    closeFlyout: () => void;
    startDependencies: ServiceDependencies;
    ruleTypeRegistry: RuleTypeRegistryContract;
    actionTypeRegistry: ActionTypeRegistryContract;
}) => Promise<JSX.Element>;
