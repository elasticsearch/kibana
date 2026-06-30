import type { HttpStart } from '@kbn/core-http-browser';
export interface Rule {
    id: string;
    muted_alert_ids: string[];
}
export interface FindRulesResponse {
    data: Rule[];
}
export interface GetMutedAlertsInstancesByRuleParams {
    ruleIds: string[];
    http: HttpStart;
    signal?: AbortSignal;
}
export declare const getMutedAlertsInstancesByRule: ({ http, ruleIds, signal, }: GetMutedAlertsInstancesByRuleParams) => Promise<FindRulesResponse>;
