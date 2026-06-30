import type { SubFeature } from '@kbn/actions-plugin/common';
import type { RuleType, Rule } from '../../types';
/**
 * NOTE: Applications that want to show the alerting UIs will need to add
 * check against their features here until we have a better solution. This
 * will possibly go away with https://github.com/elastic/kibana/issues/52300.
 */
type Capabilities = Record<string, any>;
export declare const hasShowActionsCapability: (capabilities: Capabilities) => any;
export declare const hasSaveActionsCapability: (capabilities: Capabilities) => any;
export declare const hasExecuteActionsCapability: (capabilities: Capabilities, subFeature?: SubFeature) => any;
export declare const hasDeleteActionsCapability: (capabilities: Capabilities) => any;
export declare function hasAllPrivilege(ruleConsumer: Rule['consumer'], ruleType?: RuleType): boolean;
export declare function hasAllPrivilegeWithProducerCheck(ruleConsumer: Rule['consumer'], ruleType?: RuleType): boolean;
export declare const hasManageApiKeysCapability: (capabilities: Capabilities) => any;
export {};
