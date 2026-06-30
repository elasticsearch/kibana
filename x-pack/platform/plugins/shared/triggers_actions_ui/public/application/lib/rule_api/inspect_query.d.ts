import type { HttpSetup } from '@kbn/core/public';
export interface QueryInspectorResult {
    index: string;
    request: Record<string, unknown>;
    response?: Record<string, unknown>;
    label?: string;
}
export interface QueryInspectorResponse {
    queries: QueryInspectorResult[];
}
export declare function loadRuleQueryInspector({ http, ruleId, mode, alertId, }: {
    http: HttpSetup;
    ruleId: string;
    mode?: 'build' | 'execute';
    alertId?: string;
}): Promise<QueryInspectorResponse>;
