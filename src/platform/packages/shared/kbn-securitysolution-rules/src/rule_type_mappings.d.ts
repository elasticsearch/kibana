/**
 * Maps legacy rule types to RAC rule type IDs.
 */
export declare const ruleTypeMappings: {
    eql: "siem.eqlRule";
    esql: "siem.esqlRule";
    machine_learning: "siem.mlRule";
    query: "siem.queryRule";
    saved_query: "siem.savedQueryRule";
    threat_match: "siem.indicatorRule";
    threshold: "siem.thresholdRule";
    new_terms: "siem.newTermsRule";
};
type RuleTypeMappings = typeof ruleTypeMappings;
export type RuleType = keyof RuleTypeMappings;
export type RuleTypeId = RuleTypeMappings[keyof RuleTypeMappings];
export {};
