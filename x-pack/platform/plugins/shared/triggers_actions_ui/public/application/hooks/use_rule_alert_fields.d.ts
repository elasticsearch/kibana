import type { HttpStart } from '@kbn/core-http-browser';
import type { ActionVariable } from '@kbn/alerting-plugin/common';
export declare function useRuleTypeAlertFields(http: HttpStart, ruleTypeId: string | undefined, enabled: boolean): {
    isLoading: boolean;
    fields: ActionVariable[];
};
