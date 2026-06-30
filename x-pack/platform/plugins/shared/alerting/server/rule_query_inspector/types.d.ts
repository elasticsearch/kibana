import type { KibanaRequest } from '@kbn/core/server';
export interface RuleQueryInspectorResult {
    index: string;
    request: Record<string, unknown>;
    response?: Record<string, unknown>;
    label?: string;
}
export interface RuleQueryInspectorResponse {
    queries: RuleQueryInspectorResult[];
}
export interface RuleQueryInspectorTimeRange {
    gte: string;
    lte: string;
}
export type RuleQueryInspectorFn = (request: KibanaRequest, ruleParams: Record<string, unknown>, mode: 'build' | 'execute', timeRange: RuleQueryInspectorTimeRange | undefined) => Promise<RuleQueryInspectorResponse>;
