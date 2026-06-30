import type { ActionVariable, RuleActionParam } from '@kbn/alerting-plugin/common';
export declare function validateParamsForWarnings(value: RuleActionParam, publicBaseUrl: string | undefined, actionVariables: ActionVariable[] | undefined): string | null;
