import type { RuleTypeModel, RuleTypeParams, RuleTypeWithDescription } from '../common';
export declare const getActionGroups: ({ ruleType, ruleTypeModel, }: {
    ruleType: RuleTypeWithDescription;
    ruleTypeModel: RuleTypeModel<RuleTypeParams>;
}) => ({
    omitMessageVariables: string;
    defaultActionMessage: string;
    id: string;
    name: string;
    severity?: import("@kbn/alerting-types").ActionGroupSeverity;
} | {
    defaultActionMessage: string | undefined;
    id: string;
    name: string;
    severity?: import("@kbn/alerting-types").ActionGroupSeverity;
})[];
export declare const getSelectedActionGroup: ({ group, ruleType, ruleTypeModel, }: {
    group: string;
    ruleType: RuleTypeWithDescription;
    ruleTypeModel: RuleTypeModel<RuleTypeParams>;
}) => {
    defaultActionMessage: string | undefined;
    id: string;
    name: string;
    severity?: import("@kbn/alerting-types").ActionGroupSeverity;
} | undefined;
