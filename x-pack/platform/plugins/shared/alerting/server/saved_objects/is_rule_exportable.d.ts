import type { Logger, SavedObject } from '@kbn/core/server';
import type { RuleTypeRegistry } from '../rule_type_registry';
export declare function isRuleExportable(rule: SavedObject, ruleTypeRegistry: RuleTypeRegistry, logger: Logger): boolean;
