interface ValidateRuleTypeParams {
    ruleTypeId: string;
    ruleTypes: Map<string, {
        internallyManaged?: boolean;
    }>;
    operationText: string;
}
export declare const validateInternalRuleType: ({ ruleTypeId, ruleTypes, operationText, }: ValidateRuleTypeParams) => void;
export {};
