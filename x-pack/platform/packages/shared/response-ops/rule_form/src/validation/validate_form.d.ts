import type { RuleFormData } from '../types';
import type { MinimumScheduleInterval, RuleFormActionsErrors, RuleFormBaseErrors, RuleFormParamsErrors, RuleTypeModel, RuleUiAction } from '../common';
export declare const validateAction: ({ action }: {
    action: RuleUiAction;
}) => RuleFormActionsErrors;
export declare function validateRuleBase({ formData, minimumScheduleInterval, }: {
    formData: RuleFormData;
    minimumScheduleInterval?: MinimumScheduleInterval;
}): RuleFormBaseErrors;
export declare const validateRuleParams: ({ formData, ruleTypeModel, isServerless, }: {
    formData: RuleFormData;
    ruleTypeModel: RuleTypeModel;
    isServerless?: boolean;
}) => RuleFormParamsErrors;
export declare const hasRuleBaseErrors: (errors: RuleFormBaseErrors) => boolean;
export declare const hasActionsError: (actionsErrors: Record<string, RuleFormActionsErrors>) => boolean;
export declare const hasParamsErrors: (errors: RuleFormParamsErrors | string | string[]) => boolean;
export declare const hasActionsParamsErrors: (actionsParamsErrors: Record<string, RuleFormParamsErrors>) => boolean;
export declare const hasRuleErrors: ({ baseErrors, paramsErrors, actionsErrors, actionsParamsErrors, }: {
    baseErrors: RuleFormBaseErrors;
    paramsErrors: RuleFormParamsErrors;
    actionsErrors: Record<string, RuleFormActionsErrors>;
    actionsParamsErrors: Record<string, RuleFormParamsErrors>;
}) => boolean;
