import type { RegistryRuleType } from '../../rule_type_registry';
import type { RulesClient } from '../../rules_client';
export declare const validateInternalRuleTypesByQuery: ({ req, ruleTypes, rulesClient, operationText, }: {
    req: {
        filter?: string;
        ids?: string[];
    };
    ruleTypes: Map<string, RegistryRuleType>;
    rulesClient: RulesClient;
    operationText: string;
}) => Promise<void>;
export declare const validateInternalRuleTypesBulkOperation: ({ ids, ruleTypes, rulesClient, operationText, }: {
    ids?: string[];
    ruleTypes: Map<string, RegistryRuleType>;
    rulesClient: RulesClient;
    operationText: string;
}) => Promise<void>;
