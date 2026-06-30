import type { ActionVariable, RuleActionParam } from '@kbn/alerting-types';
export declare const validateParamsForWarnings: ({ value, publicBaseUrl, actionVariables, }: {
    value: RuleActionParam;
    publicBaseUrl?: string;
    actionVariables?: ActionVariable[];
}) => string | null;
